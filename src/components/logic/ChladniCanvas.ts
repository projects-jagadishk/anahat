/**
 * ChladniCanvas.ts
 * Three.js WebGL Chladni particle system (Phase 4 implementation).
 * GPGPU ping-pong FBO architecture for 10,000+ particles at 60 FPS.
 *
 * This is a stub — the full GLSL shaders will be wired in Phase 4.
 */

import * as THREE from "three";

export interface ChladniUniforms {
  n: number;
  m: number;
  amplitude: number;
}

export class ChladniCanvas {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private animationId: number | null = null;
  private isPaused = false;

  mount(container: HTMLElement): void {
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;

    // Placeholder: simple grid of points
    const geometry = new THREE.BufferGeometry();
    const count = 10000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 2] = 0;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xff3333, // accent-industrial
      size: 2,
      sizeAttenuation: false,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    console.log("[ChladniCanvas] Mounted — 10,000 placeholder particles");
    this.animate();
  }

  private animate = (): void => {
    if (this.isPaused) return;
    this.animationId = requestAnimationFrame(this.animate);

    if (this.renderer && this.scene && this.camera) {
      // TODO: Update GPGPU ping-pong FBO textures
      this.renderer.render(this.scene, this.camera);
    }
  };

  updateUniforms(_uniforms: ChladniUniforms): void {
    // TODO: Pass n, m, amplitude to GPU compute shader
    console.log("[ChladniCanvas] Uniforms updated:", _uniforms);
  }

  pause(): void {
    this.isPaused = true;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    console.log("[ChladniCanvas] Paused — WebGL loop stopped");
  }

  resume(): void {
    this.isPaused = false;
    this.animate();
    console.log("[ChladniCanvas] Resumed");
  }

  dispose(): void {
    this.pause();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}
