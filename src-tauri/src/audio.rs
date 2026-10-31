use std::num::NonZero;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Source};

/// Thread-safe shared parameters for real-time DSP synthesis
#[derive(Clone)]
pub struct DspParams {
    pub carrier_hz: f32,
    pub offset_hz: f32,
    pub amplitude: f32,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
    pub waveform: String, // "sine", "binaural", "isochronic"
    pub noise_type: String, // "none", "white", "pink", "brown"
    pub noise_blend_ratio: f32, // 0.0 to 1.0
}

impl Default for DspParams {
    fn default() -> Self {
        Self {
            carrier_hz: 136.1,
            offset_hz: 0.0,
            amplitude: 0.7,
            harmonic_n: 3,
            harmonic_m: 4,
            waveform: "sine".to_string(),
            noise_type: "brown".to_string(),
            noise_blend_ratio: 0.25,
        }
    }
}

/// Continuous stereo DSP audio source implementing rodio::Source
pub struct NeuroacousticSource {
    sample_rate: u32,
    params: Arc<Mutex<DspParams>>,
    is_playing: Arc<AtomicBool>,
    is_recording: Arc<AtomicBool>,
    recorded_buffer: Arc<Mutex<Vec<f32>>>,

    // DSP oscillator state (fundamental clocks)
    sample_clock_left: f64,
    sample_clock_right: f64,
    sample_clock_iso: f64,

    // Pink noise filter registers (Paul Kellet's algorithm)
    pink_b0: f32,
    pink_b1: f32,
    pink_b2: f32,
    pink_b3: f32,
    pink_b4: f32,
    pink_b5: f32,
    pink_b6: f32,

    // Brown noise leaky integrator
    brown_acc: f32,

    // Simple PRNG state (Xorshift32)
    rng_state: u32,

    // Channel toggle (0 = Left, 1 = Right)
    channel_toggle: u8,
    current_left_sample: f32,
}

impl NeuroacousticSource {
    pub fn new(
        sample_rate: u32,
        params: Arc<Mutex<DspParams>>,
        is_playing: Arc<AtomicBool>,
        is_recording: Arc<AtomicBool>,
        recorded_buffer: Arc<Mutex<Vec<f32>>>,
    ) -> Self {
        Self {
            sample_rate,
            params,
            is_playing,
            is_recording,
            recorded_buffer,
            sample_clock_left: 0.0,
            sample_clock_right: 0.0,
            sample_clock_iso: 0.0,
            pink_b0: 0.0,
            pink_b1: 0.0,
            pink_b2: 0.0,
            pink_b3: 0.0,
            pink_b4: 0.0,
            pink_b5: 0.0,
            pink_b6: 0.0,
            brown_acc: 0.0,
            rng_state: 0x12345678,
            channel_toggle: 0,
            current_left_sample: 0.0,
        }
    }

    /// Fast uniform random float in [-1.0, 1.0]
    #[inline]
    fn next_white_noise(&mut self) -> f32 {
        let mut x = self.rng_state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng_state = x;
        (x as f32 / 2147483648.0) - 1.0
    }

    /// Pink noise generation (1/f spectral density)
    #[inline]
    fn next_pink_noise(&mut self) -> f32 {
        let white = self.next_white_noise();
        self.pink_b0 = 0.99886 * self.pink_b0 + white * 0.0555179;
        self.pink_b1 = 0.99332 * self.pink_b1 + white * 0.0750759;
        self.pink_b2 = 0.96900 * self.pink_b2 + white * 0.1538520;
        self.pink_b3 = 0.86650 * self.pink_b3 + white * 0.3104856;
        self.pink_b4 = 0.55000 * self.pink_b4 + white * 0.5329522;
        self.pink_b5 = -0.7616 * self.pink_b5 - white * 0.0168980;
        let pink = self.pink_b0 + self.pink_b1 + self.pink_b2 + self.pink_b3 + self.pink_b4 + self.pink_b5 + self.pink_b6 + white * 0.5362;
        self.pink_b6 = white * 0.115926;
        (pink * 0.12).clamp(-1.0, 1.0)
    }

    /// Brown noise generation (-6dB/octave deep rumble)
    #[inline]
    fn next_brown_noise(&mut self) -> f32 {
        let white = self.next_white_noise();
        self.brown_acc = (self.brown_acc + (0.02 * white)) / 1.02;
        (self.brown_acc * 3.5).clamp(-1.0, 1.0)
    }

