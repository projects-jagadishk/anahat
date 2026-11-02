use std::num::NonZero;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Source};
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Copy, Clone, PartialEq, Eq, Default, Serialize)]
#[repr(u8)]
pub enum WaveformType {
    #[default]
    Sine = 0,
    Binaural = 1,
    Isochronic = 2,
}

impl WaveformType {
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "binaural" => Self::Binaural,
            "isochronic" => Self::Isochronic,
            _ => Self::Sine,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sine => "sine",
            Self::Binaural => "binaural",
            Self::Isochronic => "isochronic",
        }
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Default, Serialize)]
#[repr(u8)]
pub enum NoiseType {
    None = 0,
    White = 1,
    Pink = 2,
    #[default]
    Brown = 3,
}

impl NoiseType {
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "none" => Self::None,
            "white" => Self::White,
            "pink" => Self::Pink,
            _ => Self::Brown,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::White => "white",
            Self::Pink => "pink",
            Self::Brown => "brown",
        }
    }
}

/// Thread-safe stack-allocated shared parameters for real-time DSP synthesis (Zero Heap Allocs)
#[derive(Copy, Clone)]
pub struct DspParams {
    pub carrier_hz: f32,
    pub offset_hz: f32,
    pub amplitude: f32,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
    pub waveform: WaveformType,
    pub noise_type: NoiseType,
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
            waveform: WaveformType::Sine,
            noise_type: NoiseType::Brown,
            noise_blend_ratio: 0.25,
        }
    }
}

