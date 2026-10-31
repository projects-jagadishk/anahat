/**
 * ChladniCanvas.ts
 * Neuroacoustic Visualizer Engine (Three.js WebGL)
 * 
 * Supports two mathematical visualization modes:
 * 1. Chladni Particle System:
 *    Z = sin(n * PI * x) * sin(m * PI * y) ± sin(m * PI * x) * sin(n * PI * y)
 *    Particles migrate toward nodal lines tinted in #FF3333 against white background.
 * 
 * 2. Faraday Waves (Fluid Cymatics):
 *    Continuous 3D plane mesh (128x128 segments) with vertex displacement:
 *    wave = sin(length(uv - 0.5) * n * 10.0 - time * speed)
 *    interference = cos(uv.x * m * 15.0) * sin(uv.y * n * 15.0)
 *    Reacts sharply to amplitude.
 */

import * as THREE from "three";

export type VisualizerMode = "particles" | "fluid" | "oscillo";

export interface VisualizerUniforms {
  n: number;
  m: number;
  amplitude: number;
}

export class ChladniCanvas {
  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private animationId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private mode: VisualizerMode = "particles";
  private isPaused = false;
  private clock = new THREE.Clock();

  // Uniform parameters
  private uN = 4.0;
  private uM = 7.0;
  private uAmplitude = 0.7;
  private audioProvider?: () => number;

  // Breath Sync Engine (V1.5 Meditation)
  private breathPhase: "inhale" | "hold-in" | "exhale" | "hold-out" | "idle" = "idle";
  private currentBreathScale = 1.0;
  private targetBreathScale = 1.0;
  private breathLerpSpeed = 1.5;

  // Sine Wave Burst Shockwave
  private burstTime = 0.0;
  private burstActive = 0.0;
  private particleMaterial: THREE.ShaderMaterial | null = null;

  // Particle System
  private particleCount = 12000;
  private particlePoints: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private particleVelocities: Float32Array | null = null;
  private particleOriginalPositions: Float32Array | null = null;

  // Fluid Mesh
  private fluidMesh: THREE.Mesh | null = null;
  private fluidMaterial: THREE.ShaderMaterial | null = null;

  // Visual Shockwave Ring
  private shockwaveRing: THREE.Mesh | null = null;
  private shockwaveMaterial: THREE.ShaderMaterial | null = null;

  // Winamp Oscilloscope Waveform & Lissajous Engine
  private oscilloGroup: THREE.Group | null = null;
  private oscilloLines: THREE.Line[] = [];
  private oscilloPositions: Float32Array[] = [];
  private waveDataBuffer = new Uint8Array(256);
  private waveProvider?: (buf: Uint8Array) => void;

