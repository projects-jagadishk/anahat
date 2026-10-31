/**
 * SpriteMetronome.ts
 * GSAP-Powered 2D 1-Bit Pixel Sprite Metronome & Cadence Synchronizer
 * 
 * Renders an animated high-contrast 1-bit black/grey tabby cat companion
 * onto a 2D canvas, synchronizing its chest breathing, ear orientation,
 * and tail taps directly to temporal meditation cadences.
 */

import { gsap } from "gsap";

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

export class SpriteMetronomeController {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private timeline: gsap.core.Timeline | null = null;
  private currentCadence: CadenceType = "box";
  private badgeElement: HTMLElement | null = null;
  private onPhaseChange?: (phase: "inhale" | "hold-in" | "exhale" | "hold-out", remainingPhaseSec: number) => void;
  private rafId: number | null = null;

  // Animation values manipulated by GSAP
  private anim = {
    headY: 0,
    chestScale: 1.0,
    tailAngle: 0,
    earPerk: 0,
    eyeOpen: 1.0,
  };

  init(badgeId = "sprite-cadence-label", canvasId = "tabby-canvas"): void {
    this.badgeElement = document.getElementById(badgeId);
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;

    if (this.canvas) {
      this.ctx = this.canvas.getContext("2d");
      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
      }
    }

    // Start 60 FPS Canvas Render Loop
    this.startRenderLoop();