/// Continuous stereo DSP audio source implementing rodio::Source
pub struct NeuroacousticSource {
    sample_rate: u32,
    params: Arc<Mutex<DspParams>>,
    params_dirty: Arc<AtomicBool>,
    cached_params: DspParams,
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
        params_dirty: Arc<AtomicBool>,
        is_playing: Arc<AtomicBool>,
        is_recording: Arc<AtomicBool>,
        recorded_buffer: Arc<Mutex<Vec<f32>>>,
    ) -> Self {
        let initial_params = params.lock().map(|g| *g).unwrap_or_default();
        Self {
            sample_rate,
            params,
            params_dirty,
            cached_params: initial_params,
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

        // Only lock when parameters were modified via IPC (lock-free on steady state)
        if self.params_dirty.load(Ordering::Relaxed) {
            if let Ok(guard) = self.params.try_lock() {
                self.cached_params = *guard; // Bitwise Copy, ZERO heap allocations
                self.params_dirty.store(false, Ordering::Release);
            }
        }

        let p = self.cached_params;
        let sample_rate = self.sample_rate as f64;
        let pi2 = std::f64::consts::TAU;

        // Process stereo interleaved: Channel 0 = Left, Channel 1 = Right
        if self.channel_toggle == 0 {
            // ── Calculate LEFT channel ──
            let carrier = p.carrier_hz as f64;
            let offset = p.offset_hz as f64;

            let left_hz = match p.waveform {
                WaveformType::Binaural => carrier - (offset * 0.5),
                _ => carrier,
            };

            let tone_raw = self.synthesize_harmonic_tone(self.sample_clock_left, p.harmonic_n, p.harmonic_m);
            self.sample_clock_left += left_hz / sample_rate;
            if self.sample_clock_left >= 1.0 {
                self.sample_clock_left -= 1.0;
            }

            // Isochronic pulse modulation if active
            let iso_mod = if p.waveform == WaveformType::Isochronic && offset > 0.0 {
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
            let noise_sample = match p.noise_type {
                NoiseType::White => self.next_white_noise(),
                NoiseType::Pink => self.next_pink_noise(),
                NoiseType::Brown => self.next_brown_noise(),
                NoiseType::None => 0.0,
            };

            let tone_gain = p.amplitude * (1.0 - p.noise_blend_ratio) * iso_mod;
            let noise_gain = p.amplitude * p.noise_blend_ratio * 0.75;

            let left = ((tone_raw * tone_gain) + (noise_sample * noise_gain)).clamp(-1.0, 1.0);
            self.current_left_sample = left;
            self.channel_toggle = 1;

            Some(left)
        } else {
            // ── Calculate RIGHT channel ──
            let carrier = p.carrier_hz as f64;
            let offset = p.offset_hz as f64;

            let right_hz = match p.waveform {
                WaveformType::Binaural => carrier + (offset * 0.5),
                _ => carrier,
            };

            let tone_raw = self.synthesize_harmonic_tone(self.sample_clock_right, p.harmonic_n, p.harmonic_m);
            self.sample_clock_right += right_hz / sample_rate;
            if self.sample_clock_right >= 1.0 {
                self.sample_clock_right -= 1.0;
            }

            // Isochronic modulation
            let iso_mod = if p.waveform == WaveformType::Isochronic && offset > 0.0 {
                (self.sample_clock_iso * pi2).sin().max(0.0) as f32
            } else {
                1.0
            };

            let noise_sample = match p.noise_type {
                NoiseType::White => self.next_white_noise(),
                NoiseType::Pink => self.next_pink_noise(),
                NoiseType::Brown => self.next_brown_noise(),
                NoiseType::None => 0.0,
            };

            let tone_gain = p.amplitude * (1.0 - p.noise_blend_ratio) * iso_mod;
            let noise_gain = p.amplitude * p.noise_blend_ratio * 0.75;

            let right = ((tone_raw * tone_gain) + (noise_sample * noise_gain)).clamp(-1.0, 1.0);
            self.channel_toggle = 0;

            // Record both interleaved left and right in a single lock (halves lock operations & prevents channel desync)
            if self.is_recording.load(Ordering::Relaxed) {
                if let Ok(mut buf) = self.recorded_buffer.try_lock() {
                    const MAX_RECORDING_SAMPLES: usize = 48000 * 2 * 3600; // 1-hour safe memory ceiling (~1.38 GB)
                    if buf.len() + 2 <= MAX_RECORDING_SAMPLES {
                        buf.push(self.current_left_sample);
                        buf.push(right);
                    }
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
    pub params_dirty: Arc<AtomicBool>,
    pub is_playing: Arc<AtomicBool>,
    pub is_recording: Arc<AtomicBool>,
    pub recorded_buffer: Arc<Mutex<Vec<f32>>>,
    sink: Arc<Mutex<Option<MixerDeviceSink>>>,
    pub active_device_name: Arc<Mutex<String>>,
}

impl AudioController {
    pub fn init() -> Result<Self, String> {
        let params = Arc::new(Mutex::new(DspParams::default()));
        let params_dirty = Arc::new(AtomicBool::new(false));
        let is_playing = Arc::new(AtomicBool::new(false)); // Muted during boot; plays after splash screen loads
        let is_recording = Arc::new(AtomicBool::new(false));
        // Allocate lazily on record start to keep idle memory minimal
        let recorded_buffer = Arc::new(Mutex::new(Vec::new()));

        let default_name = rodio::cpal::default_host()
            .default_output_device()
            .and_then(|d| d.description().ok().map(|desc| desc.name().to_string()))
            .unwrap_or_else(|| "Default System Output".to_string());
        let active_device_name = Arc::new(Mutex::new(default_name));

        match DeviceSinkBuilder::open_default_sink() {
            Ok(sink) => {
                let source = NeuroacousticSource::new(
                    48000,
                    params.clone(),
                    params_dirty.clone(),
                    is_playing.clone(),
                    is_recording.clone(),
                    recorded_buffer.clone(),
                );

                sink.mixer().add(source);

                Ok(Self {
                    params,
                    params_dirty,
                    is_playing,
                    is_recording,
                    recorded_buffer,
                    sink: Arc::new(Mutex::new(Some(sink))),
                    active_device_name,
                })
            }
            Err(e) => {
                eprintln!("[AudioController] Audio device unavailable (headless or restricted): {}", e);
                Ok(Self {
                    params,
                    params_dirty,
                    is_playing,
                    is_recording,
                    recorded_buffer,
                    sink: Arc::new(Mutex::new(None)),
                    active_device_name,
                })
            }
        }
    }

    pub fn list_output_devices(&self) -> Vec<AudioDeviceInfo> {
        let mut result = Vec::new();
        let host = rodio::cpal::default_host();
        let default_name = host.default_output_device().and_then(|d| d.description().ok().map(|desc| desc.name().to_string()));
        let active_name = self.active_device_name.lock().unwrap().clone();

        if let Ok(devices) = host.output_devices() {
            for (idx, dev) in devices.enumerate() {
                if let Ok(desc) = dev.description() {
                    let name = desc.name().to_string();
                    let is_active = if !active_name.is_empty() {
                        active_name == name
                    } else {
                        default_name.as_ref().map(|d| d == &name).unwrap_or(false)
                    };
                    result.push(AudioDeviceInfo {
                        id: format!("device-{}", idx),
                        name,
                        is_default: is_active,
                    });
                }
            }
        }
        result
    }

    pub fn set_output_device(&self, device_name: &str) -> Result<String, String> {
        let host = rodio::cpal::default_host();
        let output_devices = host.output_devices().map_err(|e| e.to_string())?;

        let mut target_device = None;
        for dev in output_devices {
            if let Ok(desc) = dev.description() {
                if desc.name() == device_name {
                    target_device = Some(dev);
                    break;
                }
            }
        }

        let device = target_device.ok_or_else(|| format!("Device '{}' not found", device_name))?;

        let builder = DeviceSinkBuilder::from_device(device).map_err(|e| format!("{:?}", e))?;
        let new_sink = builder.open_stream().map_err(|e| format!("{:?}", e))?;

        let source = NeuroacousticSource::new(
            48000,
            self.params.clone(),
            self.params_dirty.clone(),
            self.is_playing.clone(),
            self.is_recording.clone(),
            self.recorded_buffer.clone(),
        );

        new_sink.mixer().add(source);

        let mut sink_lock = self.sink.lock().unwrap();
        *sink_lock = Some(new_sink);

        let mut name_lock = self.active_device_name.lock().unwrap();
        *name_lock = device_name.to_string();

        Ok(device_name.to_string())
    }

    pub fn get_active_device_name(&self) -> String {
        self.active_device_name.lock().unwrap().clone()
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
            if let Some(w) = waveform { p.waveform = WaveformType::from_str_lossy(&w); }
            if let Some(n) = noise_type { p.noise_type = NoiseType::from_str_lossy(&n); }
            if let Some(nb) = noise_blend_ratio { p.noise_blend_ratio = nb; }
            self.params_dirty.store(true, Ordering::Release);
        }
    }

    pub fn start_recording(&self) {
        if let Ok(mut buf) = self.recorded_buffer.lock() {
            buf.clear();
            buf.reserve(48000 * 2 * 30); // 30 sec initial capacity
        }
        self.is_recording.store(true, Ordering::SeqCst);
    }

    pub fn stop_and_save_wav(&self, destination_path: &str) -> Result<usize, String> {
        self.is_recording.store(false, Ordering::SeqCst);

        // ZERO-COPY: Drain buffer out of mutex and free capacity immediately
        let samples = {
            let mut buf = self.recorded_buffer.lock().map_err(|e| e.to_string())?;
            let drained = std::mem::take(&mut *buf);
            buf.shrink_to_fit();
            drained
        };

        if samples.is_empty() {
            return Err("Recording buffer is empty.".to_string());
        }

        // Validate destination path and enforce .wav extension
        let path = std::path::Path::new(destination_path);
        if destination_path.trim().is_empty() || path.file_name().is_none() {
            return Err("Invalid destination path for WAV export.".to_string());
        }
        let final_path = if path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("wav")).unwrap_or(false) {
            path.to_path_buf()
        } else {
            path.with_extension("wav")
        };

        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = hound::WavWriter::create(&final_path, spec)
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
