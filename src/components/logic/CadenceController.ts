/**
 * CadenceController.ts
 * Lightweight Breath Cadence Synchronizer for Meditation Sessions & Visualizer Phase Sync.
 * Eliminates all sprite/metronome overhead while keeping clean breathing phase hooks.
 */

import gsap from "gsap";

export type CadenceType = "box" | "478" | "coherent" | "off";

export interface CadenceDefinition {
  name: string;
  inhale: number;
  holdIn: number;
  exhale: number;
  holdOut: number;
  total: number;
}

export const CADENCE_PRESETS: Record<CadenceType, CadenceDefinition> = {
  box: {
    name: "BOX [ 4-4-4-4 ]",
    inhale: 4,
    holdIn: 4,
    exhale: 4,
    holdOut: 4,
    total: 16,
  },
  "478": {
    name: "4-7-8 RELAX",
    inhale: 4,
    holdIn: 7,
    exhale: 8,
    holdOut: 0,
    total: 19,
  },
  coherent: {
    name: "COHERENT [ 5-5 ]",
    inhale: 5,
    holdIn: 0,
    exhale: 5,
    holdOut: 0,
    total: 10,
  },
  off: {
    name: "CADENCE // OFF",
    inhale: 2.5,
    holdIn: 0.5,
    exhale: 2.5,
    holdOut: 0.5,
    total: 6,
  },
};

export class CadenceController {
  private timeline: gsap.core.Timeline | null = null;
  private currentCadence: CadenceType = "box";
  private onPhaseChange?: (phase: "inhale" | "hold-in" | "exhale" | "hold-out", remainingPhaseSec: number) => void;

  init(): void {
    this.applyCadence(this.currentCadence);
  }

  setPhaseCallback(cb: (phase: "inhale" | "hold-in" | "exhale" | "hold-out", remainingPhaseSec: number) => void): void {
    this.onPhaseChange = cb;
  }

  applyCadence(cadence: CadenceType): void {
    this.currentCadence = cadence;
    const def = CADENCE_PRESETS[cadence];

    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }

    this.timeline = gsap.timeline({ repeat: -1 });

    if (cadence === "off") {
      this.onPhaseChange?.("inhale", def.inhale);
      return;
    }

    if (def.inhale > 0) {
      this.timeline.call(() => this.onPhaseChange?.("inhale", def.inhale));
      this.timeline.to({}, { duration: def.inhale });
    }

    if (def.holdIn > 0) {
      this.timeline.call(() => this.onPhaseChange?.("hold-in", def.holdIn));
      this.timeline.to({}, { duration: def.holdIn });
    }

    if (def.exhale > 0) {
      this.timeline.call(() => this.onPhaseChange?.("exhale", def.exhale));
      this.timeline.to({}, { duration: def.exhale });
    }

    if (def.holdOut > 0) {
      this.timeline.call(() => this.onPhaseChange?.("hold-out", def.holdOut));
      this.timeline.to({}, { duration: def.holdOut });
    }
  }

  destroy(): void {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
  }
}

export const cadenceController = new CadenceController();
