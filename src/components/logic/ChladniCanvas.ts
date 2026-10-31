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

export type VisualizerMode = "particles" | "fluid";

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

  // Particle System
  private particleCount = 12000;
  private particlePoints: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private particleVelocities: Float32Array | null = null;
  private particleOriginalPositions: Float32Array | null = null;

  // Fluid Mesh
  private fluidMesh: THREE.Mesh | null = null;
  private fluidMaterial: THREE.ShaderMaterial | null = null;

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

    // Hard-edged square particle shader
    const particleMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.5;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        void main() {
          // Sharp square particles in #FF3333 (Accent Industrial)
          gl_FragColor = vec4(1.0, 0.2, 0.2, 1.0);
        }
      `,
      transparent: false,
    });

    this.particlePoints = new THREE.Points(geometry, particleMaterial);
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
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_n;
        uniform float u_m;
        uniform float u_amplitude;
        varying vec2 vUv;
        varying float vHeight;

        void main() {
          vUv = uv;
          vec2 centered = uv - 0.5;
          float dist = length(centered);

          // Standing circular waves + interference cross-ripples
          float wave = sin(dist * u_n * 14.0 - u_time * 3.5);
          float interference = cos(centered.x * u_m * 18.0) * sin(centered.y * u_n * 18.0);
          float h = (wave * 0.5 + interference * 0.5) * (u_amplitude * 0.28);
          
          vHeight = h;
          vec3 displaced = position;
          displaced.z += h;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_amplitude;
        varying vec2 vUv;
        varying float vHeight;

        void main() {
          // Brutalist wireframe contrast: pure #FF3333 with depth shading
          float intensity = smoothstep(-0.15, 0.2, vHeight);
          vec3 col = mix(vec3(0.0, 0.0, 0.0), vec3(1.0, 0.2, 0.2), 0.75 + intensity * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.fluidMesh = new THREE.Mesh(geometry, this.fluidMaterial);
    // Slight tilt to see the 3D surface ripples
    this.fluidMesh.rotation.x = -Math.PI * 0.28;
    this.fluidMesh.position.y = -0.1;
    this.scene?.add(this.fluidMesh);
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
  }

  updateUniforms(uniforms: Partial<VisualizerUniforms>): void {
    if (uniforms.n !== undefined) this.uN = uniforms.n;
    if (uniforms.m !== undefined) this.uM = uniforms.m;
    if (uniforms.amplitude !== undefined) this.uAmplitude = uniforms.amplitude;

    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_n.value = this.uN;
      this.fluidMaterial.uniforms.u_m.value = this.uM;
      this.fluidMaterial.uniforms.u_amplitude.value = this.uAmplitude;
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

  private updateParticles(delta: number): void {
    if (!this.particlePositions || !this.particlePoints) return;

    const count = this.particleCount;
    const n = this.uN;
    const m = this.uM;
    const amp = this.uAmplitude;
    const eps = 0.01;
    const speed = 0.65 * amp;
    const wander = 0.008;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      let x = this.particlePositions[idx];
      let y = this.particlePositions[idx + 1];

      // Numerical gradient of Chladni function
      const val = this.chladni(x, y, n, m);
      const gradX = (this.chladni(x + eps, y, n, m) - val) / eps;
      const gradY = (this.chladni(x, y + eps, n, m) - val) / eps;

      // Migrate particles down the gradient toward nodal zero lines (val = 0)
      const forceX = -val * gradX * speed;
      const forceY = -val * gradY * speed;

      // Brownian noise
      const noiseX = (Math.random() - 0.5) * wander;
      const noiseY = (Math.random() - 0.5) * wander;

      x += forceX * delta * 60 + noiseX;
      y += forceY * delta * 60 + noiseY;

      // Bounds clamp with gentle reset if escaped
      if (x < -0.95 || x > 0.95 || y < -0.95 || y > 0.95) {
        x = (Math.random() - 0.5) * 1.8;
        y = (Math.random() - 0.5) * 1.8;
      }

      this.particlePositions[idx] = x;
      this.particlePositions[idx + 1] = y;
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

    if (this.mode === "particles") {
      this.updateParticles(delta);
    } else if (this.mode === "fluid" && this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_time.value = elapsedTime;
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