    /// Synthesizes acoustic wave with harmonic overtone structure controlled by n and m
    #[inline]
    fn synthesize_harmonic_tone(&self, clock: f64, n: u32, m: u32) -> f32 {
        let pi2 = std::f64::consts::TAU;

        // 1. Fundamental carrier tone
        let fundamental = (clock * pi2).sin();

        // 2. Harmonic N overtone (higher resonant chime overtone)
        let n_val = n.max(1) as f64;
        let overtone_n = ((clock * n_val) * pi2).sin();
        let amp_n = 0.28 / (n_val as f32).sqrt();

        // 3. Harmonic M overtone (musical harmonic ratio)
        let m_val = m.max(1) as f64;
        let overtone_m = ((clock * (m_val * 0.5 + 0.5)) * pi2).sin();
        let amp_m = 0.20 / (m_val as f32).sqrt();

        // Blend: 70% fundamental, weighted harmonic partials
        let composite = (fundamental * 0.65) + (overtone_n * amp_n as f64) + (overtone_m * amp_m as f64);
        composite as f32
    }
}

impl Iterator for NeuroacousticSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        // If not playing, yield silence
        if !self.is_playing.load(Ordering::Relaxed) {
            return Some(0.0);
        }

        let p = match self.params.try_lock() {
            Ok(guard) => guard.clone(),
            Err(_) => DspParams::default(),
        };

        let sample_rate = self.sample_rate as f64;
        let pi2 = std::f64::consts::TAU;

        // Process stereo interleaved: Channel 0 = Left, Channel 1 = Right
        if self.channel_toggle == 0 {
            // ── Calculate LEFT channel ──
            let carrier = p.carrier_hz as f64;
            let offset = p.offset_hz as f64;

            let left_hz = match p.waveform.as_str() {
                "binaural" => carrier - (offset * 0.5),
                _ => carrier,
            };

            let tone_raw = self.synthesize_harmonic_tone(self.sample_clock_left, p.harmonic_n, p.harmonic_m);
            self.sample_clock_left += left_hz / sample_rate;
            if self.sample_clock_left >= 1.0 {
                self.sample_clock_left -= 1.0;
            }

            // Isochronic pulse modulation if active
            let iso_mod = if p.waveform == "isochronic" && offset > 0.0 {
                let mod_wave = (self.sample_clock_iso * pi2).sin() as f32;
                self.sample_clock_iso += offset / sample_rate;
                if self.sample_clock_iso >= 1.0 {
                    self.sample_clock_iso -= 1.0;
                }
                0.5 + 0.5 * mod_wave
            } else {
                1.0
            };

            // Noise sample
            let noise_sample = match p.noise_type.as_str() {
                "white" => self.next_white_noise(),
                "pink" => self.next_pink_noise(),
                "brown" => self.next_brown_noise(),
                _ => 0.0,
            };

            let tone_gain = p.amplitude * (1.0 - p.noise_blend_ratio) * iso_mod;
            let noise_gain = p.amplitude * p.noise_blend_ratio * 0.75;

            let left = ((tone_raw * tone_gain) + (noise_sample * noise_gain)).clamp(-1.0, 1.0);
            self.current_left_sample = left;
            self.channel_toggle = 1;

            if self.is_recording.load(Ordering::Relaxed) {
                if let Ok(mut buf) = self.recorded_buffer.try_lock() {
                    buf.push(left);
                }
            }

            Some(left)
        } else {
            // ── Calculate RIGHT channel ──
            let carrier = p.carrier_hz as f64;
            let offset = p.offset_hz as f64;

            let right_hz = match p.waveform.as_str() {
                "binaural" => carrier + (offset * 0.5),
                _ => carrier,
            };

            let tone_raw = self.synthesize_harmonic_tone(self.sample_clock_right, p.harmonic_n, p.harmonic_m);
            self.sample_clock_right += right_hz / sample_rate;
            if self.sample_clock_right >= 1.0 {
                self.sample_clock_right -= 1.0;
            }

            // Isochronic modulation
            let iso_mod = if p.waveform == "isochronic" && offset > 0.0 {
                (self.sample_clock_iso * pi2).sin().max(0.0) as f32
            } else {
                1.0
            };

            let noise_sample = match p.noise_type.as_str() {
                "white" => self.next_white_noise(),
                "pink" => self.next_pink_noise(),
                "brown" => self.next_brown_noise(),
                _ => 0.0,
            };

            let tone_gain = p.amplitude * (1.0 - p.noise_blend_ratio) * iso_mod;
            let noise_gain = p.amplitude * p.noise_blend_ratio * 0.75;

            let right = ((tone_raw * tone_gain) + (noise_sample * noise_gain)).clamp(-1.0, 1.0);
            self.channel_toggle = 0;

            if self.is_recording.load(Ordering::Relaxed) {
                if let Ok(mut buf) = self.recorded_buffer.try_lock() {
                    buf.push(right);
                }
            }

            Some(right)
        }
    }
}

