# ANAHAT — Master Build Plan & Execution Checklist

> **Project:** Anahat (Neuroacoustic Sound Deck & Visualizer)  
> **Tech Stack:** Tauri v2 (Rust 1.99), Astro v7, Tailwind CSS v4, Three.js, Web Audio API / Rust DSP  
> **Aesthetic Paradigm:** Utilitarian Brutalism (Zero Radius, High Contrast Monochrome, `#FF3333` Industrial Accent)  
> **Figma Source:** [Anahat Figma File](https://www.figma.com/design/tD1zntGslnFYJ8jI2y4k8V/Anahat)  
> **Figma Plugin Reference:** `figma-plugin/code.js`

---

## Master Checklist

### Step 1: The Native Shell (Tauri v2 & Window Management)
- [x] **Frameless & Transparent Window Config** (`src-tauri/tauri.conf.json`): Configured `decorations: false`, `transparent: true`, 1200x800 resolution with min bounds (960x640).
- [x] **Brutalist Title Bar Component** (`src/components/ui/TitleBar.astro`):
  - [x] `[ DATA-TAURI-DRAG-REGION ]` native window drag support.
  - [x] 78px traffic light spacer for macOS.
  - [x] In-titlebar `[ ROUTE AUDIO ]` button to trigger audio routing matrix.
  - [x] Native window minimize/maximize/hide buttons (auto-hidden on macOS).
- [x] **Tray Initialization & Background Persistence** (`src-tauri/src/lib.rs`):
  - [x] System tray menu (`Show Anahat`, `Play / Pause`, `Quit`).
  - [x] Intercept window close event -> hide window to system tray instead of terminating.
  - [x] Emit `window-hidden` event to throttle/pause WebGL render loop when hidden.
- [x] **Tauri IPC Command Infrastructure**:
  - [x] `ping`: Health check.
  - [x] `get_audio_state`: Query active DSP frequencies and playback state.
  - [x] `set_harmonics`: Sync $n$, $m$, and master amplitude.
  - [x] `load_preset`: Load neuroacoustic preset into native state.
- [x] **Native App Icon Suite**: Generated 32x32, 128x128, ICNS, ICO, and Android/iOS app icons.

---

### Step 2: The Data & Layout (Brutalist UI & Preset Hydration)
- [x] **Tailwind CSS v4 Configuration** (`src/styles/global.css`):
  - [x] `@theme` token definitions (`--color-bg-concrete: #E5E5E5`, `--color-accent-industrial: #FF3333`, etc.).
  - [x] Absolute global reset: `* { border-radius: 0px !important; }`.
  - [x] Brutalist hard drop shadow: `6px 6px 0px 0px #000000`.
- [x] **Figma Screen 1: The Main Deck (1200x800 Tri-Column Grid)** (`src/pages/index.astro`):
  - [x] **Left Column (300px)**: Dark header `ANAHAT V1.0 // PRESETS`, category headers (`--- [ VEDIC ] ---`, `--- [ SOLFEGGIO ] ---`, `--- [ MODERN CLINICAL ] ---`), 276x36px preset rows with active highlight.
  - [x] **Chunky Session Button**: `[ REC SESSION ]` at bottom with brutalist shadow and depression interaction.
  - [x] **Center Column (600px)**:
    - [x] Canvas Card: Coordinate grid background, dark toolbar with mode toggle and `[ THEATER ⤢ ]` button.
    - [x] Fixed Control Deck: Massive 86px+ Hz readout with extreme scale contrast to 10px labels, harmonic $n$ and $m$ sliders, and ASCII noise bar (`████████░░░░ 34%`).
    - [x] **Layout Sizing Fix**: Slider section locked with `flex-shrink: 0` so canvas never pushes controls out of view.
  - [x] **Right Column (300px)**: `PROVENANCE // SPEC-001` Card with alternating spec table rows, research abstract, citation, and `[ BIOMETRIC SYNC // V2 ]` button.
- [x] **Figma Screen States**:
  - [x] **Screen 2: Theater Mode**: 1920x1080 chromeless fullscreen overlay with pure black background (`#000000`), `#FF3333` visualizer, and stark `[ ✕ ]` exit button.
  - [x] **Screen 4: Audio Routing Matrix**: 800x600 hardware patch bay modal for DAC outputs and latency tuning.
  - [x] **Screen 5: Recording Active State**: `[ RECORDING... ]` red button, clamped 4px `#FF3333` canvas border, and terminal-blinking `REC 00:00:00:00` timecode.
  - [x] **Screen 6: Biometric Sync Modal**: 500x400 BLE scanner modal with live SVG oscilloscope wave.

---

### Step 3: The Audio Engine (Real-Time DSP & Binaural Synthesis)
- [x] **Architecture Stub & Interface** (`src/components/logic/AudioEngine.ts`):
  - [x] `AudioParams` interface (carrier Hz, offset Hz, amplitude, waveform, noise type, blend ratio).
- [ ] **Native Synthesis (Rust DSP / `fundsp` + `rodio`)**:
  - [ ] Real-time binaural carrier/offset oscillators (independent L/R routing).
  - [ ] Stochastic noise generators (Pink, Brown, White) with low-pass roll-off filter.
  - [ ] Live audio buffer capture to uncompressed `.wav` via native save dialog.
- [ ] **Web Audio API Bridge**:
  - [ ] Web Audio `AnalyserNode` FFT data export.
  - [ ] Transfer frequency spectrum to visualizer `DataTexture` uniform.

---

### Step 4: The Visualizer (Three.js WebGL & Compute Shaders)
- [x] **Three.js WebGL Core** (`src/components/logic/ChladniCanvas.ts`):
  - [x] Mounted directly into `#webgl-canvas` with automatic `ResizeObserver` handling.
- [x] **Chladni Particle System**:
  - [x] 12,000 particles migrating towards 2D nodal lines:
    $$Z = \sin(n \cdot \pi \cdot x) \cdot \sin(m \cdot \pi \cdot y) - \sin(m \cdot \pi \cdot x) \cdot \sin(n \cdot \pi \cdot y)$$
  - [x] Hard-edged square fragment shader tinted in `#FF3333` (Accent Industrial).
  - [x] Numerical gradient descent physics with Brownian wander noise.
- [x] **Faraday Waves (Fluid Cymatics Mode)**:
  - [x] Continuous 3D plane wireframe mesh (96x96 segments).
  - [x] Vertex displacement shader combining radial standing waves and cross-interference:
    $$\text{wave} = \sin(\text{dist} \cdot n \cdot 14.0 - t \cdot 3.5)$$
    $$\text{interference} = \cos(x \cdot m \cdot 18.0) \cdot \sin(y \cdot n \cdot 18.0)$$
- [x] **Mode Switching & Reactivity**:
  - [x] Instant toggle between `[X] CHLADNI PARTICLES` and `[X] FARADAY FLUID`.
  - [x] Live uniform updates when adjusting $n$ and $m$ sliders or picking presets.
  - [x] Dual-mount support for both Main Deck and Theater Mode.