  mount(container: HTMLElement): void {
    this.container = container;
    const width = Math.max(container.clientWidth, 100);
    const height = Math.max(container.clientHeight, 100);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 1);
    container.innerHTML = "";
    container.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 2.4);
    this.camera.lookAt(0, 0, 0);

    // Initialize particle system
    this.initParticles();

    // Initialize fluid cymatics mesh
    this.initFluid();

    // Initialize Winamp oscilloscope waveforms
    this.initOscilloscope();

    // Initialize visible shockwave ring
    this.initShockwave();

    // Set initial mode visibility
    this.applyMode();

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Start render loop
    this.animate();
  }

  private initParticles(): void {
    const geometry = new THREE.BufferGeometry();
    const count = this.particleCount;
    this.particlePositions = new Float32Array(count * 3);
    this.particleVelocities = new Float32Array(count * 3);
    this.particleOriginalPositions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 1.8;
      const y = (Math.random() - 0.5) * 1.8;
      const idx = i * 3;

      this.particlePositions[idx] = x;
      this.particlePositions[idx + 1] = y;
      this.particlePositions[idx + 2] = 0;

      this.particleOriginalPositions[idx] = x;
      this.particleOriginalPositions[idx + 1] = y;
      this.particleOriginalPositions[idx + 2] = 0;

      this.particleVelocities[idx] = 0;
      this.particleVelocities[idx + 1] = 0;
      this.particleVelocities[idx + 2] = 0;
    }

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    // Hard-edged square particle shader with iridescent pastel spectrum gradient
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0.0 },
        u_n: { value: this.uN },
        u_m: { value: this.uM },
        u_burst_time: { value: 0.0 },
        u_burst_active: { value: 0.0 },
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_n;
        uniform float u_m;
        uniform float u_burst_time;
        uniform float u_burst_active;
        varying vec3 vColor;
        varying float vNodal;

        // Ethereal pastel spectrum palette: Coral -> Rose -> Lavender -> Sky -> Mint -> Amber
        vec3 pastelSpectrum(float t) {
          t = fract(t);
          vec3 c0 = vec3(1.0, 0.48, 0.38); // Vibrant Pastel Coral
          vec3 c1 = vec3(0.96, 0.38, 0.72); // Vibrant Pastel Rose
          vec3 c2 = vec3(0.66, 0.46, 0.98); // Vibrant Pastel Lavender
          vec3 c3 = vec3(0.30, 0.68, 0.98); // Vibrant Pastel Sky
          vec3 c4 = vec3(0.18, 0.84, 0.60); // Vibrant Pastel Seafoam Mint
          vec3 c5 = vec3(1.0, 0.82, 0.38); // Vibrant Pastel Amber Gold

          float seg = t * 5.0;
          if (seg < 1.0) return mix(c0, c1, seg);
          if (seg < 2.0) return mix(c1, c2, seg - 1.0);
          if (seg < 3.0) return mix(c2, c3, seg - 2.0);
          if (seg < 4.0) return mix(c3, c4, seg - 3.0);
          return mix(c4, c5, seg - 4.0);
        }

        void main() {
          vec3 p = position;
          float dist = length(p.xy);
          
          // Sine burst shockwave ripple propagating outward across particles
          if (u_burst_active > 0.01) {
            float waveDist = abs(dist - u_burst_time * 1.3);
            float burstRipple = sin(dist * 22.0 - u_burst_time * 16.0) * exp(-waveDist * 8.0) * exp(-u_burst_time * 2.0);
            p.xy += (p.xy / max(0.001, dist)) * burstRipple * 0.15 * u_burst_active;
          }

          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 4.2;
          gl_Position = projectionMatrix * mvPosition;

          // Compute Chladni nodal standing wave pattern
          float pi = 3.14159265;
          float wave = sin(u_n * pi * p.x) * sin(u_m * pi * p.y) - sin(u_m * pi * p.x) * sin(u_n * pi * p.y);
          vNodal = abs(wave);

          // Pastel spectrum gradient phase mapped across space and harmonic standing wave
          float angle = atan(p.y, p.x) / (2.0 * pi) + 0.5;
          float t = dist * 0.6 + angle * 0.35 + wave * 0.28 + u_time * 0.05;
          vColor = pastelSpectrum(t);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vNodal;
        uniform float u_burst_active;
        uniform float u_burst_time;

        void main() {
          vec3 col = vColor;
          
          // Nodal line intensity definition
          col = mix(col * 0.82, col * 1.18, smoothstep(0.0, 0.45, vNodal));

          // Concentric sine burst wave ripple highlight
          if (u_burst_active > 0.01) {
            float pulse = exp(-u_burst_time * 2.2) * u_burst_active;
            col = mix(col, vec3(1.0, 0.2, 0.2), pulse * 0.45);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: false,
    });

    this.particlePoints = new THREE.Points(geometry, this.particleMaterial);
    this.scene?.add(this.particlePoints);
  }

  private initFluid(): void {
    const geometry = new THREE.PlaneGeometry(2.0, 2.0, 96, 96);

    this.fluidMaterial = new THREE.ShaderMaterial({
      wireframe: true,
      uniforms: {
        u_time: { value: 0.0 },
        u_n: { value: this.uN },
        u_m: { value: this.uM },
        u_amplitude: { value: this.uAmplitude },
        u_breath_scale: { value: 1.0 },
        u_burst_time: { value: 0.0 },
        u_burst_active: { value: 0.0 },
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_n;
        uniform float u_m;
        uniform float u_amplitude;
        uniform float u_breath_scale;
        uniform float u_burst_time;
        uniform float u_burst_active;
        varying vec2 vUv;
        varying float vHeight;
        varying float vDist;
        varying vec3 vPastelColor;

        vec3 pastelSpectrum(float t) {
          t = fract(t);
          vec3 c0 = vec3(1.0, 0.52, 0.42); // Vibrant Pastel Coral
          vec3 c1 = vec3(0.96, 0.44, 0.76); // Vibrant Pastel Rose
          vec3 c2 = vec3(0.68, 0.52, 0.98); // Vibrant Pastel Lavender
          vec3 c3 = vec3(0.36, 0.70, 0.98); // Vibrant Pastel Sky
          vec3 c4 = vec3(0.24, 0.85, 0.65); // Vibrant Pastel Mint
          vec3 c5 = vec3(1.0, 0.84, 0.45); // Vibrant Pastel Amber Gold

          float seg = t * 5.0;
          if (seg < 1.0) return mix(c0, c1, seg);
          if (seg < 2.0) return mix(c1, c2, seg - 1.0);
          if (seg < 3.0) return mix(c2, c3, seg - 2.0);
          if (seg < 4.0) return mix(c3, c4, seg - 3.0);
          return mix(c4, c5, seg - 4.0);
        }

        void main() {
          vUv = uv;
          vec2 centered = (uv - 0.5) / max(0.5, u_breath_scale);
          float dist = length(centered);
          vDist = dist;

          // Standing circular waves + interference cross-ripples modulated by breath scale
          float wave = sin(dist * u_n * 14.0 - u_time * 3.5);
          float interference = cos(centered.x * u_m * 18.0) * sin(centered.y * u_n * 18.0);
          float h = (wave * 0.5 + interference * 0.5) * (u_amplitude * 0.28 * u_breath_scale);

          // Sine burst shockwave ripple propagating across fluid surface
          if (u_burst_active > 0.01) {
            float waveDist = abs(dist - u_burst_time * 0.95);
            float burstWave = sin(dist * 26.0 - u_burst_time * 18.0) * exp(-waveDist * 7.0) * exp(-u_burst_time * 1.8);
            h += burstWave * 0.24 * u_burst_active;
          }
          
          vHeight = h;
          vec3 displaced = position;
          displaced.xy *= u_breath_scale;
          displaced.z += h;

          // Shimmering pastel spectrum across standing ripples
          float t = h * 3.4 + dist * 1.6 + u_time * 0.06;
          vPastelColor = pastelSpectrum(t);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeight;
        varying float vDist;
        varying vec3 vPastelColor;
        uniform float u_burst_time;
        uniform float u_burst_active;

        void main() {
          // Shimmering wireframe with height depth contrast
          float depth = smoothstep(-0.15, 0.22, vHeight);
          vec3 finalColor = mix(vPastelColor * 0.8, vPastelColor * 1.25, depth);

          // Concentric sine burst shockwave highlight
          if (u_burst_active > 0.01) {
            float waveDist = abs(vDist - u_burst_time * 0.95);
            float ripple = exp(-waveDist * 6.0) * exp(-u_burst_time * 1.8);
            finalColor = mix(finalColor, vec3(1.0, 0.2, 0.2), ripple * 0.7 * u_burst_active);
          }

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });

    this.fluidMesh = new THREE.Mesh(geometry, this.fluidMaterial);
    // Slight tilt to see the 3D surface ripples
    this.fluidMesh.rotation.x = -Math.PI * 0.28;
    this.fluidMesh.position.y = -0.1;
    this.scene?.add(this.fluidMesh);
  }

  setAudioProvider(provider: () => number): void {
    this.audioProvider = provider;
  }

  setWaveProvider(provider: (buf: Uint8Array) => void): void {
    this.waveProvider = provider;
  }

  setMode(newMode: VisualizerMode): void {
    this.mode = newMode;
    this.applyMode();
  }

  getMode(): VisualizerMode {
    return this.mode;
  }

  private applyMode(): void {
    if (this.particlePoints) {
      this.particlePoints.visible = this.mode === "particles";
    }
    if (this.fluidMesh) {
      this.fluidMesh.visible = this.mode === "fluid";
    }
    if (this.oscilloGroup) {
      this.oscilloGroup.visible = this.mode === "oscillo";
    }
  }

  updateUniforms(uniforms: Partial<VisualizerUniforms>): void {
    if (uniforms.n !== undefined) this.uN = uniforms.n;
    if (uniforms.m !== undefined) this.uM = uniforms.m;
    if (uniforms.amplitude !== undefined) this.uAmplitude = uniforms.amplitude;

    if (this.particleMaterial) {
      this.particleMaterial.uniforms.u_n.value = this.uN;
      this.particleMaterial.uniforms.u_m.value = this.uM;
    }
    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_n.value = this.uN;
      this.fluidMaterial.uniforms.u_m.value = this.uM;
      this.fluidMaterial.uniforms.u_amplitude.value = this.uAmplitude;
    }
  }

  setBreathPhase(phase: "inhale" | "hold-in" | "exhale" | "hold-out" | "idle", durationSec = 4.0): void {
    this.breathPhase = phase;
    const safeDuration = Math.max(0.5, durationSec);

    switch (phase) {
      case "inhale":
        this.targetBreathScale = 1.65;
        this.breathLerpSpeed = 1.2 / safeDuration;
        break;
      case "hold-in":
        this.targetBreathScale = 1.65;
        this.breathLerpSpeed = 2.0;
        break;
      case "exhale":
        // Violent collapse on exhale as required by PRD §3.3
        this.targetBreathScale = 0.82;
        this.breathLerpSpeed = 2.8 / safeDuration;
        break;
      case "hold-out":
        this.targetBreathScale = 1.0;
        this.breathLerpSpeed = 2.0;
        break;
      case "idle":
      default:
        this.targetBreathScale = 1.0;
        this.breathLerpSpeed = 1.5;
        break;
    }
  }

  /**
   * Sine Wave Burst — Concentric physical shockwave propagation
   */
  triggerSineBurst(): void {
    this.burstActive = 1.0;
    this.burstTime = 0.0;
    if (this.shockwaveRing) {
      this.shockwaveRing.visible = true;
    }
  }

  triggerChimeFlash(_durationMs = 120): void {
    this.triggerSineBurst();
  }

  private initShockwave(): void {
    const geometry = new THREE.RingGeometry(0.02, 0.08, 64);
    this.shockwaveMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        u_progress: { value: 0.0 },
        u_opacity: { value: 0.0 },
      },
      vertexShader: `
        uniform float u_progress;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.xy *= max(0.01, u_progress * 26.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_opacity;
        varying vec2 vUv;
        void main() {
          // Luminous expanding shockwave ring with pastel lavender & accent red glow
          vec3 col = mix(vec3(1.0, 0.2, 0.2), vec3(0.78, 0.62, 0.98), vUv.x);
          gl_FragColor = vec4(col, u_opacity * 0.92);
        }
      `,
    });

    this.shockwaveRing = new THREE.Mesh(geometry, this.shockwaveMaterial);
    this.shockwaveRing.position.z = 0.03;
    this.shockwaveRing.visible = false;
    this.scene?.add(this.shockwaveRing);
  }

  private initOscilloscope(): void {
    this.oscilloGroup = new THREE.Group();
    const pointCount = 128;

    // Winamp-style multi-trace oscilloscope:
    // 0: Main Audio Time-Domain Waveform (Pastel Coral / Rose)
    // 1: Upper Harmonic Overtone Ribbon (Pastel Lavender / Sky)
    // 2: Lower Sub-Bass Resonance Wave (Pastel Mint / Cyan)
    // 3: 3D Lissajous Orbit Loop (Pastel Amber Gold)
    const traceDefs = [
      { yOffset: 0.0, hue: 0.0, z: 0.0 },
      { yOffset: 0.26, hue: 0.35, z: 0.08 },
      { yOffset: -0.26, hue: 0.65, z: -0.08 },
      { yOffset: 0.0, hue: 0.85, z: 0.15 },
    ];

    for (let t = 0; t < traceDefs.length; t++) {
      const positions = new Float32Array(pointCount * 3);
      const ratios = new Float32Array(pointCount);

      for (let i = 0; i < pointCount; i++) {
        const ratio = i / (pointCount - 1);
        ratios[i] = ratio;
        const x = (ratio - 0.5) * 1.8;
        const idx = i * 3;
        positions[idx] = x;
        positions[idx + 1] = traceDefs[t].yOffset;
        positions[idx + 2] = traceDefs[t].z;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("a_ratio", new THREE.BufferAttribute(ratios, 1));

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          u_time: { value: 0.0 },
          u_hue_offset: { value: traceDefs[t].hue },
        },
        vertexShader: `
          attribute float a_ratio;
          uniform float u_time;
          uniform float u_hue_offset;
          varying vec3 vColor;

          vec3 pastelSpectrum(float t) {
            t = fract(t);
            vec3 c0 = vec3(1.0, 0.48, 0.38); // Coral
            vec3 c1 = vec3(0.96, 0.40, 0.76); // Rose
            vec3 c2 = vec3(0.66, 0.48, 0.98); // Lavender
            vec3 c3 = vec3(0.30, 0.68, 0.98); // Sky
            vec3 c4 = vec3(0.20, 0.84, 0.62); // Mint
            vec3 c5 = vec3(1.0, 0.82, 0.42); // Amber

            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          }

          void main() {
            vColor = pastelSpectrum(a_ratio + u_time * 0.08 + u_hue_offset);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            gl_FragColor = vec4(vColor, 0.95);
          }
        `,
      });

      const line = t === 3 ? new THREE.LineLoop(geom, mat) : new THREE.Line(geom, mat);
      this.oscilloLines.push(line);
      this.oscilloPositions.push(positions);
      this.oscilloGroup.add(line);
    }

    this.oscilloGroup.visible = false;
    this.scene?.add(this.oscilloGroup);
  }

  private updateOscilloscope(delta: number, elapsedTime: number): void {
    if (!this.oscilloGroup || !this.oscilloGroup.visible) return;

    if (this.waveProvider) {
      this.waveProvider(this.waveDataBuffer);
    }

    const pointCount = 128;
    const amp = this.uAmplitude;
    const n = this.uN;
    const m = this.uM;

    for (let t = 0; t < this.oscilloLines.length; t++) {
      const line = this.oscilloLines[t];
      const pos = this.oscilloPositions[t];
      const mat = line.material as THREE.ShaderMaterial;
      if (mat.uniforms && mat.uniforms.u_time) {
        mat.uniforms.u_time.value = elapsedTime;
      }

      for (let i = 0; i < pointCount; i++) {
        const ratio = i / (pointCount - 1);
        const idx = i * 3;
        const waveByte = this.waveDataBuffer[(i * 2) % 256];
        const audioSample = (waveByte - 128) / 128.0; // -1.0 to 1.0

        if (t === 0) {
          // Main dynamic oscilloscope waveform
          pos[idx] = (ratio - 0.5) * 1.8;
          pos[idx + 1] = audioSample * 0.45 * amp;
          pos[idx + 2] = 0.0;
        } else if (t === 1) {
          // Upper harmonic wave (offset + sinusoidal ripple)
          pos[idx] = (ratio - 0.5) * 1.8;
          pos[idx + 1] = 0.28 + (audioSample * 0.25 + Math.sin(ratio * Math.PI * n + elapsedTime * 3.0) * 0.08) * amp;
          pos[idx + 2] = 0.08;
        } else if (t === 2) {
          // Lower sub-bass carrier ribbon
          pos[idx] = (ratio - 0.5) * 1.8;
          pos[idx + 1] = -0.28 + (audioSample * 0.25 + Math.cos(ratio * Math.PI * m - elapsedTime * 2.5) * 0.08) * amp;
          pos[idx + 2] = -0.08;
        } else if (t === 3) {
          // 3D Lissajous Orbit Loop (Classic Winamp rotating phase loop!)
          const theta = ratio * Math.PI * 2.0;
          pos[idx] = Math.cos(theta * Math.min(6, n) + elapsedTime * 0.8) * 0.55 + audioSample * 0.12 * amp;
          pos[idx + 1] = Math.sin(theta * Math.min(6, m) + elapsedTime * 0.5) * 0.55 + audioSample * 0.12 * amp;
          pos[idx + 2] = Math.sin(theta * (n + m) * 0.5) * 0.25;
        }
      }

      const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }

    // Subtle 3D camera float for Winamp immersion
    if (this.camera) {
      this.camera.position.x = Math.sin(elapsedTime * 0.3) * 0.12;
      this.camera.position.y = Math.cos(elapsedTime * 0.25) * 0.08;
      this.camera.lookAt(0, 0, 0);
    }
  }

  private chladni(x: number, y: number, n: number, m: number): number {
    const pi = Math.PI;
    // Chladni 2D nodal equation:
    // Z = sin(n * pi * x) * sin(m * pi * y) - sin(m * pi * x) * sin(n * pi * y)
    return (
      Math.sin(n * pi * x) * Math.sin(m * pi * y) -
      Math.sin(m * pi * x) * Math.sin(n * pi * y)
    );
  }

  /**
   * Smooth, gradual, organic particle physics
   * Solves erratic seizing with viscous inertia, normalized gradient steering, and harmonic curl drift.
   */
  private updateParticles(delta: number): void {
    if (!this.particlePositions || !this.particleVelocities || !this.particlePoints) return;

    const count = this.particleCount;
    const n = this.uN;
    const m = this.uM;
    const amp = this.uAmplitude;
    const eps = 0.012;

    // Smooth, gradual target speed (scaled down so particles glide like silk)
    const baseSpeed = (this.breathPhase === "exhale" ? 0.32 : 0.12) * Math.max(0.4, amp);
    const damping = 0.94;
    const time = this.clock.getElapsedTime();

    // Shockwave physical outward push
    const shockRadius = this.burstActive > 0.0 ? this.burstTime * 1.5 : -1.0;
    const shockStrength = this.burstActive > 0.0 ? Math.max(0.0, 1.0 - this.burstTime / 1.5) * 0.45 : 0.0;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      let x = this.particlePositions[idx];
      let y = this.particlePositions[idx + 1];
      let vx = this.particleVelocities[idx];
      let vy = this.particleVelocities[idx + 1];

      // 1. Physical Shockwave push if wave passes through particle
      if (shockRadius > 0.0) {
        const dist = Math.sqrt(x * x + y * y) + 0.001;
        const dDiff = dist - shockRadius;
        if (Math.abs(dDiff) < 0.18) {
          const push = Math.sin((dDiff / 0.18) * Math.PI) * shockStrength;
          vx += (x / dist) * push * 0.15;
          vy += (y / dist) * push * 0.15;
        }
      }

      // 2. Breath Sync gentle radial expansion/collapse
      const rad = Math.sqrt(x * x + y * y) + 0.001;
      if (this.breathPhase === "inhale") {
        vx += (x / rad) * 0.035 * delta;
        vy += (y / rad) * 0.035 * delta;
      } else if (this.breathPhase === "exhale") {
        vx -= (x / rad) * 0.055 * delta;
        vy -= (y / rad) * 0.055 * delta;
      }

      // 3. Numerical gradient of Chladni function
      const val = this.chladni(x, y, n, m);
      const gradX = (this.chladni(x + eps, y, n, m) - val) / eps;
      const gradY = (this.chladni(x, y + eps, n, m) - val) / eps;
      const gLen = Math.sqrt(gradX * gradX + gradY * gradY) + 0.001;

      // Normalized gradient steering: migrate down gradient toward nodal zero lines (val = 0)
      const pull = Math.sign(val) * Math.min(1.0, Math.abs(val) * 2.5);
      const targetVx = -pull * (gradX / gLen) * baseSpeed;
      const targetVy = -pull * (gradY / gLen) * baseSpeed;

      // Smooth acceleration with viscous fluid damping
      vx = vx * damping + targetVx * (1.0 - damping);
      vy = vy * damping + targetVy * (1.0 - damping);

      // 4. Smooth organic wander (continuous harmonic curl instead of random white noise jitter)
      const driftAngle = (i * 0.08 + time * 0.4) % (Math.PI * 2);
      vx += Math.cos(driftAngle) * 0.0003;
      vy += Math.sin(driftAngle) * 0.0003;

      // Position integration
      x += vx * delta * 60;
      y += vy * delta * 60;

      // Soft boundary reflection (gentle bounce, never seizing or teleporting)
      if (x < -0.92) { x = -0.92; vx = -vx * 0.5; }
      if (x > 0.92)  { x = 0.92;  vx = -vx * 0.5; }
      if (y < -0.92) { y = -0.92; vy = -vy * 0.5; }
      if (y > 0.92)  { y = 0.92;  vy = -vy * 0.5; }

      this.particlePositions[idx] = x;
      this.particlePositions[idx + 1] = y;
      this.particleVelocities[idx] = vx;
      this.particleVelocities[idx + 1] = vy;
    }

    const posAttr = this.particlePoints.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  private handleResize(): void {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = (): void => {
    if (this.isPaused) return;
    this.animationId = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // Advance Sine Burst shockwave
    if (this.burstActive > 0.0) {
      this.burstTime += delta;
      const progress = this.burstTime / 1.5;
      if (this.shockwaveRing && this.shockwaveMaterial) {
        this.shockwaveRing.visible = true;
        this.shockwaveMaterial.uniforms.u_progress.value = progress;
        this.shockwaveMaterial.uniforms.u_opacity.value = Math.max(0.0, 1.0 - progress);
      }
      if (this.burstTime > 1.5) {
        this.burstActive = 0.0;
        if (this.shockwaveRing) {
          this.shockwaveRing.visible = false;
        }
      }
    }

    // Lerp breath expansion scale smoothly
    this.currentBreathScale +=
      (this.targetBreathScale - this.currentBreathScale) *
      Math.min(1.0, delta * this.breathLerpSpeed * 2.5);

    if (this.particleMaterial) {
      this.particleMaterial.uniforms.u_time.value = elapsedTime;
      this.particleMaterial.uniforms.u_burst_time.value = this.burstTime;
      this.particleMaterial.uniforms.u_burst_active.value = this.burstActive;
    }

    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_breath_scale.value = this.currentBreathScale;
      this.fluidMaterial.uniforms.u_burst_time.value = this.burstTime;
      this.fluidMaterial.uniforms.u_burst_active.value = this.burstActive;
    }

    if (this.audioProvider) {
      const liveAmp = this.audioProvider();
      if (liveAmp > 0.01) {
        this.uAmplitude = Math.max(0.2, Math.min(1.5, liveAmp * 2.5));
        if (this.fluidMaterial) {
          this.fluidMaterial.uniforms.u_amplitude.value = this.uAmplitude;
        }
      }
    }

    if (this.mode === "particles") {
      this.updateParticles(delta);
    } else if (this.mode === "fluid" && this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_time.value = elapsedTime;
    } else if (this.mode === "oscillo") {
      this.updateOscilloscope(delta, elapsedTime);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  pause(): void {
    this.isPaused = true;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.clock.start();
    this.animate();
  }

  setClearColor(hex: number, alpha = 1.0): void {
    this.renderer?.setClearColor(hex, alpha);
  }

  dispose(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.particlePoints) {
      this.particlePoints.geometry.dispose();
      (this.particlePoints.material as THREE.Material).dispose();
      this.particlePoints = null;
    }

    if (this.fluidMesh) {
      this.fluidMesh.geometry.dispose();
      this.fluidMaterial?.dispose();
      this.fluidMesh = null;
    }

    this.renderer?.dispose();
    if (this.renderer?.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}
