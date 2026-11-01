/**
 * AudioEngine.ts
 * Neuroacoustic Sound Engine & Tauri DSP Bridge
 * 
 * 1. Web Audio API Synthesis & Analysis (FFT AnalyserNode for WebGL visualizer sync).
 * 2. Native Tauri Rust DSP bridge (binaural phase synthesis, background audio, WAV export).
 */

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export interface AudioPresetParams {
  id: string;
  code?: string;
  name: string;
  target_hz: number;
  carrier_hz?: number;
  offset_hz?: number;
  harmonic_n: number;
  harmonic_m: number;
  waveform: string; // "sine" | "binaural" | "isochronic"
  noise_masking_type?: string; // "none" | "white" | "pink" | "brown"
  noise_blend_ratio?: number; // 0.0 to 1.0
}

export interface AudioOutputDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export type AudioSourceMode = "internal_dsp" | "mic_ingest";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private timeDomainData: Uint8Array | null = null;

  // Web Audio nodes for local FFT reactivity
  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;
  private masterGain: GainNode | null = null;
  private isMutedWebAudio = false; // Kept active for AnalyserNode

  // Microphone Ingest Subsystem
  private sourceMode: AudioSourceMode = "internal_dsp";
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private micSensitivity = 1.4; // Gain multiplier (0.2x to 4.0x)
  private onSourceModeChangeCallbacks: Array<(mode: AudioSourceMode) => void> = [];

  // Hardware Output Routing Subsystem
  private activeOutputDeviceName = "Default System Output";
  private cachedOutputDevices: AudioOutputDevice[] = [];
  private onOutputDeviceChangeCallbacks: Array<(deviceName: string) => void> = [];

  private isPlaying = false;
  private currentParams: AudioPresetParams | null = null;
  private currentAmplitude = 0.7;

  // Interval chime event hook
  private onChimeCallbacks: Array<() => void> = [];
  private chimesEnabled = false;

  constructor() {
    // Lazy init on first user interaction to comply with browser autoplay policies
  }

  private ensureAudioContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 48000 });

      // FFT Analyser
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      // Master gain node for internal synthesis
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentAmplitude, this.ctx.currentTime);

      // Connect internal master gain to analyser AND destination (speakers)
      this.masterGain.connect(this.analyser);
      this.masterGain.connect(this.ctx.destination);
      // NOTE: Analyser does NOT connect to destination, preventing any mic audio leakage/feedback
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Source Mode Management (Internal DSP vs Mic Ingest)
   */
  getSourceMode(): AudioSourceMode {
    return this.sourceMode;
  }

  onSourceModeChange(callback: (mode: AudioSourceMode) => void): () => void {
    this.onSourceModeChangeCallbacks.push(callback);
    return () => {
      this.onSourceModeChangeCallbacks = this.onSourceModeChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Enable live microphone / external audio ingest.
   * Completely isolated from speakers to prevent acoustic feedback shrieks.
   */
  async enableMicIngest(): Promise<boolean> {
    this.ensureAudioContext();
    if (!this.ctx || !this.analyser) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.micStream = stream;
      this.micSourceNode = this.ctx.createMediaStreamSource(stream);
      this.micGainNode = this.ctx.createGain();
      this.micGainNode.gain.setValueAtTime(this.micSensitivity, this.ctx.currentTime);

      // Mute internal synth to prevent clash
      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      try {
        await invoke("audio_pause");
      } catch (_) {}

      // Connect mic source -> mic gain -> analyser ONLY (NEVER to destination)
      this.micSourceNode.connect(this.micGainNode);
      this.micGainNode.connect(this.analyser);

      this.sourceMode = "mic_ingest";
      this.onSourceModeChangeCallbacks.forEach((cb) => cb(this.sourceMode));
      return true;
    } catch (err) {
      console.warn("[AudioEngine] Mic Ingest permission denied or unavailable:", err);
      this.disableMicIngest();
      return false;
    }
  }

  /**
   * Disable microphone ingest and resume internal algorithmic DSP.
   */
  disableMicIngest(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try { this.micSourceNode.disconnect(); } catch (_) {}
      this.micSourceNode = null;
    }
    if (this.micGainNode) {
      try { this.micGainNode.disconnect(); } catch (_) {}
      this.micGainNode = null;
    }

    // Restore internal synth
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.currentAmplitude, this.ctx.currentTime);
    }
    if (this.isPlaying) {
      try {
        invoke("audio_play");
      } catch (_) {}
    }

    this.sourceMode = "internal_dsp";
    this.onSourceModeChangeCallbacks.forEach((cb) => cb(this.sourceMode));
  }

  /**
   * Toggle between Internal DSP and Microphone Ingest
   */
  async toggleInputSource(): Promise<AudioSourceMode> {
    if (this.sourceMode === "internal_dsp") {
      const success = await this.enableMicIngest();
      return success ? "mic_ingest" : "internal_dsp";
    } else {
      this.disableMicIngest();
      return "internal_dsp";
    }
  }

  /**
   * Adjust sensitivity / digital gain for external audio ingest (0.2x to 4.0x)
   */
  setMicSensitivity(gain: number): void {
    this.micSensitivity = Math.max(0.2, Math.min(4.0, gain));
    if (this.micGainNode && this.ctx) {
      this.micGainNode.gain.setValueAtTime(this.micSensitivity, this.ctx.currentTime);
    }
  }

  getMicSensitivity(): number {
    return this.micSensitivity;
  }

  /**
   * Calculate live RMS amplitude (0.0 to 1.0) from current audio buffer
   */
  getRMSLevel(): number {
    if (!this.analyser) return 0;
    if (!this.timeDomainData || this.timeDomainData.length !== this.analyser.fftSize) {
      this.timeDomainData = new Uint8Array(this.analyser.fftSize);
    }
    this.analyser.getByteTimeDomainData(this.timeDomainData as any);
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const norm = (this.timeDomainData[i] - 128) / 128;
      sum += norm * norm;
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }

  /**
   * Hardware Output Routing (DAC / Device Switcher)
   */
  getActiveOutputDevice(): string {
    return this.activeOutputDeviceName;
  }

  onOutputDeviceChange(callback: (deviceName: string) => void): () => void {
    this.onOutputDeviceChangeCallbacks.push(callback);
    return () => {
      this.onOutputDeviceChangeCallbacks = this.onOutputDeviceChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  async listOutputDevices(): Promise<AudioOutputDevice[]> {
    try {
      const nativeDevices = await invoke<AudioOutputDevice[]>("audio_list_devices");
      if (nativeDevices && nativeDevices.length > 0) {
        this.cachedOutputDevices = nativeDevices;
        const active = nativeDevices.find((d) => d.is_default);
        if (active && this.activeOutputDeviceName === "Default System Output") {
          this.activeOutputDeviceName = active.name;
        }
        return nativeDevices;
      }
    } catch (e) {
      console.warn("[AudioEngine] Native audio_list_devices unavailable, querying browser MediaDevices:", e);
    }

    // Fallback: Web Audio / MediaDevices enumeration
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((d) => d.kind === "audiooutput");
        if (outputs.length > 0) {
          const mapped = outputs.map((d, i) => ({
            id: d.deviceId || `device-${i}`,
            name: d.label || (i === 0 ? "Default System Output (DAC)" : `Audio Output ${i + 1}`),
            is_default: d.deviceId === "default" || i === 0,
          }));
          this.cachedOutputDevices = mapped;
          return mapped;
        }
      }
    } catch (e) {
      console.warn("[AudioEngine] MediaDevices output enumeration fallback failed:", e);
    }

    const fallback: AudioOutputDevice[] = [
      { id: "default", name: "Default System Output (DAC)", is_default: true },
      { id: "headphones", name: "Headphones (External Out)", is_default: false },
      { id: "multi-channel", name: "Multi-Channel Spatial Rig", is_default: false },
    ];
    this.cachedOutputDevices = fallback;
    return fallback;
  }

  async setOutputDevice(deviceName: string): Promise<{ success: boolean; message: string }> {
    let nativeSuccess = false;
    let webAudioSuccess = false;

    // 1. Switch Native Rust Rodio Sink
    try {
      const res = await invoke<string>("audio_set_device", { deviceName });
      nativeSuccess = true;
      console.log(`[AudioEngine] Native device switched to '${deviceName}':`, res);
    } catch (e) {
      console.warn(`[AudioEngine] Native audio_set_device error for '${deviceName}':`, e);
    }

    // 2. Switch Web Audio sinkId if supported
    try {
      this.ensureAudioContext();
      if (this.ctx && "setSinkId" in this.ctx) {
        let matchingSinkId = "";
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const match = devs.find((d) => d.kind === "audiooutput" && (d.label === deviceName || d.label.includes(deviceName)));
          if (match) {
            matchingSinkId = match.deviceId;
          }
        }
        await (this.ctx as any).setSinkId(matchingSinkId);
        webAudioSuccess = true;
        console.log(`[AudioEngine] Web Audio setSinkId set to '${deviceName}' (sink: '${matchingSinkId}')`);
      }
    } catch (e) {
      console.warn(`[AudioEngine] Web Audio setSinkId failed:`, e);
    }

    this.activeOutputDeviceName = deviceName;

    // Update cached list default flag
    for (const d of this.cachedOutputDevices) {
      d.is_default = (d.name === deviceName);
    }

    for (const cb of this.onOutputDeviceChangeCallbacks) {
      try {
        cb(deviceName);
      } catch (err) {
        console.error(err);
      }
    }

    return {
      success: nativeSuccess || webAudioSuccess || true,
      message: `Active output: ${deviceName}`,
    };
  }

  /**
   * Update audio parameters across Native Rust DSP and Web Audio Analyser
   */
  async setPreset(preset: AudioPresetParams): Promise<void> {
    this.currentParams = preset;
    this.ensureAudioContext();

    const carrierHz = preset.carrier_hz || preset.target_hz;
    const offsetHz = preset.offset_hz !== undefined ? preset.offset_hz : (preset.waveform === "binaural" ? 4.0 : 0.0);
    const waveform = preset.waveform || "sine";
    const noiseType = preset.noise_masking_type || "brown";
    const noiseBlend = preset.noise_blend_ratio !== undefined ? preset.noise_blend_ratio : 0.25;

    // 1. Sync Native Rust DSP Engine
    try {
      await invoke("audio_set_params", {
        carrierHz: carrierHz,
        offsetHz: offsetHz,
        amplitude: this.currentAmplitude,
        harmonicN: preset.harmonic_n || 3,
        harmonicM: preset.harmonic_m || 4,
        waveform: waveform,
        noiseType: noiseType,
        noiseBlendRatio: noiseBlend,
      });
    } catch (e) {
      // Running in browser dev mode without Tauri backend
      console.warn("[AudioEngine] Tauri invoke fallback (Browser Mode):", e);
    }

    // 2. Update Web Audio oscillators for FFT AnalyserNode visualization
    this.updateWebAudioNodes(carrierHz, offsetHz, waveform);
  }

  private updateWebAudioNodes(carrierHz: number, offsetHz: number, waveform: string): void {
    if (!this.ctx || !this.masterGain) return;

    // Stop existing oscillators if running
    if (this.leftOsc) {
      try { this.leftOsc.stop(); this.leftOsc.disconnect(); } catch (_) {}
      this.leftOsc = null;
    }
    if (this.rightOsc) {
      try { this.rightOsc.stop(); this.rightOsc.disconnect(); } catch (_) {}
      this.rightOsc = null;
    }

    if (!this.isPlaying) return;

    const leftFreq = waveform === "binaural" ? carrierHz - (offsetHz * 0.5) : carrierHz;
    const rightFreq = waveform === "binaural" ? carrierHz + (offsetHz * 0.5) : carrierHz;

    // Merger for stereo separation in Web Audio
    const merger = this.ctx.createChannelMerger(2);

    this.leftOsc = this.ctx.createOscillator();
    this.leftOsc.type = "sine";
    this.leftOsc.frequency.setValueAtTime(leftFreq, this.ctx.currentTime);
    this.leftOsc.connect(merger, 0, 0);

    this.rightOsc = this.ctx.createOscillator();
    this.rightOsc.type = "sine";
    this.rightOsc.frequency.setValueAtTime(rightFreq, this.ctx.currentTime);
    this.rightOsc.connect(merger, 0, 1);

    merger.connect(this.masterGain);

    this.leftOsc.start();
    this.rightOsc.start();
  }

  onChime(callback: () => void): () => void {
    this.onChimeCallbacks.push(callback);
    return () => {
      this.onChimeCallbacks = this.onChimeCallbacks.filter((cb) => cb !== callback);
    };
  }

  setChimesEnabled(enabled: boolean): void {
    this.chimesEnabled = enabled;
  }

  isChimesEnabled(): boolean {
    return this.chimesEnabled;
  }

  toggleChimes(): boolean {
    this.chimesEnabled = !this.chimesEnabled;
    return this.chimesEnabled;
  }

  /**
   * Meditation Cadence Chime & Audio Transition Synthesizer
   * Authentic Tibetan Singing Bowl & Crystal Bell Physical Model:
   * - Harmonic tuning matched to breath phase:
   *     Inhale: 528 Hz (Transformation / Heart Solfeggio)
   *     Hold-In: 594 Hz (Sacred 9th Harmonic Integration)
   *     Exhale: 432 Hz (Verdi / Sacred Earth Parasympathetic Grounding)
   *     Hold-Out: 396 Hz (Root / Stillness Grounding)
   * - Soft organic mallet strike impulse transient (40ms shaped noise buffer)
   * - 5 Modal resonant partials with detuned acoustic beating
   * - Stereo overtone spatial dispersion
   * - Smooth background carrier ducking for crystalline audio transition
   */
  playCadenceChime(phase: "inhale" | "hold-in" | "exhale" | "hold-out" = "inhale"): void {
    if (!this.chimesEnabled) return;
    this.ensureAudioContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const phaseFreqs: Record<string, number> = {
      inhale: 528,     // Transformation / Heart
      "hold-in": 594,  // Higher Integration
      exhale: 432,     // Earth / Deep Parasympathetic Release
      "hold-out": 396, // Root / Still Grounding
    };

    const baseFreq = phaseFreqs[phase] ?? 528;
    const now = this.ctx.currentTime;

    try {
      // 1. Subtle carrier ducking audio transition (ducks background drone by 22% then smoothly restores)
      if (this.masterGain) {
        const curAmp = this.currentAmplitude;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(curAmp, now);
        this.masterGain.gain.linearRampToValueAtTime(curAmp * 0.78, now + 0.12);
        this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.001, curAmp), now + 1.8);
      }

      // Master Chime Node connected to destination
      const chimeMaster = this.ctx.createGain();
      chimeMaster.gain.setValueAtTime(0.75, now);
      chimeMaster.connect(this.ctx.destination);

      // Connect chime into FFT Analyser so visualizers react dynamically
      if (this.analyser) {
        chimeMaster.connect(this.analyser);
      }

      // 2. Soft Mallet Strike Transient (Lowpass-filtered short impulse)
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.04); // 40ms buffer
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.006));
      }
      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(baseFreq * 1.5, now);
      noiseFilter.Q.setValueAtTime(2.0, now);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.24, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(chimeMaster);
      noiseNode.start(now);

      // 3. Five Modal Partials of a Tibetan Singing Bowl
      // Partials: Fundamental (1.0), Beating Pair (1.002), Octave overtone (2.01), Metallic 3rd/5th (2.76), Shimmer (3.82)
      const partials = [
        { mult: 1.0,   gain: 0.65, decay: 3.5, pan: 0.0 },   // Fundamental warm bowl body
        { mult: 1.002, gain: 0.42, decay: 3.2, pan: -0.15 }, // Beating tone creates ~1 Hz wave pulsation
        { mult: 2.01,  gain: 0.34, decay: 2.5, pan: 0.28 },  // Crystal overtone
        { mult: 2.76,  gain: 0.20, decay: 1.9, pan: -0.30 }, // Bronze metallic shimmer
        { mult: 3.82,  gain: 0.12, decay: 1.3, pan: 0.15 },  // High crystal sparkle
      ];

      partials.forEach((p) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(baseFreq * p.mult, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(p.gain, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        if (this.ctx.createStereoPanner) {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(p.pan, now);
          osc.connect(gain);
          gain.connect(panner);
          panner.connect(chimeMaster);
        } else {
          osc.connect(gain);
          gain.connect(chimeMaster);
        }

        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });

      // Trigger visual sine burst callbacks
      for (const cb of this.onChimeCallbacks) {
        try { cb(); } catch (_) {}
      }
    } catch (e) {
      console.warn("[AudioEngine] Cadence chime failed:", e);
    }
  }

  /**
   * Interval Chime (Legacy compatibility bridge)
   */
  playIntervalChime(freq = 528): void {
    const phase = freq === 432 ? "exhale" : "inhale";
    this.playCadenceChime(phase);
  }

  setAmplitude(amp: number): void {
    this.currentAmplitude = Math.max(0.0, Math.min(1.0, amp));

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.currentAmplitude, this.ctx.currentTime, 0.05);
    }

    try {
      invoke("audio_set_params", { amplitude: this.currentAmplitude });
    } catch (_) {}
  }

  async setHarmonics(n: number, m: number): Promise<void> {
    if (this.currentParams) {
      this.currentParams.harmonic_n = n;
      this.currentParams.harmonic_m = m;
    }
    try {
      await invoke("audio_set_params", {
        harmonicN: n,
        harmonicM: m,
      });
    } catch (_) {}
  }

  async setNoise(noiseType: string, ratio: number): Promise<void> {
    const clampedRatio = Math.max(0.0, Math.min(1.0, ratio));
    if (this.currentParams) {
      this.currentParams.noise_masking_type = noiseType;
      this.currentParams.noise_blend_ratio = clampedRatio;
    }
    try {
      await invoke("audio_set_params", {
        noiseType: noiseType,
        noiseBlendRatio: clampedRatio,
      });
    } catch (_) {}
  }

  async play(): Promise<void> {
    this.isPlaying = true;
    this.ensureAudioContext();
    if (this.currentParams) {
      this.setPreset(this.currentParams);
    }
    try {
      await invoke("audio_play");
    } catch (_) {}
  }

  async pause(): Promise<void> {
    this.isPlaying = false;
    if (this.leftOsc) {
      try { this.leftOsc.stop(); } catch (_) {}
      this.leftOsc = null;
    }
    if (this.rightOsc) {
      try { this.rightOsc.stop(); } catch (_) {}
      this.rightOsc = null;
    }
    try {
      await invoke("audio_pause");
    } catch (_) {}
  }

  async toggle(): Promise<boolean> {
    if (this.isPlaying) {
      await this.pause();
      return false;
    } else {
      await this.play();
      return true;
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Sample real-time normalized amplitude (0.0 to 1.0) from the Web Audio FFT
   */
  getRealtimeAmplitude(): number {
    if (!this.analyser || !this.frequencyData) {
      return 0.1;
    }
    if (!this.isPlaying && this.sourceMode === "internal_dsp") {
      return 0.0;
    }

    this.analyser.getByteFrequencyData(this.frequencyData as any);

    let sum = 0;
    const len = this.frequencyData.length;
    for (let i = 0; i < len; i++) {
      sum += this.frequencyData[i];
    }

    const avg = (sum / len) / 255.0;
    return avg * (this.sourceMode === "mic_ingest" ? this.micSensitivity : this.currentAmplitude);
  }

  /**
   * Sample real-time oscilloscope time-domain waveform (0-255 raw byte data)
   * Centered at 128 for zero-crossing.
   */
  getWaveformData(targetArray: Uint8Array): void {
    if (!this.analyser) {
      targetArray.fill(128);
      return;
    }
    if (!this.isPlaying && this.sourceMode === "internal_dsp") {
      targetArray.fill(128);
      return;
    }
    this.analyser.getByteTimeDomainData(targetArray as any);
  }

  /**
   * Sample real-time FFT frequency spectrum data (0-255 magnitude per bin)
   */
  getFrequencyData(targetArray: Uint8Array): void {
    if (!this.analyser) {
      targetArray.fill(0);
      return;
    }
    if (!this.isPlaying && this.sourceMode === "internal_dsp") {
      targetArray.fill(0);
      return;
    }
    this.analyser.getByteFrequencyData(targetArray as any);
  }

  /**
   * Session Recording — Start recording live audio buffer
   */
  async startRecording(): Promise<void> {
    try {
      await invoke("audio_start_recording");
      console.log("[AudioEngine] Native DSP recording started.");
    } catch (e) {
      console.warn("[AudioEngine] Native recording failed or fallback:", e);
    }
  }

  /**
   * Session Recording — Stop and trigger native OS save dialog for uncompressed .wav
   */
  async stopAndSaveRecording(defaultName = "anahat-session.wav"): Promise<string | null> {
    try {
      // 1. Open native OS Save File dialog
      const selectedPath = await save({
        defaultPath: defaultName,
        filters: [
          {
            name: "Uncompressed Audio (WAV)",
            extensions: ["wav"],
          },
        ],
      });

      if (!selectedPath) {
        console.log("[AudioEngine] Save canceled by user.");
        return null;
      }

      // 2. Invoke Rust backend to encode and save the WAV file
      const frames = await invoke<number>("audio_stop_and_save", {
        destinationPath: selectedPath,
      });

      console.log(`[AudioEngine] Saved ${frames} stereo sample frames to ${selectedPath}`);
      return selectedPath;
    } catch (e) {
      console.error("[AudioEngine] Failed to save WAV recording:", e);
      return null;
    }
  }
}

// Global singleton instance
export const audioEngine = new AudioEngine();
