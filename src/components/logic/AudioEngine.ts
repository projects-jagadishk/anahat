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

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array | null = null;

  // Web Audio nodes for local FFT reactivity
  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;
  private masterGain: GainNode | null = null;
  private isMutedWebAudio = false; // Kept active for AnalyserNode

  private isPlaying = true;
  private currentParams: AudioPresetParams | null = null;
  private currentAmplitude = 0.7;

  // Interval chime event hook
  private onChimeCallbacks: Array<() => void> = [];

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

      // Master gain node
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentAmplitude, this.ctx.currentTime);

      this.masterGain.connect(this.analyser);
      // Connect to destination
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
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

  /**
   * Interval Chime (V1.5 Meditation)
   * Crisp, unadulterated high sine burst at temporal milestones.
   * Dual-harmonic pure sine bell (Fundamental + 2nd Harmonic overtone).
   */
  playIntervalChime(freq = 528): void {
    this.ensureAudioContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    try {
      const now = this.ctx.currentTime;

      // 1. Fundamental Pure Sine
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq, now);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.75, now + 0.006);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 1.45);

      // 2. Crystal Overtone (2x harmonic)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, now);

      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.exponentialRampToValueAtTime(0.28, now + 0.004);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);

      osc2.start(now);
      osc2.stop(now + 0.95);

      // Trigger visual sine burst callbacks
      for (const cb of this.onChimeCallbacks) {
        try { cb(); } catch (_) {}
      }
    } catch (e) {
      console.warn("[AudioEngine] Interval chime failed:", e);
    }
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
    if (!this.analyser || !this.frequencyData || !this.isPlaying) {
      return this.currentAmplitude * 0.5;
    }

    this.analyser.getByteFrequencyData(this.frequencyData);

    let sum = 0;
    const len = this.frequencyData.length;
    for (let i = 0; i < len; i++) {
      sum += this.frequencyData[i];
    }

    const avg = (sum / len) / 255.0;
    return avg * this.currentAmplitude;
  }

  /**
   * Sample real-time oscilloscope time-domain waveform (0-255 raw byte data)
   * Centered at 128 for zero-crossing.
   */
  getWaveformData(targetArray: Uint8Array): void {
    if (!this.analyser || !this.isPlaying) {
      targetArray.fill(128);
      return;
    }
    this.analyser.getByteTimeDomainData(targetArray);
  }

  /**
   * Sample real-time FFT frequency spectrum data (0-255 magnitude per bin)
   */
  getFrequencyData(targetArray: Uint8Array): void {
    if (!this.analyser || !this.isPlaying) {
      targetArray.fill(0);
      return;
    }
    this.analyser.getByteFrequencyData(targetArray);
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
