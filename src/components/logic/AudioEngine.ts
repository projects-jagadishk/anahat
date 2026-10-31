/**
 * AudioEngine.ts
 * Web Audio API synthesis engine (Phase 3 implementation).
 * Generates binaural/isochronic tones and noise in real-time.
 *
 * This is a stub — the full DSP will be wired in Phase 3.
 * For MVP, audio synthesis will happen in the Rust backend via rodio/fundsp.
 */

export interface AudioParams {
  carrierHz: number;
  offsetHz: number;
  amplitude: number;
  waveform: "sine" | "binaural" | "isochronic";
  noiseMaskingType: "pink" | "brown" | "white" | "none";
  noiseBlendRatio: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    console.log("[AudioEngine] Initialized — sample rate:", this.ctx.sampleRate);
  }

  play(_params: AudioParams): void {
    if (!this.ctx) return;
    this.isPlaying = true;
    console.log("[AudioEngine] Play —", _params);
    // TODO: Wire oscillators, binaural beat generation, noise generators
  }

  stop(): void {
    this.isPlaying = false;
    console.log("[AudioEngine] Stopped");
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  dispose(): void {
    this.ctx?.close();
    this.ctx = null;
  }
}