impl Source for NeuroacousticSource {
    #[inline]
    fn current_span_len(&self) -> Option<usize> {
        None // Infinite continuous real-time synthesis
    }

    #[inline]
    fn channels(&self) -> NonZero<u16> {
        NonZero::new(2).unwrap() // Stereo output for binaural phase isolation
    }

    #[inline]
    fn sample_rate(&self) -> NonZero<u32> {
        NonZero::new(self.sample_rate).unwrap()
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

/// The Native Audio Engine managing playback and session recording
pub struct AudioController {
    pub params: Arc<Mutex<DspParams>>,
    pub is_playing: Arc<AtomicBool>,
    pub is_recording: Arc<AtomicBool>,
    pub recorded_buffer: Arc<Mutex<Vec<f32>>>,
    _sink: Option<MixerDeviceSink>,
}

impl AudioController {
    pub fn init() -> Result<Self, String> {
        let params = Arc::new(Mutex::new(DspParams::default()));
        let is_playing = Arc::new(AtomicBool::new(true)); // Default playing on boot
        let is_recording = Arc::new(AtomicBool::new(false));
        let recorded_buffer = Arc::new(Mutex::new(Vec::with_capacity(48000 * 2 * 60))); // 1 min initial cap

        match DeviceSinkBuilder::open_default_sink() {
            Ok(sink) => {
                let source = NeuroacousticSource::new(
                    48000,
                    params.clone(),
                    is_playing.clone(),
                    is_recording.clone(),
                    recorded_buffer.clone(),
                );

                sink.mixer().add(source);

                Ok(Self {
                    params,
                    is_playing,
                    is_recording,
                    recorded_buffer,
                    _sink: Some(sink),
                })
            }
            Err(e) => {
                eprintln!("[AudioController] Audio device unavailable (headless or restricted): {}", e);
                Ok(Self {
                    params,
                    is_playing,
                    is_recording,
                    recorded_buffer,
                    _sink: None,
                })
            }
        }
    }

    pub fn play(&self) {
        self.is_playing.store(true, Ordering::SeqCst);
    }

    pub fn pause(&self) {
        self.is_playing.store(false, Ordering::SeqCst);
    }

    pub fn toggle_playback(&self) -> bool {
        let currently = self.is_playing.load(Ordering::SeqCst);
        let next = !currently;
        self.is_playing.store(next, Ordering::SeqCst);
        next
    }

    pub fn update_params(
        &self,
        carrier_hz: Option<f32>,
        offset_hz: Option<f32>,
        amplitude: Option<f32>,
        harmonic_n: Option<u32>,
        harmonic_m: Option<u32>,
        waveform: Option<String>,
        noise_type: Option<String>,
        noise_blend_ratio: Option<f32>,
    ) {
        if let Ok(mut p) = self.params.lock() {
            if let Some(c) = carrier_hz { p.carrier_hz = c; }
            if let Some(o) = offset_hz { p.offset_hz = o; }
            if let Some(a) = amplitude { p.amplitude = a; }
            if let Some(n) = harmonic_n { p.harmonic_n = n; }
            if let Some(m) = harmonic_m { p.harmonic_m = m; }
            if let Some(w) = waveform { p.waveform = w; }
            if let Some(n) = noise_type { p.noise_type = n; }
            if let Some(nb) = noise_blend_ratio { p.noise_blend_ratio = nb; }
        }
    }

    pub fn start_recording(&self) {
        if let Ok(mut buf) = self.recorded_buffer.lock() {
            buf.clear();
        }
        self.is_recording.store(true, Ordering::SeqCst);
    }

    pub fn stop_and_save_wav(&self, destination_path: &str) -> Result<usize, String> {
        self.is_recording.store(false, Ordering::SeqCst);

        let samples = {
            let buf = self.recorded_buffer.lock().map_err(|e| e.to_string())?;
            buf.clone()
        };

        if samples.is_empty() {
            return Err("Recording buffer is empty.".to_string());
        }

        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = hound::WavWriter::create(destination_path, spec)
            .map_err(|e| format!("Failed to create WAV file: {}", e))?;

        for &sample in &samples {
            // Convert f32 [-1.0, 1.0] to i16 [-32767, 32767]
            let s16 = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
            writer.write_sample(s16).map_err(|e| format!("WAV write error: {}", e))?;
        }

        writer.finalize().map_err(|e| format!("Failed to finalize WAV header: {}", e))?;

        Ok(samples.len() / 2) // Total stereo sample frames
    }
}