    // Start GSAP Timeline
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
      if (this.badgeElement) this.badgeElement.textContent = "IDLE // AMBIENT";
      // Gentle natural cat breath
      this.timeline
        .to(this.anim, {
          headY: -2,
          chestScale: 1.06,
          tailAngle: 4,
          duration: 2.5,
          ease: "sine.inOut",
        })
        .to(this.anim, {
          headY: 0,
          chestScale: 1.0,
          tailAngle: -2,
          duration: 2.5,
          ease: "sine.inOut",
        });
      return;
    }

    // ── Phase 1: INHALE ──
    this.timeline.add(() => {
      this.updateBadge("INHALE", def.inhale);
      this.onPhaseChange?.("inhale", def.inhale);
    });

    this.timeline.to(this.anim, {
      headY: -5,
      chestScale: 1.15,
      tailAngle: -8,
      earPerk: 1.0,
      eyeOpen: 1.0,
      duration: def.inhale,
      ease: "power1.inOut",
    });

    // ── Phase 2: HOLD-IN ──
    if (def.holdIn > 0) {
      this.timeline.add(() => {
        this.updateBadge("HOLD", def.holdIn);
        this.onPhaseChange?.("hold-in", def.holdIn);
      });

      // Tail flick and subtle eye blink
      const halfHold = def.holdIn * 0.5;
      this.timeline
        .to(this.anim, {
          tailAngle: 12,
          eyeOpen: 0.1,
          duration: 0.2,
          ease: "steps(2)",
        })
        .to(this.anim, {
          tailAngle: -10,
          eyeOpen: 1.0,
          duration: 0.2,
          ease: "steps(2)",
        })
        .to(this.anim, {
          tailAngle: 0,
          duration: Math.max(0.1, halfHold - 0.4),
        })
        .to({}, { duration: halfHold });
    }

    // ── Phase 3: EXHALE ──
    this.timeline.add(() => {
      this.updateBadge("EXHALE", def.exhale);
      this.onPhaseChange?.("exhale", def.exhale);
    });

    this.timeline.to(this.anim, {
      headY: 1,
      chestScale: 0.94,
      tailAngle: 6,
      earPerk: 0.0,
      eyeOpen: 0.9,
      duration: def.exhale,
      ease: "power2.inOut",
    });

    // ── Phase 4: HOLD-OUT ──
    if (def.holdOut > 0) {
      this.timeline.add(() => {
        this.updateBadge("HOLD", def.holdOut);
        this.onPhaseChange?.("hold-out", def.holdOut);
      });

      this.timeline.to(this.anim, {
        tailAngle: -4,
        duration: def.holdOut * 0.5,
        yoyo: true,
        repeat: 1,
        ease: "steps(2)",
      });
    }
  }

  private updateBadge(phase: string, durationSec: number): void {
    if (this.badgeElement) {
      this.badgeElement.textContent = `${phase} // ${durationSec}S`;
    }
  }

  private startRenderLoop(): void {
    const render = () => {
      this.drawTabby();
      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);
  }

  /**
   * Draw crisp 1-Bit Pixel Art Cat Sprite on 128x128 Canvas
   */
  private drawTabby(): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background to pure brutalist white
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;

    // Pixel scale multiplier (each logical pixel is 2x2 physical pixels)
    const px = 2;

    const fillP = (x: number, y: number, pw: number, ph: number, color = "#000000") => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(cx + x * px), Math.round(cy + y * px), pw * px, ph * px);
    };

    const strokeL = (x1: number, y1: number, x2: number, y2: number, color = "#000000", width = 1) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * px;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx + x1 * px), Math.round(cy + y1 * px));
      ctx.lineTo(Math.round(cx + x2 * px), Math.round(cy + y2 * px));
      ctx.stroke();
    };

    // 1. Draw Tail (Behind body, with rotation)
    ctx.save();
    ctx.translate(cx + 12 * px, cy + 18 * px);
    ctx.rotate((this.anim.tailAngle * Math.PI) / 180);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, -12 * px, 4 * px, 14 * px);
    ctx.fillRect(3 * px, -18 * px, 5 * px, 8 * px);
    // Tail stripes
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, -8 * px, 4 * px, 2 * px);
    ctx.fillRect(3 * px, -14 * px, 5 * px, 2 * px);
    ctx.restore();

    // 2. Seated Body & Paws
    const cScale = this.anim.chestScale;
    const bodyHeight = 20 * cScale;
    const bodyWidth = 18 * Math.sqrt(cScale);

    // Dark body silhouette
    fillP(-bodyWidth * 0.5, 6, bodyWidth, bodyHeight, "#000000");

    // Paws at bottom
    fillP(-bodyWidth * 0.5, 23, 5, 4, "#000000");
    fillP(bodyWidth * 0.5 - 5, 23, 5, 4, "#000000");
    fillP(-2, 24, 4, 3, "#FFFFFF"); // Paw gap

    // Tabby chest stripes (White on Black)
    fillP(-4, 9, 8, 2, "#FFFFFF");
    fillP(-6, 14, 12, 2, "#FFFFFF");
    fillP(-5, 19, 10, 2, "#FFFFFF");

    // 3. Head & Ears (Shifted vertically by headY)
    const hy = -10 + this.anim.headY;
    const earLift = this.anim.earPerk * 2;

    // Head base (20 wide, 15 high)
    fillP(-10, hy, 20, 15, "#000000");

    // Left Ear
    fillP(-10, hy - 7 - earLift, 5, 7 + earLift, "#000000");
    fillP(-8, hy - 4 - earLift, 2, 4 + earLift, "#FFFFFF");

    // Right Ear
    fillP(5, hy - 7 - earLift, 5, 7 + earLift, "#000000");
    fillP(6, hy - 4 - earLift, 2, 4 + earLift, "#FFFFFF");

    // Tabby forehead M marking
    fillP(-3, hy + 2, 6, 2, "#FFFFFF");
    fillP(-5, hy + 5, 2, 2, "#FFFFFF");
    fillP(3, hy + 5, 2, 2, "#FFFFFF");

    // Eyes
    const eyeH = Math.max(1, Math.round(3 * this.anim.eyeOpen));
    // Left eye
    fillP(-7, hy + 7, 4, eyeH, "#FFFFFF");
    fillP(-6, hy + 7, 2, eyeH, "#000000");
    // Right eye
    fillP(3, hy + 7, 4, eyeH, "#FFFFFF");
    fillP(4, hy + 7, 2, eyeH, "#000000");

    // Pink/White nose
    fillP(-1, hy + 10, 2, 2, "#FFFFFF");

    // Whiskers (Crisp 1px black lines)
    strokeL(-18, hy + 10, -11, hy + 10, "#000000", 1);
    strokeL(-18, hy + 13, -11, hy + 11.5, "#000000", 1);
    strokeL(11, hy + 10, 18, hy + 10, "#000000", 1);
    strokeL(11, hy + 11.5, 18, hy + 13, "#000000", 1);
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
  }
}

export const spriteMetronome = new SpriteMetronomeController();
