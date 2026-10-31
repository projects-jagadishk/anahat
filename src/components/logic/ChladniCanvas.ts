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

export type VisualizerMode =
  | "particles"
  | "fluid"
  | "oscillo"
  | "radar"
  | "waterfall"
  | "torus"
  | "voxel_grid"
  | "tunnel"
  | "digital_scope"
  | "wire_tunnel";

export type VisualPalette = "pastel" | "stark" | "monochrome" | "amber_crt" | "green_crt" | "cyber_blue";
export type GeometryDetail = "low" | "mid" | "high" | "ultra";
export type ThicknessLevel = "fine" | "normal" | "bold" | "chunky";
export type CameraPreset = "front" | "isometric" | "top" | "custom";

export interface EngineMeta {
  id: VisualizerMode;
  code: string;
  num: string;
  name: string;
  category: string;
  description: string;
  hotkey: string;
}

export const VISUALIZER_ENGINES: EngineMeta[] = [
  { id: "particles", code: "ENG_01", num: "01", name: "CHLADNI NODES", category: "PHYSICS", description: "2D acoustic nodal sand migration", hotkey: "1" },
  { id: "fluid", code: "ENG_02", num: "02", name: "FARADAY FLUID", category: "CYMATICS", description: "3D standing parametric liquid wireframe", hotkey: "2" },
  { id: "oscillo", code: "ENG_03", num: "03", name: "WINAMP OSCILLO", category: "SPECTRUM", description: "Multi-trace time-domain ribbons & Lissajous", hotkey: "3" },
  { id: "radar", code: "ENG_04", num: "04", name: "POLAR RADAR", category: "SPECTRUM", description: "360° circular FFT spectrum analyzer & sweep", hotkey: "4" },
  { id: "waterfall", code: "ENG_05", num: "05", name: "3D WATERFALL", category: "SONOGRAM", description: "Rolling FFT topographic frequency terrain", hotkey: "5" },
  { id: "torus", code: "ENG_06", num: "06", name: "TORUS VORTEX", category: "FLUX FIELD", description: "Toroidal electromagnetic circulation", hotkey: "6" },
  { id: "voxel_grid", code: "ENG_07", num: "07", name: "VOXEL MATRIX", category: "EQUALIZER", description: "3D architectural equalizer tower city", hotkey: "7" },
  { id: "tunnel", code: "ENG_08", num: "08", name: "WARP TUNNEL", category: "PERSPECTIVE", description: "Infinite 3D acoustic perspective corridor", hotkey: "8" },
  { id: "digital_scope", code: "ENG_09", num: "09", name: "DIGITAL SCOPE", category: "LABORATORY", description: "Precision DSO lab oscilloscope with edge trigger", hotkey: "9" },
  { id: "wire_tunnel", code: "ENG_10", num: "10", name: "NEON WIRE TUNNEL", category: "CYBERSPACE", description: "Retro-futuristic wireframe tunnel with neon conduits", hotkey: "0" },
];

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

  // Visual Styling & Density Engine
  private currentPalette: VisualPalette = "pastel";
  private currentDetail: GeometryDetail = "high";
  private currentThickness: ThicknessLevel = "normal";
  private visualGain = 1.0;

  // 3D Camera Engine (Static, non-orbiting)
  private cameraSpeed = 0.0;
  private cameraPreset: CameraPreset = "front";
  private cameraDistance = 2.4;
  private cameraElevation = 0.0;
  private cameraAzimuth = 0.0;
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  public onCameraPresetChange?: (preset: CameraPreset) => void;

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

  // FFT Frequency Spectrum Buffer & Provider
  private freqDataBuffer = new Uint8Array(128);
  private freqProvider?: (buf: Uint8Array) => void;

  // Visualizer Background Mode
  private isDark = false;

  // 04 // Polar Radar (Circular FFT Spectrum Analyzer)
  private radarGroup: THREE.Group | null = null;
  private radarBarsLine: THREE.LineSegments | null = null;
  private radarPeakLine: THREE.LineSegments | null = null;
  private radarSweepLine: THREE.Line | null = null;
  private radarPeakHold = new Float32Array(96);
  private radarSweepAngle = 0.0;

  // 05 // 3D Waterfall Topographic Terrain
  private waterfallMesh: THREE.Mesh | null = null;
  private waterfallMaterial: THREE.ShaderMaterial | null = null;

  // 06 // Torus Vortex & Flux Field
  private torusGroup: THREE.Group | null = null;
  private torusMesh: THREE.Mesh | null = null;
  private torusStreamlines: THREE.LineLoop[] = [];
  private torusStreamlinePos: Float32Array[] = [];

  // 07 // Voxel Matrix (3D Equalizer Tower City)
  private voxelGroup: THREE.Group | null = null;
  private voxelMesh: THREE.InstancedMesh | null = null;
  private voxelCapMesh: THREE.InstancedMesh | null = null;
  private voxelPeaks: Float32Array = new Float32Array(256);

  // 08 // Warp Tunnel (3D Acoustic Perspective Corridor)
  private tunnelGroup: THREE.Group | null = null;
  private tunnelRings: THREE.LineLoop[] = [];
  private tunnelRingPos: Float32Array[] = [];
  private tunnelRingColors: Float32Array[] = [];
  private tunnelRingZ = new Float32Array(24);
  private tunnelRibsLine: THREE.LineSegments | null = null;
  private tunnelRibsPos: Float32Array | null = null;
  private tunnelRibsCol: Float32Array | null = null;
  private tunnelRibColors: THREE.Color[] = [];

  // 09 // Laboratory Digital Storage Oscilloscope (DSO with Edge Trigger)
  private digitalScopeGroup: THREE.Group | null = null;
  private dsoScreenMesh: THREE.Mesh | null = null;
  private dsoCh1Line: THREE.Line | null = null;
  private dsoCh1GhostLine: THREE.Line | null = null;
  private dsoCh2Line: THREE.Line | null = null;
  private dsoGhostPos: Float32Array = new Float32Array(0);
  private dsoTriggerMarker: THREE.Line | null = null;

  // 11 // Neon Wire Tunnel (Retro-Futuristic Cyber Conduit Corridor)
  private wireTunnelGroup: THREE.Group | null = null;
  private wireRings: THREE.LineLoop[] = [];
  private wireRingZ: number[] = [];
  private wireRingRadius: number[] = [];
  private wireConduitsLine: THREE.LineSegments | null = null;
  private wireConduitsPos: Float32Array = new Float32Array(0);
  private wireLatticeLine: THREE.LineSegments | null = null;
  private wireLatticePos: Float32Array = new Float32Array(0);
  private readonly wireRingCount = 30;
  private readonly wireSides = 12;

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

    // Initialize all 11 Visualizer Engines
    this.initParticles();    // 01 // Chladni Nodes
    this.initFluid();        // 02 // Faraday Fluid
    this.initOscilloscope(); // 03 // Winamp Oscilloscope
    this.initRadar();        // 04 // Polar Radar
    this.initWaterfall();    // 05 // 3D Waterfall
    this.initTorus();        // 06 // Torus Vortex
    this.initVoxelGrid();    // 07 // Voxel Matrix
    this.initTunnel();       // 08 // Warp Tunnel
    this.initDigitalScope(); // 09 // Digital Scope
    this.initWireTunnel();   // 10 // Neon Wire Tunnel

    // Initialize visible shockwave ring
    this.initShockwave();

    // Set initial mode visibility
    this.applyMode();

    // Initialize interactive 3D pointer controls
    this.initCameraControls();

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
        u_palette: { value: 0 },
        u_point_size: { value: 3.8 },
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_n;
        uniform float u_m;
        uniform float u_burst_time;
        uniform float u_burst_active;
        uniform int u_palette;
        uniform float u_point_size;
        varying vec3 vColor;
        varying float vNodal;

        // Dynamic multi-palette shader engine
        vec3 getPaletteColor(float t) {
          t = fract(t);
          if (u_palette == 1) {
            // Monochrome Brutalist
            float w = smoothstep(0.4, 0.6, sin(t * 6.28318));
            return mix(vec3(0.92, 0.92, 0.92), vec3(1.0, 0.2, 0.2), w * 0.5);
          } else if (u_palette == 2) {
            // Amber CRT Phosphor (589nm)
            vec3 c0 = vec3(0.85, 0.40, 0.0);
            vec3 c1 = vec3(1.0, 0.70, 0.0);
            vec3 c2 = vec3(1.0, 0.92, 0.45);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 3) {
            // Green CRT Phosphor (P1 525nm)
            vec3 c0 = vec3(0.0, 0.55, 0.15);
            vec3 c1 = vec3(0.15, 0.95, 0.35);
            vec3 c2 = vec3(0.75, 1.0, 0.75);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 4) {
            // Cyber Blue
            vec3 c0 = vec3(0.0, 0.30, 0.85);
            vec3 c1 = vec3(0.0, 0.80, 1.0);
            vec3 c2 = vec3(0.70, 0.98, 1.0);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 5) {
            // Stark Chromatic Spectrum (high saturation, high contrast)
            vec3 c0 = vec3(1.0, 0.08, 0.20); // Stark Crimson Red
            vec3 c1 = vec3(1.0, 0.05, 0.78); // Hot Electric Magenta
            vec3 c2 = vec3(0.55, 0.05, 1.0);  // Deep Laser Violet
            vec3 c3 = vec3(0.0, 0.90, 1.0);   // Electric Stark Cyan
            vec3 c4 = vec3(0.08, 1.0, 0.32);  // Acid Neon Green
            vec3 c5 = vec3(1.0, 0.76, 0.0);   // Intense Pure Amber Gold
            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          } else {
            // Vibrant Pastel Spectrum (Coral, Rose, Lavender, Sky, Mint, Gold)
            vec3 c0 = vec3(1.0, 0.52, 0.42); // Coral
            vec3 c1 = vec3(0.96, 0.44, 0.76); // Rose
            vec3 c2 = vec3(0.68, 0.52, 0.98); // Lavender
            vec3 c3 = vec3(0.36, 0.70, 0.98); // Sky
            vec3 c4 = vec3(0.24, 0.85, 0.65); // Mint
            vec3 c5 = vec3(1.0, 0.84, 0.45); // Amber Gold
            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          }
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
          gl_PointSize = u_point_size;
          gl_Position = projectionMatrix * mvPosition;

          // Compute Chladni nodal standing wave pattern
          float pi = 3.14159265;
          float wave = sin(u_n * pi * p.x) * sin(u_m * pi * p.y) - sin(u_m * pi * p.x) * sin(u_n * pi * p.y);
          vNodal = abs(wave);

          // Spectrum gradient phase mapped across space and harmonic standing wave
          float angle = atan(p.y, p.x) / (2.0 * pi) + 0.5;
          float t = dist * 0.6 + angle * 0.35 + wave * 0.28 + u_time * 0.05;
          vColor = getPaletteColor(t);
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
        u_palette: { value: 0 },
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_n;
        uniform float u_m;
        uniform float u_amplitude;
        uniform float u_breath_scale;
        uniform float u_burst_time;
        uniform float u_burst_active;
        uniform int u_palette;
        varying vec2 vUv;
        varying float vHeight;
        varying float vDist;
        varying vec3 vPastelColor;

        vec3 getPaletteColor(float t) {
          t = fract(t);
          if (u_palette == 1) {
            // Monochrome Brutalist
            float w = smoothstep(0.4, 0.6, sin(t * 6.28318));
            return mix(vec3(0.92, 0.92, 0.92), vec3(1.0, 0.2, 0.2), w * 0.5);
          } else if (u_palette == 2) {
            // Amber CRT Phosphor (589nm)
            vec3 c0 = vec3(0.85, 0.40, 0.0);
            vec3 c1 = vec3(1.0, 0.70, 0.0);
            vec3 c2 = vec3(1.0, 0.92, 0.45);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 3) {
            // Green CRT Phosphor (P1 525nm)
            vec3 c0 = vec3(0.0, 0.55, 0.15);
            vec3 c1 = vec3(0.15, 0.95, 0.35);
            vec3 c2 = vec3(0.75, 1.0, 0.75);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 4) {
            // Cyber Blue
            vec3 c0 = vec3(0.0, 0.30, 0.85);
            vec3 c1 = vec3(0.0, 0.80, 1.0);
            vec3 c2 = vec3(0.70, 0.98, 1.0);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 5) {
            // Stark Chromatic Spectrum (high saturation, high contrast)
            vec3 c0 = vec3(1.0, 0.08, 0.20); // Stark Crimson Red
            vec3 c1 = vec3(1.0, 0.05, 0.78); // Hot Electric Magenta
            vec3 c2 = vec3(0.55, 0.05, 1.0);  // Deep Laser Violet
            vec3 c3 = vec3(0.0, 0.90, 1.0);   // Electric Stark Cyan
            vec3 c4 = vec3(0.08, 1.0, 0.32);  // Acid Neon Green
            vec3 c5 = vec3(1.0, 0.76, 0.0);   // Intense Pure Amber Gold
            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          } else {
            // Vibrant Pastel Spectrum (Coral, Rose, Lavender, Sky, Mint, Gold)
            vec3 c0 = vec3(1.0, 0.52, 0.42); // Coral
            vec3 c1 = vec3(0.96, 0.44, 0.76); // Rose
            vec3 c2 = vec3(0.68, 0.52, 0.98); // Lavender
            vec3 c3 = vec3(0.36, 0.70, 0.98); // Sky
            vec3 c4 = vec3(0.24, 0.85, 0.65); // Mint
            vec3 c5 = vec3(1.0, 0.84, 0.45); // Amber Gold
            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          }
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

          // Shimmering color spectrum across standing ripples
          float t = h * 3.4 + dist * 1.6 + u_time * 0.06;
          vPastelColor = getPaletteColor(t);

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

  setFreqProvider(provider: (buf: Uint8Array) => void): void {
    this.freqProvider = provider;
  }

  setMode(newMode: VisualizerMode): void {
    this.mode = newMode;
    this.applyMode();
  }

  getMode(): VisualizerMode {
    return this.mode;
  }

  private applyMode(): void {
    if (this.particlePoints) this.particlePoints.visible = this.mode === "particles";
    if (this.fluidMesh) this.fluidMesh.visible = this.mode === "fluid";
    if (this.oscilloGroup) this.oscilloGroup.visible = this.mode === "oscillo";
    if (this.radarGroup) this.radarGroup.visible = this.mode === "radar";
    if (this.waterfallMesh) this.waterfallMesh.visible = this.mode === "waterfall";
    if (this.torusGroup) this.torusGroup.visible = this.mode === "torus";
    if (this.voxelGroup) this.voxelGroup.visible = this.mode === "voxel_grid";
    if (this.tunnelGroup) this.tunnelGroup.visible = this.mode === "tunnel";
    if (this.digitalScopeGroup) this.digitalScopeGroup.visible = this.mode === "digital_scope";
    if (this.wireTunnelGroup) this.wireTunnelGroup.visible = this.mode === "wire_tunnel";
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
          u_is_dark: { value: this.isDark ? 1.0 : 0.0 },
        },
        vertexShader: `
          attribute float a_ratio;
          uniform float u_time;
          uniform float u_hue_offset;
          varying vec3 vColor;

          // High-contrast spectrum palette (Intense Crimson -> Royal Cobalt -> Emerald -> Gold -> Violet)
          vec3 vibrantSpectrum(float t) {
            t = fract(t);
            vec3 c0 = vec3(1.0, 0.18, 0.22); // Industrial Crimson
            vec3 c1 = vec3(0.95, 0.22, 0.65); // Deep Magenta
            vec3 c2 = vec3(0.02, 0.45, 0.95); // Deep Cobalt
            vec3 c3 = vec3(0.02, 0.75, 0.45); // Deep Emerald
            vec3 c4 = vec3(0.95, 0.55, 0.05); // Amber Gold
            vec3 c5 = vec3(0.55, 0.12, 0.92); // Electric Violet

            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          }

          void main() {
            vColor = vibrantSpectrum(a_ratio + u_time * 0.08 + u_hue_offset);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          uniform float u_is_dark;

          void main() {
            vec3 col = vColor;
            if (u_is_dark < 0.5) {
              // Light canvas: bold, deep, saturated line with dark edge weighting
              col = mix(vec3(0.06), col, 0.90);
            }
            gl_FragColor = vec4(col, 0.95);
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
      if (mat.uniforms) {
        if (mat.uniforms.u_time) mat.uniforms.u_time.value = elapsedTime;
        if (mat.uniforms.u_is_dark) mat.uniforms.u_is_dark.value = this.isDark ? 1.0 : 0.0;
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
  }

  // ═══════════════════════════════════════════════════════════
  // MULTI-PALETTE SPECTRUM COLOR SAMPLER
  // ═══════════════════════════════════════════════════════════

  samplePalette(t: number): THREE.Color {
    t = ((t % 1) + 1) % 1;
    if (this.currentPalette === "monochrome") {
      const w = Math.sin(t * Math.PI * 2.0) * 0.5 + 0.5;
      return new THREE.Color(0.88, 0.88, 0.88).lerp(new THREE.Color(1.0, 0.2, 0.2), w > 0.65 ? 0.6 : 0.0);
    }
    if (this.currentPalette === "amber_crt") {
      const c0 = new THREE.Color(0.85, 0.40, 0.0);
      const c1 = new THREE.Color(1.0, 0.70, 0.0);
      const c2 = new THREE.Color(1.0, 0.92, 0.45);
      return t < 0.5 ? c0.clone().lerp(c1, t * 2.0) : c1.clone().lerp(c2, (t - 0.5) * 2.0);
    }
    if (this.currentPalette === "green_crt") {
      const c0 = new THREE.Color(0.0, 0.55, 0.15);
      const c1 = new THREE.Color(0.15, 0.95, 0.35);
      const c2 = new THREE.Color(0.75, 1.0, 0.75);
      return t < 0.5 ? c0.clone().lerp(c1, t * 2.0) : c1.clone().lerp(c2, (t - 0.5) * 2.0);
    }
    if (this.currentPalette === "cyber_blue") {
      const c0 = new THREE.Color(0.0, 0.30, 0.85);
      const c1 = new THREE.Color(0.0, 0.80, 1.0);
      const c2 = new THREE.Color(0.70, 0.98, 1.0);
      return t < 0.5 ? c0.clone().lerp(c1, t * 2.0) : c1.clone().lerp(c2, (t - 0.5) * 2.0);
    }
    if (this.currentPalette === "stark") {
      // Stark Chromatic Spectrum (high saturation, high contrast)
      const c0 = new THREE.Color(1.0, 0.08, 0.20); // Stark Crimson Red
      const c1 = new THREE.Color(1.0, 0.05, 0.78); // Hot Electric Magenta
      const c2 = new THREE.Color(0.55, 0.05, 1.0);  // Deep Laser Violet
      const c3 = new THREE.Color(0.0, 0.90, 1.0);   // Electric Stark Cyan
      const c4 = new THREE.Color(0.08, 1.0, 0.32);  // Acid Neon Green
      const c5 = new THREE.Color(1.0, 0.76, 0.0);   // Intense Pure Amber Gold

      const seg = t * 5.0;
      if (seg < 1.0) return c0.clone().lerp(c1, seg);
      if (seg < 2.0) return c1.clone().lerp(c2, seg - 1.0);
      if (seg < 3.0) return c2.clone().lerp(c3, seg - 2.0);
      if (seg < 4.0) return c3.clone().lerp(c4, seg - 3.0);
      return c4.clone().lerp(c5, seg - 4.0);
    }
    // Vibrant Pastel Spectrum (Coral, Rose, Lavender, Sky, Mint, Gold)
    const c0 = new THREE.Color(1.0, 0.52, 0.42); // Coral
    const c1 = new THREE.Color(0.96, 0.44, 0.76); // Rose
    const c2 = new THREE.Color(0.68, 0.52, 0.98); // Lavender
    const c3 = new THREE.Color(0.36, 0.70, 0.98); // Sky
    const c4 = new THREE.Color(0.24, 0.85, 0.65); // Mint
    const c5 = new THREE.Color(1.0, 0.84, 0.45); // Amber Gold

    const seg = t * 5.0;
    if (seg < 1.0) return c0.clone().lerp(c1, seg);
    if (seg < 2.0) return c1.clone().lerp(c2, seg - 1.0);
    if (seg < 3.0) return c2.clone().lerp(c3, seg - 2.0);
    if (seg < 4.0) return c3.clone().lerp(c4, seg - 3.0);
    return c4.clone().lerp(c5, seg - 4.0);
  }

  private samplePastelSpectrum(t: number): THREE.Color {
    return this.samplePalette(t);
  }

  // ═══════════════════════════════════════════════════════════
  // 04 // POLAR RADAR (CIRCULAR FFT SPECTRUM ANALYZER & SWEEP)
  // ═══════════════════════════════════════════════════════════

  private initRadar(): void {
    this.radarGroup = new THREE.Group();

    // 1. Precision Calibrated Outer Compass Rim & Degree Ticks
    const outerGeo = new THREE.BufferGeometry();
    const rimSegs = 180;
    const rimPos = new Float32Array((rimSegs + 1) * 3);
    for (let i = 0; i <= rimSegs; i++) {
      const th = (i / rimSegs) * Math.PI * 2.0;
      rimPos[i * 3] = Math.cos(th) * 0.94;
      rimPos[i * 3 + 1] = Math.sin(th) * 0.94;
      rimPos[i * 3 + 2] = 0;
    }
    outerGeo.setAttribute("position", new THREE.BufferAttribute(rimPos, 3));
    const rimMat = new THREE.LineBasicMaterial({
      color: 0x111111,
      linewidth: 2.0,
      transparent: true,
      opacity: 0.85,
    });
    this.radarGroup.add(new THREE.Line(outerGeo, rimMat));

    // 72 Precision Degree Calibration Ticks on Rim (every 5 degrees)
    const tickGeo = new THREE.BufferGeometry();
    const tickPos = new Float32Array(72 * 2 * 3);
    for (let i = 0; i < 72; i++) {
      const th = (i / 72) * Math.PI * 2.0;
      const r1 = i % 18 === 0 ? 0.86 : (i % 2 === 0 ? 0.89 : 0.915);
      const r2 = 0.94;
      const idx = i * 6;
      tickPos[idx] = Math.cos(th) * r1;
      tickPos[idx + 1] = Math.sin(th) * r1;
      tickPos[idx + 2] = 0;
      tickPos[idx + 3] = Math.cos(th) * r2;
      tickPos[idx + 4] = Math.sin(th) * r2;
      tickPos[idx + 5] = 0;
    }
    tickGeo.setAttribute("position", new THREE.BufferAttribute(tickPos, 3));
    this.radarGroup.add(new THREE.LineSegments(tickGeo, rimMat));

    // 2. Concentric dB Reference Rings (-18dB, -12dB, -6dB)
    const dbRadii = [0.44, 0.60, 0.76];
    const dbMat = new THREE.LineBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.28,
    });
    dbRadii.forEach((radius) => {
      const dbGeo = new THREE.BufferGeometry();
      const dbPos = new Float32Array((rimSegs + 1) * 3);
      for (let i = 0; i <= rimSegs; i++) {
        const th = (i / rimSegs) * Math.PI * 2.0;
        dbPos[i * 3] = Math.cos(th) * radius;
        dbPos[i * 3 + 1] = Math.sin(th) * radius;
        dbPos[i * 3 + 2] = -0.01;
      }
      dbGeo.setAttribute("position", new THREE.BufferAttribute(dbPos, 3));
      this.radarGroup?.add(new THREE.Line(dbGeo, dbMat));
    });

    // 3. Central Core Hub (r = 0.28) & Laboratory Crosshairs
    const hubGeo = new THREE.BufferGeometry();
    const hubPos = new Float32Array((rimSegs + 1) * 3);
    for (let i = 0; i <= rimSegs; i++) {
      const th = (i / rimSegs) * Math.PI * 2.0;
      hubPos[i * 3] = Math.cos(th) * 0.28;
      hubPos[i * 3 + 1] = Math.sin(th) * 0.28;
      hubPos[i * 3 + 2] = 0;
    }
    hubGeo.setAttribute("position", new THREE.BufferAttribute(hubPos, 3));
    this.radarGroup.add(new THREE.Line(hubGeo, new THREE.LineBasicMaterial({ color: 0xFF3333, linewidth: 2.0 })));

    // Crosshairs through center
    const crossGeo = new THREE.BufferGeometry();
    const crossPos = new Float32Array([
      -0.28, 0, 0,  0.28, 0, 0,
      0, -0.28, 0,  0, 0.28, 0,
    ]);
    crossGeo.setAttribute("position", new THREE.BufferAttribute(crossPos, 3));
    this.radarGroup.add(new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: 0x111111, opacity: 0.5, transparent: true })));

    // 4. 96 Radial Spectrum Bars (Discrete Brutalist Frequency Teeth)
    const barCount = 96;
    const barGeo = new THREE.BufferGeometry();
    const barPos = new Float32Array(barCount * 2 * 3);
    const barCols = new Float32Array(barCount * 2 * 3);
    barGeo.setAttribute("position", new THREE.BufferAttribute(barPos, 3));
    barGeo.setAttribute("color", new THREE.BufferAttribute(barCols, 3));

    const barMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2.0,
      transparent: true,
      opacity: 0.95,
    });
    this.radarBarsLine = new THREE.LineSegments(barGeo, barMat);
    this.radarGroup.add(this.radarBarsLine);

    // 5. 96 Floating Peak-Hold Markers
    const peakGeo = new THREE.BufferGeometry();
    const peakPos = new Float32Array(barCount * 2 * 3);
    peakGeo.setAttribute("position", new THREE.BufferAttribute(peakPos, 3));
    const peakMat = new THREE.LineSegments(peakGeo, new THREE.LineBasicMaterial({
      color: 0xFF3333,
      linewidth: 2.5,
      transparent: true,
      opacity: 0.95,
    }));
    this.radarPeakLine = peakMat;
    this.radarGroup.add(this.radarPeakLine);

    // 6. Rotating Sonar Sweep Beam
    const sweepGeo = new THREE.BufferGeometry();
    const sweepPos = new Float32Array([0, 0, 0.01, 0.94, 0, 0.01]);
    sweepGeo.setAttribute("position", new THREE.BufferAttribute(sweepPos, 3));
    const sweepMat = new THREE.LineBasicMaterial({
      color: 0x0055CC,
      linewidth: 2.0,
      transparent: true,
      opacity: 0.85,
    });
    this.radarSweepLine = new THREE.Line(sweepGeo, sweepMat);
    this.radarGroup.add(this.radarSweepLine);

    this.scene?.add(this.radarGroup);
  }

  private updateRadar(delta: number, time: number): void {
    if (!this.radarGroup || !this.radarBarsLine || !this.radarPeakLine) return;

    if (this.freqProvider) {
      this.freqProvider(this.freqDataBuffer);
    }

    const barCount = 96;
    const breath = this.currentBreathScale;
    const amp = this.uAmplitude;
    const n = Math.max(1, Math.min(8, Math.round(this.uN)));
    const m = Math.max(1, Math.min(8, Math.round(this.uM)));

    // Advance sweep angle
    this.radarSweepAngle = (this.radarSweepAngle + delta * 2.4) % (Math.PI * 2.0);
    if (this.radarSweepLine) {
      const sAttr = this.radarSweepLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      const sPos = sAttr.array as Float32Array;
      const r = 0.94 * breath;
      sPos[3] = Math.cos(this.radarSweepAngle) * r;
      sPos[4] = Math.sin(this.radarSweepAngle) * r;
      sAttr.needsUpdate = true;
    }

    const bAttr = this.radarBarsLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const cAttr = this.radarBarsLine.geometry.getAttribute("color") as THREE.BufferAttribute;
    const bPos = bAttr.array as Float32Array;
    const bCols = cAttr.array as Float32Array;

    const pAttr = this.radarPeakLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const pPos = pAttr.array as Float32Array;

    const innerR = 0.29 * breath;
    const maxExcursion = 0.58 * breath;

    // Palette colors
    const colBase = this.isDark
      ? new THREE.Color(0.0, 0.9, 0.5) // Emerald in dark
      : new THREE.Color(0.08, 0.08, 0.10); // Charcoal in light
    const colPeak = new THREE.Color(1.0, 0.18, 0.22); // Crimson
    const colCobalt = new THREE.Color(0.02, 0.45, 0.95);

    for (let b = 0; b < barCount; b++) {
      const theta = (b / barCount) * Math.PI * 2.0;

      // Symmetrical FFT mapping (folded across 180 degrees for balanced telemetry)
      const halfB = b < barCount / 2 ? b : barCount - 1 - b;
      const binIdx = Math.min(127, Math.floor((halfB / (barCount / 2)) * 64));
      const rawFFT = this.freqDataBuffer[binIdx] / 255.0;

      // Harmonic standing wave modulation
      const harmonic = Math.abs(Math.sin(theta * n + time * 1.5) * Math.cos(theta * m - time * 0.8));
      const energy = (rawFFT * 0.72 + harmonic * 0.28) * amp;
      const barH = Math.max(0.02, energy * maxExcursion);

      // Sweep proximity boost (phosphor excitation when sweep passes by)
      let angleDiff = Math.abs(theta - this.radarSweepAngle);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2.0 - angleDiff;
      const sweepBoost = Math.max(0.0, 1.0 - angleDiff / 0.35) * 0.12 * amp;

      const rOuter = Math.min(0.93 * breath, innerR + barH + sweepBoost);

      // Update peak-hold with gravity decay
      this.radarPeakHold[b] = Math.max(rOuter, this.radarPeakHold[b] - delta * 0.42);
      const rPeak = this.radarPeakHold[b];

      // Bar vertices
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const idx = b * 6;

      bPos[idx] = cosT * innerR;
      bPos[idx + 1] = sinT * innerR;
      bPos[idx + 2] = 0;

      bPos[idx + 3] = cosT * rOuter;
      bPos[idx + 4] = sinT * rOuter;
      bPos[idx + 5] = 0;

      // Dynamic color: transition from charcoal/cobalt to crimson at high amplitudes
      const normH = Math.min(1.0, barH / (maxExcursion * 0.8));
      const barCol = colBase.clone().lerp(normH > 0.6 ? colPeak : colCobalt, normH);
      bCols[idx] = colBase.r; bCols[idx + 1] = colBase.g; bCols[idx + 2] = colBase.b;
      bCols[idx + 3] = barCol.r; bCols[idx + 4] = barCol.g; bCols[idx + 5] = barCol.b;

      // Peak tick (tangential tick at rPeak)
      const tickSpan = 0.016;
      const tangX = -sinT * tickSpan;
      const tangY = cosT * tickSpan;

      pPos[idx] = cosT * rPeak - tangX;
      pPos[idx + 1] = sinT * rPeak - tangY;
      pPos[idx + 2] = 0.01;

      pPos[idx + 3] = cosT * rPeak + tangX;
      pPos[idx + 4] = sinT * rPeak + tangY;
      pPos[idx + 5] = 0.01;
    }

    bAttr.needsUpdate = true;
    cAttr.needsUpdate = true;
    pAttr.needsUpdate = true;
  }

  // ═══════════════════════════════════════════════════════════
  // 05 // 3D WATERFALL (FFT TOPOGRAPHIC SONOGRAM)
  // ═══════════════════════════════════════════════════════════

  private initWaterfall(): void {
    const geometry = new THREE.PlaneGeometry(2.5, 2.2, 96, 64);

    this.waterfallMaterial = new THREE.ShaderMaterial({
      wireframe: true,
      uniforms: {
        u_time: { value: 0.0 },
        u_n: { value: this.uN },
        u_m: { value: this.uM },
        u_amplitude: { value: this.uAmplitude },
        u_breath_scale: { value: 1.0 },
        u_audio_peak: { value: 0.0 },
        u_is_dark: { value: this.isDark ? 1.0 : 0.0 },
        u_palette: { value: 0 },
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_n;
        uniform float u_m;
        uniform float u_amplitude;
        uniform float u_breath_scale;
        uniform float u_audio_peak;
        uniform int u_palette;
        varying vec2 vUv;
        varying float vHeight;
        varying vec3 vColor;

        vec3 getPaletteColor(float t) {
          t = fract(t);
          if (u_palette == 1) {
            float w = smoothstep(0.4, 0.6, sin(t * 6.28318));
            return mix(vec3(0.92, 0.92, 0.92), vec3(1.0, 0.2, 0.2), w * 0.5);
          } else if (u_palette == 2) {
            vec3 c0 = vec3(0.85, 0.40, 0.0);
            vec3 c1 = vec3(1.0, 0.70, 0.0);
            vec3 c2 = vec3(1.0, 0.92, 0.45);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 3) {
            vec3 c0 = vec3(0.0, 0.55, 0.15);
            vec3 c1 = vec3(0.15, 0.95, 0.35);
            vec3 c2 = vec3(0.75, 1.0, 0.75);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 4) {
            vec3 c0 = vec3(0.0, 0.30, 0.85);
            vec3 c1 = vec3(0.0, 0.80, 1.0);
            vec3 c2 = vec3(0.70, 0.98, 1.0);
            return mix(mix(c0, c1, smoothstep(0.0, 0.5, t)), c2, smoothstep(0.5, 1.0, t));
          } else if (u_palette == 5) {
            // Stark Chromatic Spectrum (high saturation, high contrast)
            vec3 c0 = vec3(1.0, 0.08, 0.20); // Stark Crimson Red
            vec3 c1 = vec3(1.0, 0.05, 0.78); // Hot Electric Magenta
            vec3 c2 = vec3(0.55, 0.05, 1.0);  // Deep Laser Violet
            vec3 c3 = vec3(0.0, 0.90, 1.0);   // Electric Stark Cyan
            vec3 c4 = vec3(0.08, 1.0, 0.32);  // Acid Neon Green
            vec3 c5 = vec3(1.0, 0.76, 0.0);   // Intense Pure Amber Gold
            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          } else {
            // Vibrant Pastel Spectrum (Coral, Rose, Lavender, Sky, Mint, Gold)
            vec3 c0 = vec3(1.0, 0.52, 0.42); // Coral
            vec3 c1 = vec3(0.96, 0.44, 0.76); // Rose
            vec3 c2 = vec3(0.68, 0.52, 0.98); // Lavender
            vec3 c3 = vec3(0.36, 0.70, 0.98); // Sky
            vec3 c4 = vec3(0.24, 0.85, 0.65); // Mint
            vec3 c5 = vec3(1.0, 0.84, 0.45); // Amber Gold
            float seg = t * 5.0;
            if (seg < 1.0) return mix(c0, c1, seg);
            if (seg < 2.0) return mix(c1, c2, seg - 1.0);
            if (seg < 3.0) return mix(c2, c3, seg - 2.0);
            if (seg < 4.0) return mix(c3, c4, seg - 3.0);
            return mix(c4, c5, seg - 4.0);
          }
        }

        void main() {
          vUv = uv;
          // Scrolling terrain from back to foreground
          float timeScroll = u_time * 3.4;
          float cascadeY = (1.0 - uv.y) * 16.0 - timeScroll;
          
          // Multi-harmonic standing sonogram ridges
          float ridge1 = sin(uv.x * u_n * 9.0 + cascadeY) * cos(uv.x * u_m * 6.0);
          float ridge2 = sin(uv.x * 24.0 - timeScroll * 1.5) * cos(cascadeY * 1.8) * 0.45;
          float harmonicSwell = (ridge1 * 0.65 + ridge2 * 0.35);
          
          // Prominent foreground elevation
          float frontEmphasis = pow(1.0 - uv.y, 0.65);
          float h = harmonicSwell * frontEmphasis * (u_amplitude * 0.55 * u_breath_scale);
          
          // Audio transient reactive ripples
          h += sin(uv.x * 36.0 + timeScroll * 4.0) * u_audio_peak * frontEmphasis * 0.28;
          vHeight = h;

          vec3 pos = position;
          pos.z += h;
          vColor = getPaletteColor(h * 2.2 + uv.x * 0.6 + u_time * 0.05);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeight;
        varying vec3 vColor;
        uniform float u_is_dark;

        void main() {
          float ridgeNorm = smoothstep(-0.15, 0.35, vHeight);
          
          vec3 col;
          if (u_is_dark > 0.5) {
            // Dark / Theater mode: glowing wireframe peaks on black
            vec3 valley = vec3(0.12, 0.12, 0.18);
            col = mix(valley, vColor * 1.35, ridgeNorm);
          } else {
            // Light mode: bold charcoal/black base with deep saturated red/blue peaks!
            vec3 valley = vec3(0.08, 0.08, 0.10); // Crisp dark charcoal lines!
            col = mix(valley, vColor * 0.85, ridgeNorm * 0.9);
          }
          gl_FragColor = vec4(col, 0.95);
        }
      `,
    });

    this.waterfallMesh = new THREE.Mesh(geometry, this.waterfallMaterial);
    this.waterfallMesh.rotation.x = -Math.PI * 0.32;
    this.waterfallMesh.position.y = -0.15;
    this.waterfallMesh.position.z = 0.0;
    this.scene?.add(this.waterfallMesh);
  }

  private updateWaterfall(delta: number, time: number): void {
    if (!this.waterfallMesh || !this.waterfallMaterial) return;

    if (this.freqProvider) {
      this.freqProvider(this.freqDataBuffer);
    }

    // Calculate live audio peak from FFT
    let maxBin = 0;
    for (let i = 0; i < 64; i++) {
      if (this.freqDataBuffer[i] > maxBin) maxBin = this.freqDataBuffer[i];
    }
    const audioPeak = (maxBin / 255.0) * this.uAmplitude;

    this.waterfallMaterial.uniforms.u_time.value = time;
    this.waterfallMaterial.uniforms.u_n.value = this.uN;
    this.waterfallMaterial.uniforms.u_m.value = this.uM;
    this.waterfallMaterial.uniforms.u_amplitude.value = this.uAmplitude;
    this.waterfallMaterial.uniforms.u_breath_scale.value = this.currentBreathScale;
    this.waterfallMaterial.uniforms.u_audio_peak.value = audioPeak;
    this.waterfallMaterial.uniforms.u_is_dark.value = this.isDark ? 1.0 : 0.0;
  }

  // ═══════════════════════════════════════════════════════════
  // 06 // TORUS VORTEX (TOKAMAK MAGNETIC FLUX FIELD)
  // ═══════════════════════════════════════════════════════════

  private initTorus(): void {
    this.torusGroup = new THREE.Group();

    // 1. Structural Wireframe Torus Cage (subtle dark brutalist geometry)
    const cageGeo = new THREE.TorusGeometry(0.72, 0.28, 16, 32);
    const cageMat = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x222222,
      transparent: true,
      opacity: 0.22,
    });
    this.torusMesh = new THREE.Mesh(cageGeo, cageMat);
    this.torusGroup.add(this.torusMesh);

    // 2. Central Poloidal Magnetic Spindle / Axis
    const spindleGeo = new THREE.BufferGeometry();
    const spindlePos = new Float32Array([
      0, -0.65, 0,  0, 0.65, 0,
      -0.12, 0, 0,  0.12, 0, 0,
      0, 0, -0.12,  0, 0, 0.12,
    ]);
    spindleGeo.setAttribute("position", new THREE.BufferAttribute(spindlePos, 3));
    const spindleMat = new THREE.LineSegments(spindleGeo, new THREE.LineBasicMaterial({
      color: 0x111111,
      linewidth: 2.0,
      transparent: true,
      opacity: 0.75,
    }));
    this.torusGroup.add(spindleMat);

    // 3. 16 Continuous Closed Helical Magnetic Streamlines
    const streamCount = 16;
    const segsPerStream = 96;
    this.torusStreamlines = [];
    this.torusStreamlinePos = [];

    const streamColors = [
      0xFF3333, 0x111111, 0x0055CC, 0xFF3333,
      0xDD8800, 0x111111, 0x008855, 0x0055CC,
      0xFF3333, 0x111111, 0x0055CC, 0xFF3333,
      0xDD8800, 0x111111, 0x008855, 0x7700CC,
    ];

    for (let s = 0; s < streamCount; s++) {
      const pos = new Float32Array((segsPerStream + 1) * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      const mat = new THREE.LineBasicMaterial({
        color: streamColors[s % streamColors.length],
        linewidth: 2.0,
        transparent: true,
        opacity: 0.92,
      });

      const line = new THREE.LineLoop(geo, mat);
      this.torusGroup.add(line);
      this.torusStreamlines.push(line);
      this.torusStreamlinePos.push(pos);
    }

    this.scene?.add(this.torusGroup);
  }

  private updateTorus(delta: number, time: number): void {
    if (!this.torusGroup) return;

    const breath = this.currentBreathScale;
    const amp = this.uAmplitude;
    const R = 0.72 * breath;
    const r = 0.28 * breath * (1.0 + amp * 0.25);
    const n = Math.max(1, Math.min(8, Math.round(this.uN)));

    const streamCount = this.torusStreamlines.length;
    const segsPerStream = 96;

    for (let s = 0; s < streamCount; s++) {
      const pos = this.torusStreamlinePos[s];
      const line = this.torusStreamlines[s];
      const phaseOffset = (s / streamCount) * Math.PI * 2.0;

      for (let i = 0; i <= segsPerStream; i++) {
        const u = (i / segsPerStream) * Math.PI * 2.0;
        // Helical winding around torus: v wraps n times while u wraps 1 time
        const v = u * n + phaseOffset + time * (1.2 + s * 0.05);
        const theta = u + time * 0.4;

        const idx = i * 3;
        pos[idx] = (R + r * Math.cos(v)) * Math.cos(theta);
        pos[idx + 1] = (R + r * Math.cos(v)) * Math.sin(theta);
        pos[idx + 2] = r * Math.sin(v);
      }

      const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }

    // Dynamic rotation of the entire magnetic assembly
    this.torusGroup.rotation.x = Math.PI * 0.28 + Math.sin(time * 0.4) * 0.15;
    this.torusGroup.rotation.y = time * 0.35;
    if (this.torusMesh) {
      this.torusMesh.rotation.z = time * 0.2;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 07 // 3D VOXEL EQUALIZER MATRIX (INSTANCED PILLAR CITY)
  // ═══════════════════════════════════════════════════════════

  private initVoxelGrid(): void {
    this.voxelGroup = new THREE.Group();

    // 16x16 grid = 256 instanced columns with optical translucency for rich 3D overlaps
    const boxGeo = new THREE.BoxGeometry(0.082, 1.0, 0.082);
    boxGeo.translate(0, 0.5, 0); // Origin at bottom base so scaling scales up from ground
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.voxelMesh = new THREE.InstancedMesh(boxGeo, boxMat, 256);

    const capGeo = new THREE.BoxGeometry(0.076, 0.015, 0.076);
    capGeo.translate(0, 0.0075, 0);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.voxelCapMesh = new THREE.InstancedMesh(capGeo, capMat, 256);

    const dummy = new THREE.Object3D();
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const idx = row * 16 + col;
        const x = (col - 7.5) * 0.105;
        const z = (row - 7.5) * 0.105;
        dummy.position.set(x, 0, z);
        dummy.scale.set(1, 0.02, 1);
        dummy.updateMatrix();
        this.voxelMesh.setMatrixAt(idx, dummy.matrix);
        this.voxelCapMesh.setMatrixAt(idx, dummy.matrix);
        this.voxelMesh.setColorAt(idx, new THREE.Color(0x333333));
        this.voxelCapMesh.setColorAt(idx, new THREE.Color(0x00f0ff));
        this.voxelPeaks[idx] = 0.02;
      }
    }
    this.voxelMesh.instanceMatrix.needsUpdate = true;
    if (this.voxelMesh.instanceColor) this.voxelMesh.instanceColor.needsUpdate = true;
    this.voxelCapMesh.instanceMatrix.needsUpdate = true;
    if (this.voxelCapMesh.instanceColor) this.voxelCapMesh.instanceColor.needsUpdate = true;

    this.voxelGroup.add(this.voxelMesh);
    this.voxelGroup.add(this.voxelCapMesh);

    // Floor grid baseline perimeter (Brutalist dark base)
    const floorGridGeo = new THREE.BufferGeometry();
    const gridLines: number[] = [];
    for (let i = -8; i <= 8; i += 2) {
      const p = i * 0.105;
      gridLines.push(-0.9, 0, p, 0.9, 0, p);
      gridLines.push(p, 0, -0.9, p, 0, 0.9);
    }
    floorGridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridLines, 3));
    const floorGridMat = new THREE.LineBasicMaterial({
      color: 0x1a1a1a,
      linewidth: 1.0,
      transparent: true,
      opacity: 0.6,
    });
    this.voxelGroup.add(new THREE.LineSegments(floorGridGeo, floorGridMat));

    this.scene?.add(this.voxelGroup);
  }

  private updateVoxelGrid(delta: number, time: number): void {
    if (!this.voxelGroup || !this.voxelMesh || !this.voxelCapMesh) return;

    if (this.freqProvider) {
      this.freqProvider(this.freqDataBuffer);
    }

    const dummy = new THREE.Object3D();
    const breath = this.currentBreathScale;
    const amp = this.uAmplitude;

    const voxelScaleMap: Record<ThicknessLevel, number> = {
      fine: 0.72,
      normal: 1.0,
      bold: 1.25,
      chunky: 1.45,
    };
    const colScale = voxelScaleMap[this.currentThickness] || 1.0;

    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const idx = row * 16 + col;
        const x = (col - 7.5) * 0.105;
        const z = (row - 7.5) * 0.105;
        const distCenter = Math.sqrt(x * x + z * z) / 1.1;

        // Map column to frequency spectrum based on radial distance & angle
        const bin = Math.min(127, Math.floor(distCenter * 90 + ((row + col) % 5) * 6));
        const rawAmp = (this.freqDataBuffer[bin] || 0) / 255.0;
        const targetHeight = Math.max(0.02, rawAmp * 1.6 * amp * breath);

        // Instantaneous attack with ballistic gravity peak decay
        this.voxelPeaks[idx] = Math.max(targetHeight, this.voxelPeaks[idx] - delta * 0.9);

        // Voxel column matrix
        dummy.position.set(x, 0, z);
        dummy.scale.set(colScale, targetHeight, colScale);
        dummy.updateMatrix();
        this.voxelMesh.setMatrixAt(idx, dummy.matrix);

        // Top peak cap matrix
        dummy.position.set(x, this.voxelPeaks[idx], z);
        dummy.scale.set(colScale, 1, colScale);
        dummy.updateMatrix();
        this.voxelCapMesh.setMatrixAt(idx, dummy.matrix);

        // Dynamic palette-aware color gradient from center outwards
        const colorRatio = (distCenter * 0.75 + time * 0.03 + (rawAmp * 0.25)) % 1.0;
        const baseColor = this.samplePalette(colorRatio);
        if (targetHeight > 0.8) {
          baseColor.lerp(new THREE.Color(1.0, 0.4, 0.2), 0.35); // Accent kick
        }
        this.voxelMesh.setColorAt(idx, baseColor);

        // Dynamic multi-hued cap color matching active palette & audio resonance
        const capPhase = (colorRatio + 0.28 + targetHeight * 0.3) % 1.0;
        const capColor = this.samplePalette(capPhase);
        capColor.multiplyScalar(1.35); // Enhanced luminosity & vibrance for floating cap lights
        if (targetHeight > 0.6) {
          capColor.lerp(new THREE.Color(1.0, 0.95, 0.5), 0.4); // Golden apex peak flash
        }
        this.voxelCapMesh.setColorAt(idx, capColor);
      }
    }

    this.voxelMesh.instanceMatrix.needsUpdate = true;
    if (this.voxelMesh.instanceColor) this.voxelMesh.instanceColor.needsUpdate = true;
    this.voxelCapMesh.instanceMatrix.needsUpdate = true;
    if (this.voxelCapMesh.instanceColor) this.voxelCapMesh.instanceColor.needsUpdate = true;

    this.voxelGroup.rotation.y = time * 0.18;
    this.voxelGroup.rotation.x = Math.PI * 0.26 + Math.sin(time * 0.25) * 0.06;
  }

  // ═══════════════════════════════════════════════════════════
  // 08 // WARP TUNNEL (3D ACOUSTIC PERSPECTIVE CORRIDOR)
  // ═══════════════════════════════════════════════════════════

  private updateTunnelColors(): void {
    let hexList: number[];

    switch (this.currentPalette) {
      case "pastel":
        hexList = [
          0xF561B8, // 0: Pastel Rose Coral
          0xFB7185, // 1: Soft Salmon Rose
          0xF87171, // 2: Soft Coral
          0xFB923C, // 3: Pastel Peach
          0xFBBF24, // 4: Warm Honey Amber
          0xFDE047, // 5: Pastel Butter
          0xBEF264, // 6: Soft Lime
          0x72E1B8, // 7: Pastel Mint
          0x2DD4BF, // 8: Pastel Turquoise
          0x62C0F7, // 9: Pastel Sky Blue
          0x60A5FA, // 10: Cornflower Blue
          0x818CF8, // 11: Soft Iris
          0xA78BFA, // 12: Pastel Periwinkle
          0xC084FC, // 13: Pastel Lavender
          0xE879F9, // 14: Soft Orchid
          0xF472B6, // 15: Pastel Pink
        ];
        break;
      case "amber_crt":
        hexList = [
          0xFF3300, // 0: Deep Amber-Red
          0xFF4D00, // 1: Fiery Amber
          0xFF6600, // 2: Tangerine Phosphor
          0xFF8000, // 3: Warm Orange
          0xFF9900, // 4: Pure Sodium D
          0xFFB000, // 5: 589nm Bright Amber
          0xFFC400, // 6: Golden Amber
          0xFFD700, // 7: Bright Gold
          0xFFE57F, // 8: Pale Amber Beam
          0xFFD54F, // 9: Incandescent Yellow
          0xFFC107, // 10: Warm Ochre
          0xFFA000, // 11: Deep Golden Ochre
          0xFF8F00, // 12: Rich Amber
          0xFF6F00, // 13: Dark Amber
          0xE65100, // 14: Burnt Amber
          0xBF360C, // 15: Deep Cathode Crimson
        ];
        break;
      case "green_crt":
        hexList = [
          0x00FF66, // 0: Laser Green
          0x1DE9B6, // 1: Cyan-Green
          0x00E5FF, // 2: Phosphor Cyan
          0x00E676, // 3: Acid Green
          0x33FF33, // 4: Oscilloscope Green
          0x66FFAA, // 5: Mint Phosphor
          0x76FF03, // 6: Intense Lime
          0xAEEA00, // 7: Chartreuse
          0xB2FF59, // 8: Radioactive Lime
          0x64DD17, // 9: Emerald Phosphor
          0x00C853, // 10: Pure Emerald
          0x00E676, // 11: Electric Green
          0x69F0AE, // 12: Pale Trace
          0xB9F6CA, // 13: Phosphor Flash
          0x00BFA5, // 14: Deep Aqua
          0x00897B, // 15: Cathode Jade
        ];
        break;
      case "cyber_blue":
        hexList = [
          0x00F0FF, // 0: Laser Cyan
          0x00D4FF, // 1: Electric Sky
          0x00B4D8, // 2: Cerulean
          0x0096C7, // 3: Vivid Blue
          0x0077B6, // 4: Cobalt Blue
          0x023E8A, // 5: Deep Marine
          0x3D5AFE, // 6: Indigo Pulse
          0x651FFF, // 7: Deep Violet
          0x7C4DFF, // 8: Electric Purple
          0x9D4EDD, // 9: Neon Violet
          0xB5179E, // 10: Cyber Orchid
          0xF72585, // 11: Cyber Magenta
          0x7209B7, // 12: Deep Neon Purple
          0x4895EF, // 13: High-Voltage Azure
          0x4CC9F0, // 14: Aqua Ice
          0x00F5D4, // 15: Neon Mint Cyan
        ];
        break;
      case "monochrome":
        hexList = [
          0xFF1E28, // 0: Stark Industrial Crimson
          0xFFFFFF, // 1: Pure White
          0xD1D5DB, // 2: Cool Platinum
          0x9CA3AF, // 3: Concrete Silver
          0x6B7280, // 4: Gunmetal Gray
          0xFF3333, // 5: Accent Red
          0xFFFFFF, // 6: Brilliant White
          0xE5E7EB, // 7: Titanium Silver
          0xFF1E28, // 8: Stark Industrial Crimson
          0xFFFFFF, // 9: Pure White
          0xD1D5DB, // 10: Platinum Silver
          0x9CA3AF, // 11: Slate Gray
          0x6B7280, // 12: Gunmetal Gray
          0xFF4D4D, // 13: Hot Crimson Accent
          0xFFFFFF, // 14: Brilliant White
          0xF3F4F6, // 15: Pale Silver Ice
        ];
        break;
      case "stark":
      default:
        hexList = [
          0xFF1433, // 0: Stark Crimson
          0xFF4500, // 1: Neon Orange-Red
          0xFF8C00, // 2: Electric Amber
          0xFFD600, // 3: Solar Gold
          0xAEEA00, // 4: Neon Lime
          0x00E676, // 5: Acid Green
          0x00BFA5, // 6: Aqua Mint
          0x00E5FF, // 7: Electric Cyan
          0x0091EA, // 8: Sky Blue
          0x2979FF, // 9: Royal Blue
          0x651FFF, // 10: Deep Indigo
          0x7C4DFF, // 11: Electric Purple
          0xD500F9, // 12: Neon Violet
          0xFF0D86, // 13: Hot Shocking Magenta
          0xFF1744, // 14: Electric Ruby
          0xFF5252, // 15: Coral Red
        ];
        break;
    }

    this.tunnelRibColors = hexList.map((hex) => new THREE.Color(hex));
  }

  private initTunnel(): void {
    this.tunnelGroup = new THREE.Group();

    const ringCount = 24;
    const segsPerRing = 16;
    this.tunnelRings = [];
    this.tunnelRingPos = [];
    this.tunnelRingColors = [];
    this.tunnelRingZ = new Float32Array(ringCount);

    this.updateTunnelColors();

    // 24 Sequential Polygonal Rings along Z axis (Horizontal bridging lines)
    for (let k = 0; k < ringCount; k++) {
      const zInit = -14.0 + (k / ringCount) * 16.5;
      this.tunnelRingZ[k] = zInit;

      const pos = new Float32Array(segsPerRing * 3);
      const col = new Float32Array(segsPerRing * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

      // Initialize vertex colors matching the radiating lines
      for (let i = 0; i < segsPerRing; i++) {
        const c = this.tunnelRibColors[i];
        col[i * 3 + 0] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }

      const mat = new THREE.LineBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        linewidth: 2.0,
        transparent: true,
        opacity: 0.95,
      });

      const line = new THREE.LineLoop(geo, mat);
      this.tunnelGroup.add(line);
      this.tunnelRings.push(line);
      this.tunnelRingPos.push(pos);
      this.tunnelRingColors.push(col);
    }

    // 16 Longitudinal Rib Lines (Radiating perspective lines)
    const ribSegCount = segsPerRing * (ringCount - 1);
    this.tunnelRibsPos = new Float32Array(ribSegCount * 2 * 3);
    this.tunnelRibsCol = new Float32Array(ribSegCount * 2 * 3);
    const ribGeo = new THREE.BufferGeometry();
    ribGeo.setAttribute("position", new THREE.BufferAttribute(this.tunnelRibsPos, 3));
    ribGeo.setAttribute("color", new THREE.BufferAttribute(this.tunnelRibsCol, 3));

    const ribMat = new THREE.LineSegments(ribGeo, new THREE.LineBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      linewidth: 2.0,
      transparent: true,
      opacity: 0.92,
    }));
    this.tunnelRibsLine = ribMat;
    this.tunnelGroup.add(this.tunnelRibsLine);

    this.scene?.add(this.tunnelGroup);
  }

  private updateTunnel(delta: number, time: number): void {
    if (!this.tunnelGroup || !this.tunnelRibsLine || !this.tunnelRibsPos || !this.tunnelRibsCol) return;

    if (this.freqProvider) {
      this.freqProvider(this.freqDataBuffer);
    }

    const ringCount = 24;
    const segsPerRing = 16;
    const breath = this.currentBreathScale;
    const amp = this.uAmplitude;
    const n = Math.max(1, Math.min(8, Math.round(this.uN)));
    const m = Math.max(1, Math.min(8, Math.round(this.uM)));

    // Forward speed along Z axis
    const speed = (5.5 + amp * 4.0) * (this.breathPhase === "exhale" ? 1.4 : 1.0);

    // Track vertex positions for connecting ribs
    const ringCoords: [number, number, number][][] = [];

    for (let k = 0; k < ringCount; k++) {
      // Advance ring along Z toward camera
      this.tunnelRingZ[k] += speed * delta;
      if (this.tunnelRingZ[k] > 2.5) {
        this.tunnelRingZ[k] -= 16.5; // Infinite wrap-around
      }

      const z = this.tunnelRingZ[k];
      const pos = this.tunnelRingPos[k];
      const col = this.tunnelRingColors[k];
      const line = this.tunnelRings[k];

      // Natural perspective expansion: corridor widens as it approaches camera
      const baseR = (0.35 + (z + 14.0) * 0.075) * breath;

      // Depth attenuation: rings far away fade gracefully
      const depthFactor = Math.max(0.15, Math.min(1.0, (z + 14.0) / 16.5));
      (line.material as THREE.LineBasicMaterial).opacity = depthFactor * 0.95;

      const ringV: [number, number, number][] = [];

      for (let i = 0; i < segsPerRing; i++) {
        const theta = (i / segsPerRing) * Math.PI * 2.0;

        // Acoustic undulation: standing wave ripple + live FFT excitation
        const bin = Math.min(127, (i * 8 + k * 4) % 128);
        const fftAudio = (this.freqDataBuffer[bin] / 255.0) * 0.35 * amp;
        const wave = Math.sin(theta * n + z * 1.5 - time * 4.0) * Math.cos(theta * m + time * 2.0) * (0.15 * amp);
        const r = Math.max(0.08, baseR * (1.0 + wave) + fftAudio);

        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;

        const idx = i * 3;
        pos[idx] = x;
        pos[idx + 1] = y;
        pos[idx + 2] = z;

        // Synchronize vertex color to radiating line color with depth attenuation
        const c = this.tunnelRibColors[i];
        if (c) {
          col[idx]     = c.r * depthFactor;
          col[idx + 1] = c.g * depthFactor;
          col[idx + 2] = c.b * depthFactor;
        }

        ringV.push([x, y, z]);
      }

      ringCoords.push(ringV);
      const posAttr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      const colAttr = line.geometry.getAttribute("color") as THREE.BufferAttribute;
      colAttr.needsUpdate = true;
    }

    // Update Longitudinal Radiating Ribs
    let ribIdx = 0;
    // Sort rings by Z so ribs connect in topological order
    const sortedIndices = Array.from({ length: ringCount }, (_, i) => i)
      .sort((a, b) => this.tunnelRingZ[a] - this.tunnelRingZ[b]);

    for (let s = 0; s < ringCount - 1; s++) {
      const k1 = sortedIndices[s];
      const k2 = sortedIndices[s + 1];
      const z1 = this.tunnelRingZ[k1];
      const z2 = this.tunnelRingZ[k2];

      // Avoid connecting rings across the wrap boundary
      if (Math.abs(z2 - z1) > 2.5) continue;

      const v1 = ringCoords[k1];
      const v2 = ringCoords[k2];
      const depth1 = Math.max(0.15, Math.min(1.0, (z1 + 14.0) / 16.5));
      const depth2 = Math.max(0.15, Math.min(1.0, (z2 + 14.0) / 16.5));

      for (let i = 0; i < segsPerRing; i++) {
        const p1 = v1[i];
        const p2 = v2[i];
        const c = this.tunnelRibColors[i];

        this.tunnelRibsPos[ribIdx]     = p1[0];
        this.tunnelRibsPos[ribIdx + 1] = p1[1];
        this.tunnelRibsPos[ribIdx + 2] = p1[2];

        this.tunnelRibsPos[ribIdx + 3] = p2[0];
        this.tunnelRibsPos[ribIdx + 4] = p2[1];
        this.tunnelRibsPos[ribIdx + 5] = p2[2];

        if (c) {
          this.tunnelRibsCol[ribIdx]     = c.r * depth1;
          this.tunnelRibsCol[ribIdx + 1] = c.g * depth1;
          this.tunnelRibsCol[ribIdx + 2] = c.b * depth1;

          this.tunnelRibsCol[ribIdx + 3] = c.r * depth2;
          this.tunnelRibsCol[ribIdx + 4] = c.g * depth2;
          this.tunnelRibsCol[ribIdx + 5] = c.b * depth2;
        }

        ribIdx += 6;
      }
    }

    this.tunnelRibsLine.geometry.setDrawRange(0, ribIdx / 3);
    const ribPosAttr = this.tunnelRibsLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    ribPosAttr.needsUpdate = true;
    const ribColAttr = this.tunnelRibsLine.geometry.getAttribute("color") as THREE.BufferAttribute;
    ribColAttr.needsUpdate = true;

    // Subtle hypnotic corridor roll
    this.tunnelGroup.rotation.z = time * 0.12;
  }

  // ═══════════════════════════════════════════════════════════
  // 10 // DIGITAL OSCILLOSCOPE (LABORATORY DSO WITH EDGE TRIGGER)
  // ═══════════════════════════════════════════════════════════

  private initDigitalScope(): void {
    this.digitalScopeGroup = new THREE.Group();

    // 1. Oscilloscope CRT/LCD Chassis Screen (Aspect 16:10, dark lab phosphor chassis)
    const screenGeo = new THREE.PlaneGeometry(1.88, 1.24);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x05080A,
      depthWrite: false,
    });
    this.dsoScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.dsoScreenMesh.position.z = -0.05;
    this.digitalScopeGroup.add(this.dsoScreenMesh);

    // 2. Bezel Frame Line
    const bezelGeo = new THREE.BufferGeometry();
    const bx = 0.94;
    const by = 0.62;
    const bezelPos = new Float32Array([
      -bx, -by, -0.04,   bx, -by, -0.04,
       bx, -by, -0.04,   bx,  by, -0.04,
       bx,  by, -0.04,  -bx,  by, -0.04,
      -bx,  by, -0.04,  -bx, -by, -0.04,
    ]);
    bezelGeo.setAttribute("position", new THREE.BufferAttribute(bezelPos, 3));
    const bezelMat = new THREE.LineBasicMaterial({ color: 0x1E3330 });
    this.digitalScopeGroup.add(new THREE.LineSegments(bezelGeo, bezelMat));

    // 3. Precision Graticule Grid (10 horizontal divisions, 8 vertical divisions)
    const graticulePos: number[] = [];
    // 10 Divs X from -0.85 to +0.85 (step 0.17)
    for (let c = 0; c <= 10; c++) {
      const gx = -0.85 + c * 0.17;
      graticulePos.push(gx, -0.55, -0.03, gx, 0.55, -0.03);
    }
    // 8 Divs Y from -0.55 to +0.55 (step 0.1375)
    for (let r = 0; r <= 8; r++) {
      const gy = -0.55 + r * 0.1375;
      graticulePos.push(-0.85, gy, -0.03, 0.85, gy, -0.03);
    }
    // Center crosshairs tick marks (subdivisions)
    for (let s = -25; s <= 25; s++) {
      const sx = (s / 25) * 0.85;
      graticulePos.push(sx, -0.012, -0.03, sx, 0.012, -0.03);
    }
    for (let s = -20; s <= 20; s++) {
      const sy = (s / 20) * 0.55;
      graticulePos.push(-0.015, sy, -0.03, 0.015, sy, -0.03);
    }

    const graticuleGeo = new THREE.BufferGeometry();
    graticuleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(graticulePos), 3));
    const graticuleMat = new THREE.LineBasicMaterial({
      color: 0x0E2420,
      transparent: true,
      opacity: 0.75,
    });
    this.digitalScopeGroup.add(new THREE.LineSegments(graticuleGeo, graticuleMat));

    // 4. CH1 Primary Signal Waveform (Vector Trace)
    const ptCount = 256;
    const ch1Geo = new THREE.BufferGeometry();
    const ch1Pos = new Float32Array(ptCount * 3);
    ch1Geo.setAttribute("position", new THREE.BufferAttribute(ch1Pos, 3));
    const ch1Mat = new THREE.LineBasicMaterial({
      color: 0x00FFCC, // Electric Cyan-Green
      transparent: true,
      opacity: 0.95,
      blending: THREE.NormalBlending,
    });
    this.dsoCh1Line = new THREE.Line(ch1Geo, ch1Mat);
    this.digitalScopeGroup.add(this.dsoCh1Line);

    // 5. CH1 Digital Phosphor Persistence (Ghost Trail)
    this.dsoGhostPos = new Float32Array(ptCount * 3);
    const ghostGeo = new THREE.BufferGeometry();
    ghostGeo.setAttribute("position", new THREE.BufferAttribute(this.dsoGhostPos, 3));
    const ghostMat = new THREE.LineBasicMaterial({
      color: 0x006655,
      transparent: true,
      opacity: 0.45,
      blending: THREE.NormalBlending,
    });
    this.dsoCh1GhostLine = new THREE.Line(ghostGeo, ghostMat);
    this.digitalScopeGroup.add(this.dsoCh1GhostLine);

    // 6. CH2 Math / Harmonic Inverted Waveform (Amber / Secondary)
    const ch2Geo = new THREE.BufferGeometry();
    const ch2Pos = new Float32Array(ptCount * 3);
    ch2Geo.setAttribute("position", new THREE.BufferAttribute(ch2Pos, 3));
    const ch2Mat = new THREE.LineBasicMaterial({
      color: 0xFF9933,
      transparent: true,
      opacity: 0.65,
    });
    this.dsoCh2Line = new THREE.Line(ch2Geo, ch2Mat);
    this.digitalScopeGroup.add(this.dsoCh2Line);

    // 7. Trigger Marker [T] at left margin
    const trigGeo = new THREE.BufferGeometry();
    const trigPos = new Float32Array([
      -0.88, 0.02, -0.02,  -0.85, 0.0, -0.02,
      -0.85, 0.0, -0.02,   -0.88, -0.02, -0.02,
      -0.88, -0.02, -0.02, -0.88, 0.02, -0.02,
    ]);
    trigGeo.setAttribute("position", new THREE.BufferAttribute(trigPos, 3));
    const trigMat = new THREE.LineBasicMaterial({ color: 0x00FFCC });
    this.dsoTriggerMarker = new THREE.Line(trigGeo, trigMat);
    this.digitalScopeGroup.add(this.dsoTriggerMarker);

    this.scene?.add(this.digitalScopeGroup);
  }

  private updateDigitalScope(delta: number, time: number): void {
    if (!this.dsoCh1Line || !this.dsoCh1GhostLine || !this.dsoCh2Line || !this.dsoGhostPos) return;

    this.waveProvider?.(this.waveDataBuffer);

    const ptCount = 256;
    const ch1Attr = this.dsoCh1Line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ch1Pos = ch1Attr.array as Float32Array;

    const ghostAttr = this.dsoCh1GhostLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ghostPos = ghostAttr.array as Float32Array;

    const ch2Attr = this.dsoCh2Line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ch2Pos = ch2Attr.array as Float32Array;

    const gain = this.visualGain;
    const breath = this.currentBreathScale;

    // Detect if live audio has actual waveform energy
    let hasAudio = false;
    for (let i = 0; i < 32; i++) {
      if (Math.abs(this.waveDataBuffer[i] - 128) > 2) {
        hasAudio = true;
        break;
      }
    }

    // Hardware Auto-Trigger (Positive-slope zero crossing search)
    // Stabilizes the waveform so it stands rock-solid like a real laboratory DSO!
    let triggerIdx = 0;
    if (hasAudio) {
      for (let i = 0; i < 120; i++) {
        if (this.waveDataBuffer[i] <= 128 && this.waveDataBuffer[i + 1] > 128) {
          triggerIdx = i;
          break;
        }
      }
    }

    const n = Math.max(1, Math.round(this.uN));
    const m = Math.max(1, Math.round(this.uM));

    const col1 = this.samplePalette(0.1);
    const col2 = this.samplePalette(0.6);
    (this.dsoCh1Line.material as THREE.LineBasicMaterial).color.copy(col1);
    (this.dsoCh2Line.material as THREE.LineBasicMaterial).color.copy(col2);

    for (let i = 0; i < ptCount; i++) {
      // Map horizontal x from -0.85 to +0.85 across graticule
      const normX = i / (ptCount - 1);
      const x = -0.85 + normX * 1.70;

      let pcm = 0;
      if (hasAudio) {
        const sampleIdx = (triggerIdx + i) % this.waveDataBuffer.length;
        pcm = (this.waveDataBuffer[sampleIdx] - 128) / 128.0;
      } else {
        // Synthesize reference calibration sine wave when idle
        pcm = Math.sin(normX * Math.PI * 4.0 * n - time * 6.0) * 0.45;
      }

      // Vertical deflection in volts/div
      const y1 = pcm * 0.44 * gain * breath;

      // CH2: Harmonic math trace (inverted or frequency multiplied)
      const harmonicTheta = normX * Math.PI * 2.0 * m;
      const y2 = (pcm * 0.5 + Math.sin(harmonicTheta - time * 4.0) * 0.25) * 0.38 * gain;

      const idx = i * 3;
      ch1Pos[idx] = x;
      ch1Pos[idx + 1] = y1;
      ch1Pos[idx + 2] = 0.0;

      // Exponential decay phosphor persistence
      this.dsoGhostPos[idx] = x;
      this.dsoGhostPos[idx + 1] = this.dsoGhostPos[idx + 1] * 0.85 + y1 * 0.15;
      this.dsoGhostPos[idx + 2] = -0.01;

      ch2Pos[idx] = x;
      ch2Pos[idx + 1] = y2;
      ch2Pos[idx + 2] = 0.0;
    }

    ch1Attr.needsUpdate = true;
    ghostAttr.needsUpdate = true;
    ch2Attr.needsUpdate = true;
  }

  // ═══════════════════════════════════════════════════════════
  // 11 // NEON WIRE TUNNEL (CYBERSPACE CONDUIT CORRIDOR)
  // ═══════════════════════════════════════════════════════════

  private initWireTunnel(): void {
    this.wireTunnelGroup = new THREE.Group();
    const ringCount = this.wireRingCount;
    const sides = this.wireSides;

    this.wireRings = [];
    this.wireRingZ = [];
    this.wireRingRadius = [];

    const ringMat = new THREE.LineBasicMaterial({
      color: 0x00F0FF, // Neon Cyan
      transparent: true,
      opacity: 0.85,
    });

    for (let r = 0; r < ringCount; r++) {
      const z = 1.0 - (r / (ringCount - 1)) * 16.0; // from +1.0 to -15.0
      this.wireRingZ.push(z);
      this.wireRingRadius.push(0.35 + (r / ringCount) * 0.85);

      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array((sides + 1) * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      const ringLoop = new THREE.LineLoop(geo, ringMat.clone());
      this.wireRings.push(ringLoop);
      this.wireTunnelGroup.add(ringLoop);
    }

    // Longitudinal Neon Conduits (connecting vertex k across adjacent rings)
    const conduitFloats = (ringCount - 1) * sides * 2 * 3;
    this.wireConduitsPos = new Float32Array(conduitFloats);
    const conduitGeo = new THREE.BufferGeometry();
    conduitGeo.setAttribute("position", new THREE.BufferAttribute(this.wireConduitsPos, 3));
    const conduitMat = new THREE.LineBasicMaterial({
      color: 0xFF0077, // Neon Magenta / Electric Wire
      transparent: true,
      opacity: 0.90,
    });
    this.wireConduitsLine = new THREE.LineSegments(conduitGeo, conduitMat);
    this.wireTunnelGroup.add(this.wireConduitsLine);

    // Cross-Diagonal Cyber Lattice Braces (connecting vertex k to vertex k+1 on adjacent ring)
    const latticeFloats = (ringCount - 1) * sides * 2 * 3;
    this.wireLatticePos = new Float32Array(latticeFloats);
    const latticeGeo = new THREE.BufferGeometry();
    latticeGeo.setAttribute("position", new THREE.BufferAttribute(this.wireLatticePos, 3));
    const latticeMat = new THREE.LineBasicMaterial({
      color: 0x9900FF, // Electric Violet
      transparent: true,
      opacity: 0.40,
    });
    this.wireLatticeLine = new THREE.LineSegments(latticeGeo, latticeMat);
    this.wireTunnelGroup.add(this.wireLatticeLine);

    this.scene?.add(this.wireTunnelGroup);
  }

  private updateWireTunnel(delta: number, time: number): void {
    if (!this.wireTunnelGroup || !this.wireConduitsLine || !this.wireLatticeLine) return;

    if (this.freqProvider) {
      this.freqProvider(this.freqDataBuffer);
    }

    let bass = 0;
    for (let i = 0; i < 8; i++) bass += this.freqDataBuffer[i];
    bass = (bass / 8) / 255.0;

    const ringCount = this.wireRingCount;
    const sides = this.wireSides;
    const speed = 2.4 + bass * 4.5 * this.visualGain;
    const breath = this.currentBreathScale;

    // Advance rings forward along Z
    for (let r = 0; r < ringCount; r++) {
      this.wireRingZ[r] += speed * delta;
      if (this.wireRingZ[r] > 1.2) {
        this.wireRingZ[r] -= 16.0; // Wrap back to horizon
      }
    }

    // Ring vertex coordinates store for wire conduits
    const ringCoords: [number, number, number][][] = [];

    // Update Rings
    for (let r = 0; r < ringCount; r++) {
      const z = this.wireRingZ[r];
      const zNorm = THREE.MathUtils.clamp((z + 15.0) / 16.0, 0, 1);
      const baseR = (0.28 + (1.0 - zNorm) * 1.05) * breath;
      // Audio radial ripple
      const ripple = Math.sin(z * 2.0 - time * 6.0) * bass * 0.35 * this.visualGain;
      const radius = Math.max(0.1, baseR + ripple);

      const ringLine = this.wireRings[r];
      const posAttr = ringLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      const pos = posAttr.array as Float32Array;

      const ringV: [number, number, number][] = [];
      const palColor = this.samplePalette((zNorm + time * 0.05) % 1.0);
      (ringLine.material as THREE.LineBasicMaterial).color.copy(palColor);

      for (let s = 0; s < sides; s++) {
        const theta = (s / sides) * Math.PI * 2.0;
        // Spectrum frequency bin deflection on individual wires
        const freqBin = Math.floor((s / sides) * 64);
        const freqAmp = (this.freqDataBuffer[freqBin] / 255.0) * 0.22 * this.visualGain;
        const rEff = radius + freqAmp;

        const x = Math.cos(theta) * rEff;
        const y = Math.sin(theta) * rEff;

        pos[s * 3] = x;
        pos[s * 3 + 1] = y;
        pos[s * 3 + 2] = z;

        ringV.push([x, y, z]);
      }
      // Close loop
      pos[sides * 3] = pos[0];
      pos[sides * 3 + 1] = pos[1];
      pos[sides * 3 + 2] = pos[2];

      posAttr.needsUpdate = true;
      ringCoords.push(ringV);
    }

    // Connect Longitudinal Conduits and Lattice Braces in Z-sorted order
    const sortedRings = Array.from({ length: ringCount }, (_, i) => i)
      .sort((a, b) => this.wireRingZ[a] - this.wireRingZ[b]);

    let cIdx = 0;
    let lIdx = 0;

    for (let i = 0; i < ringCount - 1; i++) {
      const r1 = sortedRings[i];
      const r2 = sortedRings[i + 1];
      const z1 = this.wireRingZ[r1];
      const z2 = this.wireRingZ[r2];

      // Avoid connecting rings across boundary wrap jump
      if (Math.abs(z2 - z1) > 2.5) continue;

      const v1 = ringCoords[r1];
      const v2 = ringCoords[r2];

      for (let s = 0; s < sides; s++) {
        const p1 = v1[s];
        const p2 = v2[s];
        const p2Next = v2[(s + 1) % sides];

        // Conduit line (parallel wire)
        this.wireConduitsPos[cIdx] = p1[0];
        this.wireConduitsPos[cIdx + 1] = p1[1];
        this.wireConduitsPos[cIdx + 2] = p1[2];
        this.wireConduitsPos[cIdx + 3] = p2[0];
        this.wireConduitsPos[cIdx + 4] = p2[1];
        this.wireConduitsPos[cIdx + 5] = p2[2];
        cIdx += 6;

        // Diagonal cyber lattice brace
        this.wireLatticePos[lIdx] = p1[0];
        this.wireLatticePos[lIdx + 1] = p1[1];
        this.wireLatticePos[lIdx + 2] = p1[2];
        this.wireLatticePos[lIdx + 3] = p2Next[0];
        this.wireLatticePos[lIdx + 4] = p2Next[1];
        this.wireLatticePos[lIdx + 5] = p2Next[2];
        lIdx += 6;
      }
    }

    (this.wireConduitsLine.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.wireLatticeLine.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    // Palette updates on conduits
    const conduitCol = this.samplePalette(0.3);
    (this.wireConduitsLine.material as THREE.LineBasicMaterial).color.copy(conduitCol);

    // Subtle hypnotic corridor roll
    this.wireTunnelGroup.rotation.z = time * 0.15;
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
        this.uAmplitude = Math.max(0.2, Math.min(1.5, liveAmp * 2.5 * this.visualGain));
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
    } else if (this.mode === "radar") {
      this.updateRadar(delta, elapsedTime);
    } else if (this.mode === "waterfall") {
      this.updateWaterfall(delta, elapsedTime);
    } else if (this.mode === "torus") {
      this.updateTorus(delta, elapsedTime);
    } else if (this.mode === "voxel_grid") {
      this.updateVoxelGrid(delta, elapsedTime);
    } else if (this.mode === "tunnel") {
      this.updateTunnel(delta, elapsedTime);
    } else if (this.mode === "digital_scope") {
      this.updateDigitalScope(delta, elapsedTime);
    } else if (this.mode === "wire_tunnel") {
      this.updateWireTunnel(delta, elapsedTime);
    }

    // 3D Camera kinematics (Static, no automatic orbital rotation)
    if (this.camera) {
      const cosElev = Math.cos(this.cameraElevation);
      const sinElev = Math.sin(this.cameraElevation);
      const x = this.cameraDistance * cosElev * Math.sin(this.cameraAzimuth);
      const y = this.cameraDistance * sinElev;
      const z = this.cameraDistance * cosElev * Math.cos(this.cameraAzimuth);

      this.camera.position.set(x, y, z);
      if (Math.abs(this.cameraElevation) > 1.4) {
        this.camera.up.set(0, 0, -1);
      } else {
        this.camera.up.set(0, 1, 0);
      }
      this.camera.lookAt(0, 0, 0);
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

  // ═══════════════════════════════════════════════════════════
  // STYLE TUNING: PALETTE & DENSITY CONTROLS
  // ═══════════════════════════════════════════════════════════

  setPalette(palette: VisualPalette): void {
    this.currentPalette = palette;
    const paletteMap: Record<VisualPalette, number> = {
      pastel: 0,
      monochrome: 1,
      amber_crt: 2,
      green_crt: 3,
      cyber_blue: 4,
      stark: 5,
    };
    const val = paletteMap[palette] ?? 0;
    if (this.particleMaterial?.uniforms.u_palette) {
      this.particleMaterial.uniforms.u_palette.value = val;
    }
    if (this.fluidMaterial?.uniforms.u_palette) {
      this.fluidMaterial.uniforms.u_palette.value = val;
    }
    if (this.waterfallMaterial?.uniforms.u_palette) {
      this.waterfallMaterial.uniforms.u_palette.value = val;
    }
    this.updateStaticMaterialsForPalette();
  }

  getPalette(): VisualPalette {
    return this.currentPalette;
  }

  cyclePalette(): VisualPalette {
    const list: VisualPalette[] = ["pastel", "stark", "monochrome", "amber_crt", "green_crt", "cyber_blue"];
    const idx = (list.indexOf(this.currentPalette) + 1) % list.length;
    this.setPalette(list[idx]);
    return this.currentPalette;
  }

  private initCameraControls(): void {
    if (!this.renderer) return;
    const dom = this.renderer.domElement;
    dom.style.cursor = "grab";

    dom.addEventListener("pointerdown", (e: PointerEvent) => {
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      dom.style.cursor = "grabbing";
      try { dom.setPointerCapture(e.pointerId); } catch {}
    });

    dom.addEventListener("pointermove", (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      this.cameraAzimuth -= dx * 0.007;
      this.cameraElevation = Math.max(-1.45, Math.min(1.45, this.cameraElevation + dy * 0.007));
      if (this.cameraPreset !== "custom") {
        this.cameraPreset = "custom";
        this.onCameraPresetChange?.("custom");
      }
    });

    const stopDrag = (e: PointerEvent) => {
      if (this.isDragging) {
        this.isDragging = false;
        dom.style.cursor = "grab";
        try { dom.releasePointerCapture(e.pointerId); } catch {}
      }
    };

    dom.addEventListener("pointerup", stopDrag);
    dom.addEventListener("pointercancel", stopDrag);

    dom.addEventListener("wheel", (e: WheelEvent) => {
      e.preventDefault();
      const zoom = e.deltaY * 0.002;
      this.cameraDistance = Math.max(0.8, Math.min(6.0, this.cameraDistance + zoom));
    }, { passive: false });

    dom.addEventListener("dblclick", () => {
      this.resetCameraPreset();
    });
  }

  setThickness(thick: ThicknessLevel): void {
    this.currentThickness = thick;
    const ptSizes: Record<ThicknessLevel, number> = {
      fine: 2.0,
      normal: 3.8,
      bold: 6.2,
      chunky: 9.5,
    };
    const dustSizes: Record<ThicknessLevel, number> = {
      fine: 1.6,
      normal: 2.8,
      bold: 4.8,
      chunky: 7.2,
    };
    const lineOpacities: Record<ThicknessLevel, number> = {
      fine: 0.55,
      normal: 0.75,
      bold: 0.92,
      chunky: 1.0,
    };

    if (this.particleMaterial?.uniforms?.u_point_size) {
      this.particleMaterial.uniforms.u_point_size.value = ptSizes[thick];
    }
    if (this.radarBarsLine) (this.radarBarsLine.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    if (this.radarSweepLine) (this.radarSweepLine.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    if (this.dsoCh1Line) (this.dsoCh1Line.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    if (this.dsoCh2Line) (this.dsoCh2Line.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    if (this.wireConduitsLine) (this.wireConduitsLine.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    if (this.wireLatticeLine) (this.wireLatticeLine.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    this.torusStreamlines.forEach((loop) => {
      (loop.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    });
    this.tunnelRings.forEach((loop) => {
      (loop.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    });
    this.wireRings.forEach((loop) => {
      (loop.material as THREE.LineBasicMaterial).opacity = lineOpacities[thick];
    });
  }

  getThickness(): ThicknessLevel {
    return this.currentThickness;
  }

  cycleThickness(): ThicknessLevel {
    const list: ThicknessLevel[] = ["fine", "normal", "bold", "chunky"];
    const idx = (list.indexOf(this.currentThickness) + 1) % list.length;
    this.setThickness(list[idx]);
    return this.currentThickness;
  }

  setCameraSpeed(speed: number): void {
    this.cameraSpeed = Math.max(0.0, Math.min(4.0, speed));
  }

  getCameraSpeed(): number {
    return this.cameraSpeed;
  }

  cycleCameraSpeed(): number {
    const speeds = [0.0, 0.5, 1.0, 2.0];
    const currentIdx = speeds.findIndex((s) => Math.abs(s - this.cameraSpeed) < 0.05);
    const nextIdx = (currentIdx + 1) % speeds.length;
    this.setCameraSpeed(speeds[nextIdx]);
    return this.cameraSpeed;
  }

  setCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset;
    if (preset === "front") {
      this.cameraElevation = 0.0;
      this.cameraAzimuth = 0.0;
      this.cameraDistance = 2.4;
    } else if (preset === "isometric") {
      this.cameraElevation = 0.52;
      this.cameraAzimuth = 0.65;
      this.cameraDistance = 2.4;
    } else if (preset === "top") {
      this.cameraElevation = 1.48;
      this.cameraAzimuth = 0.0;
      this.cameraDistance = 2.4;
    }
    if (this.camera) {
      const cosElev = Math.cos(this.cameraElevation);
      const sinElev = Math.sin(this.cameraElevation);
      const x = this.cameraDistance * cosElev * Math.sin(this.cameraAzimuth);
      const y = this.cameraDistance * sinElev;
      const z = this.cameraDistance * cosElev * Math.cos(this.cameraAzimuth);
      this.camera.position.set(x, y, z);
      if (Math.abs(this.cameraElevation) > 1.4) {
        this.camera.up.set(0, 0, -1);
      } else {
        this.camera.up.set(0, 1, 0);
      }
      this.camera.lookAt(0, 0, 0);
    }
    this.onCameraPresetChange?.(this.cameraPreset);
  }

  getCameraPreset(): CameraPreset {
    return this.cameraPreset;
  }

  cycleCameraPreset(): CameraPreset {
    const presets: CameraPreset[] = ["front", "isometric", "top"];
    const currentIdx = presets.indexOf(this.cameraPreset);
    const nextIdx = (currentIdx + 1) % presets.length;
    this.setCameraPreset(presets[nextIdx]);
    return this.cameraPreset;
  }

  resetCameraPreset(): void {
    this.setCameraPreset("front");
  }

  resetPerspective(): void {
    this.setCameraPreset("front");
  }

  setDetail(detail: GeometryDetail): void {
    this.currentDetail = detail;
    const maxCount = this.particleCount;
    const countMap: Record<GeometryDetail, number> = {
      low: Math.round(maxCount * 0.25),
      mid: Math.round(maxCount * 0.5),
      high: Math.round(maxCount * 0.85),
      ultra: maxCount,
    };
    if (this.particlePoints) {
      this.particlePoints.geometry.setDrawRange(0, countMap[detail] || maxCount);
    }
    // Dynamic stream line density for Torus Vortex
    this.torusStreamlines.forEach((loop, idx) => {
      if (detail === "low") loop.visible = idx % 3 === 0;
      else if (detail === "mid") loop.visible = idx % 2 === 0;
      else loop.visible = true;
    });
    // Ring density for Warp Tunnel
    this.tunnelRings.forEach((ring, idx) => {
      if (detail === "low") ring.visible = idx % 2 === 0;
      else ring.visible = true;
    });
    // Wire rings density for Neon Wire Tunnel
    this.wireRings.forEach((ring, idx) => {
      if (detail === "low") ring.visible = idx % 2 === 0;
      else ring.visible = true;
    });
  }

  getDetail(): GeometryDetail {
    return this.currentDetail;
  }

  cycleDetail(): GeometryDetail {
    const list: GeometryDetail[] = ["low", "mid", "high", "ultra"];
    const idx = (list.indexOf(this.currentDetail) + 1) % list.length;
    this.setDetail(list[idx]);
    return this.currentDetail;
  }

  setVisualGain(gain: number): void {
    this.visualGain = Math.max(0.2, Math.min(4.0, gain));
  }

  getVisualGain(): number {
    return this.visualGain;
  }

  toggleCameraDrift(): boolean {
    if (this.cameraSpeed > 0) {
      this.setCameraSpeed(0);
    } else {
      this.setCameraSpeed(1.0);
    }
    return this.cameraSpeed > 0;
  }

  private updateStaticMaterialsForPalette(): void {
    const pal = this.currentPalette;
    let primary = new THREE.Color(1.0, 0.08, 0.20); // Stark Crimson Red
    let secondary = new THREE.Color(0.0, 0.90, 1.0); // Electric Stark Cyan
    let accent = new THREE.Color(1.0, 0.05, 0.78);   // Hot Electric Magenta

    if (pal === "pastel") {
      primary = new THREE.Color(0.96, 0.38, 0.72); // Soft Pastel Rose
      secondary = new THREE.Color(0.38, 0.75, 0.96); // Soft Pastel Sky
      accent = new THREE.Color(0.45, 0.88, 0.72);   // Soft Mint
    } else if (pal === "amber_crt") {
      primary = new THREE.Color(1.0, 0.65, 0.0);
      secondary = new THREE.Color(0.85, 0.40, 0.0);
      accent = new THREE.Color(1.0, 0.90, 0.35);
    } else if (pal === "green_crt") {
      primary = new THREE.Color(0.1, 0.95, 0.3);
      secondary = new THREE.Color(0.0, 0.55, 0.15);
      accent = new THREE.Color(0.7, 1.0, 0.7);
    } else if (pal === "cyber_blue") {
      primary = new THREE.Color(0.0, 0.80, 1.0);
      secondary = new THREE.Color(0.0, 0.30, 0.85);
      accent = new THREE.Color(0.65, 0.95, 1.0);
    } else if (pal === "monochrome") {
      primary = new THREE.Color(1.0, 0.2, 0.2);
      secondary = new THREE.Color(0.85, 0.85, 0.85);
      accent = new THREE.Color(0.4, 0.4, 0.4);
    }

    // Radar
    if (this.radarBarsLine) (this.radarBarsLine.material as THREE.LineBasicMaterial).color.copy(primary);
    if (this.radarSweepLine) (this.radarSweepLine.material as THREE.LineBasicMaterial).color.copy(accent);

    // Torus streamlines
    this.torusStreamlines.forEach((loop, idx) => {
      const mat = loop.material as THREE.LineBasicMaterial;
      if (idx % 3 === 0) mat.color.copy(primary);
      else if (idx % 3 === 1) mat.color.copy(secondary);
      else mat.color.copy(accent);
    });

    // Warp tunnel (radiating ribs in distinct palette hues, horizontal rings gradient-transitioning)
    this.updateTunnelColors();
    if (this.tunnelGroup) {
      this.tunnelGroup.traverse((child) => {
        if ((child as any).material && (child as any).material.color) {
          ((child as any).material as THREE.LineBasicMaterial).color.setHex(0xFFFFFF);
        }
      });
      this.tunnelRings.forEach((line, k) => {
        const col = this.tunnelRingColors[k];
        if (col) {
          for (let i = 0; i < 16; i++) {
            const c = this.tunnelRibColors[i];
            if (c) {
              col[i * 3 + 0] = c.r;
              col[i * 3 + 1] = c.g;
              col[i * 3 + 2] = c.b;
            }
          }
          const colAttr = line.geometry.getAttribute("color") as THREE.BufferAttribute;
          if (colAttr) colAttr.needsUpdate = true;
        }
      });
    }

    // Digital Oscilloscope
    if (this.dsoCh1Line) {
      (this.dsoCh1Line.material as THREE.LineBasicMaterial).color.copy(primary);
    }
    if (this.dsoCh2Line) {
      (this.dsoCh2Line.material as THREE.LineBasicMaterial).color.copy(secondary);
    }
    if (this.dsoTriggerMarker) {
      (this.dsoTriggerMarker.material as THREE.LineBasicMaterial).color.copy(accent);
    }

    // Neon Wire Tunnel
    if (this.wireConduitsLine) {
      (this.wireConduitsLine.material as THREE.LineBasicMaterial).color.copy(primary);
    }
    if (this.wireLatticeLine) {
      (this.wireLatticeLine.material as THREE.LineBasicMaterial).color.copy(secondary);
    }
  }

  setClearColor(hex: number, alpha = 1.0): void {
    this.isDark = hex === 0x000000 || hex < 0x222222;
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
