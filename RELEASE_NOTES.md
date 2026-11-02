# Anahat v1.1.0 — Performance, Memory & Security Overhaul

> **Release Tag:** `v1.1.0`  
> **Previous Release:** `v1.0.0`  
> **Scope:** Full-stack systems audit, real-time DSP lock optimization, zero-allocation WebGL rendering, WebKit power management, and Tauri v2 security hardening.

---

## ⚡ Highlights

Anahat v1.1.0 delivers a comprehensive performance, security, and tactile interactivity upgrade:
- **Zero-Allocation Rendering & DSP:** Eliminates all identified memory leaks and over **200,000 heap allocations per second** in the active visualizer and audio synthesis loops.
- **Background Resource Suspension:** Suspends WebGL rendering loops, audio synthesis context, and telemetry timers when minimized to the system tray, dropping idle CPU/GPU consumption to baseline zero.
- **Tactile Canvas Interactivity:** Introduced real-time 3D raycasted click disturbances on the Chladni plate and visualizers—displacing particles with localized kinetic shockwaves that smoothly re-coalesce onto mathematical nodal curves.
- **Unambiguous Audio Ingest Controls:** Completely refined the toolbar and routing matrix labels (`SOURCE: [ ∿ INTERNAL SYNTH | 🎙 LIVE MIC ]`) with explicit behavioral tooltips.
- **Release Packaging & Iconography Resolution:** Corrected missing titlebar emblems (`/logo.svg` bundling) and native macOS/Windows system tray template icons.
- **Security & Pipeline Hardening:** Eliminated stored XSS vectors in custom preset imports, dropped the global Tauri IPC bridge object, and enforced strict release branch validation gates with automated downmerge pull requests.

---

## 🚀 Performance & Memory Optimizations

### 1. Real-Time Audio DSP: Zero-Allocation & Lock-Free Updates

- **Eliminated String Allocations in Audio Thread:** Replaced heap-allocated `String` representations of waveforms and noise spectra with stack-allocated, `Copy`-safe `WaveformType` and `NoiseType` enums inside `NeuroacousticSource::next()`, removing ~192,000 `malloc`/`free` calls per second at 48 kHz.
- **Lock-Free Audio Generation:** Replaced per-sample `Mutex<DspParams>` locking with an atomic `params_dirty` cache flag. Mutex acquisition now occurs only when the user adjusts a slider or switches presets, completely freeing the audio synthesis thread from lock contention.
- **Atomic Stereo Pair Recording:** Unified left and right channel recording into a single atomic lock operation, cutting lock frequency in half (48,000 locks/sec) and eliminating channel desynchronization risks. Added a safe 1-hour recording ceiling (`MAX_RECORDING_SAMPLES`).

### 2. Complete Visualizer Zero-Allocation Engine (Three.js)

- **Zero-Allocation Palette Color Sampler:** Pre-allocated static palette vectors across all color themes (`PAL_MONO`, `PAL_AMBER`, `PAL_GREEN`, `PAL_CYBER`, `PAL_STARK`, `PAL_PASTEL`) with dedicated output scratch buffers.
- **Eliminated 200,000+ JS Allocations / Sec:** Completely removed per-frame and per-vertex `new THREE.Color()` and `color.clone()` allocations across all 11 visualizers:
  - **Chladni Particles:** Exact analytic gradients $\frac{\partial Z}{\partial x}$ and $\frac{\partial Z}{\partial y}$ replace numerical finite-difference sampling, cutting trigonometric evaluations in half and linking CPU workload directly to `activeParticleCount`.
  - **Polar Radar:** Static scratch color buffers eliminate 96 allocations per frame.
  - **Voxel Matrix:** Reusable `dummyVoxel` and static kick/peak colors eliminate 512 allocations per frame.
  - **Warp Tunnel & Neon Wire Tunnel:** Direct indexing of pre-allocated `Float32Array` buffers and static sorting indices eliminate over 790 nested array allocations per frame.
  - **Ethereal Mist:** Static dark tint constants eliminate over 2,200 color allocations per frame across wisps, particles, and smoke puffs.
- **Deep Scene Disposal:** Upgraded `ChladniCanvas.dispose()` to recursively traverse the Three.js scene hierarchy, freeing all geometries, material buffers, and procedural textures from GPU Unified Memory (VRAM).
- **Resize Debouncing:** Added an 80ms timer debounce and dimension equality guards to `handleResize()`, preventing rapid WebGL render-target reallocations during display DPI or window changes.

### 3. Background Power & Thread Management

- **Instant Idle Sleep on Tray Minimization:** Intercepted window close and tray minimization events (`window-hidden`, `visibilitychange`) to immediately pause WebGL `requestAnimationFrame` loops, telemetry meters, and engine cycling timers.
- **WebKit Audio Thread Halting:** Wired `AudioContext.suspend()` on pause/hide and `AudioContext.resume()` on playback/show, halting background macOS CoreAudio threads when no audio is playing.
- **Hardware Output De-duplication:** Disconnected Web Audio API `masterGain` from `AudioContext.destination` in native Tauri mode to prevent redundant software mixing (Rodio handles hardware DAC output directly).
- **Visualizer Mutual Exclusion:** Main deck and fullscreen Theater visualizers now enforce strict mutual exclusion, preventing concurrent WebGL rendering.

### 4. Bundle Optimization & Code Splitting

- **Rollup Vendor Chunking:** Configured Vite `manualChunks` to isolate `three-vendor` (470 KB) and `gsap-vendor` (67.9 KB).
- **82% Main Chunk Reduction:** The primary application script shrank from **656.6 KB down to 118.3 KB**, eliminating bundle size warnings and accelerating webview boot time.

---

## 🔒 Security & Capability Hardening

### 1. Stored XSS Elimination in Preset Import

- **Remediation:** Refactored `renderUserPresets()` to build DOM nodes using `document.createElement()` and bind text via `.textContent`, eliminating an HTML string interpolation vulnerability where imported `.anahat` JSON profiles could execute arbitrary scripts.
- **Strict Schema Sanitization:** `handleImportFile()` now sanitizes and type-validates all incoming properties, enforces numeric ranges for frequencies, strips dangerous keys (`__proto__`, `constructor`), and enforces a 50-preset safety quota to prevent `localStorage` exhaustion.

### 2. IPC Attack Surface Reduction (Principle of Least Privilege)

- **Disabled Global Tauri Object:** Set `"withGlobalTauri": false` in `tauri.conf.json`. The webview window no longer exposes the internal `window.__TAURI__` object, relying exclusively on scoped ES module imports.
- **Removed Unused Shell Plugin:** Completely stripped `tauri-plugin-shell` from Rust dependencies, capabilities, and permissions, closing unnecessary command execution and external browser launching vectors.
- **WAV Export Validation:** Added path validation and enforced the `.wav` file extension in `stop_and_save_wav()`, rejecting malformed or misleading destination paths.
- **CSP Level 3 Directives:** Upgraded Content Security Policy to include `style-src-elem 'self' https://fonts.googleapis.com` to prohibit injected `<style>` tags, while retaining `style-src-attr 'unsafe-inline'` for safe programmatic DOM styling.

---

## 🎨 Interactive Canvas Dynamics & UI Refinements

### 1. Real-Time Canvas Click Disturbances (Chladni Plate & Beyond)

- **Raycasted 3D Interaction:** Added screen-to-plate raycasting via `THREE.Raycaster` and `THREE.Plane` ($Z = 0$), translating 2D pointer coordinates `(clientX, clientY)` directly to physical plate space regardless of camera orientation or perspective.
- **Physical Nodal Perturbation:** Clicking any point on the canvas triggers an instantaneous radial blast wave with subtle vortex curl (`i % 2` rotational swirl) around the epicenter, temporarily knocking particles out of place.
- **Organic Harmonic Recovery:** As the kinetic impulse decays over 1.35 seconds, the underlying Ernst Chladni analytical gradient $\nabla Z$ and viscous damping ($d = 0.94$) smoothly steer the scattered particles back into their nodal equilibrium lines.
- **Cross-Engine Reactivity:** Click disturbances also induce surface shockwave pulses in Faraday Fluid (`u_burst_active`) and kinetic dispersion in Ethereal Mist.
- **Click vs. Drag Differentiation:** Differentiated single clicks/taps (< 5px movement) from 3D camera orbital drags (> 5px movement), providing immediate tactile feedback without fighting camera perspective adjustments.

### 2. Unambiguous Audio Ingest Source Labels

- **Primary Toolbar Clarification:** Replaced ambiguous `AUDIO: [ ∿ TONES | 🎙 MIC ]` with `SOURCE: [ ∿ INTERNAL SYNTH | 🎙 LIVE MIC ]`.
- **Descriptive Functional Tooltips:**
  - `∿ INTERNAL SYNTH`: Generates dual-channel carrier frequencies, binaural beats, and harmonic ratios.
  - `🎙 LIVE MIC`: Captures external room audio, voice, or instruments in real-time with zero audio feedback.
- **Routing Matrix & HUD Alignment:** Synchronized labels across the Hardware Audio Routing modal (`[X] INTERNAL TONE SYNTH (CARRIER & HARMONICS)` / `[ ] LIVE MICROPHONE INGEST (ACOUSTIC VISUALIZATION)`), Fullscreen Theater HUD (`SRC: INTERNAL SYNTH [TONE GENERATOR]` / `SRC: LIVE MIC [ACOUSTIC INGEST]`), and Command Matrix hotkeys.

---

## 🖼️ Iconography & Desktop Packaging Fixes

### 1. Titlebar Emblem Bundling (Fixed WebKit Blue Question Mark)

- **Problem:** In release builds (`npm run build`), the custom titlebar `<img src="/logo.svg" />` failed to load because `logo.svg` resided in the project root rather than `public/`, causing macOS WebKit to render a blue question mark broken image placeholder.
- **Resolution:** Placed `logo.svg` in `public/logo.svg`, guaranteeing its static inclusion in `dist/logo.svg` across all desktop distribution bundles.

### 2. Native System Tray Icon Resolution

- **Transparent Stencil Generation:** Generated dedicated 32×32 and 64×64 transparent monochrome tray icons (`src-tauri/icons/tray-icon.png`) representing the Anahat cymatics node matrix, replacing an opaque 512×512 black image that broke macOS menu bar template rendering (`iconAsTemplate: true`).
- **Tauri Tray Collision Fix:** Refactored `setup_tray` in `src-tauri/src/lib.rs` to configure the existing tray instance created by `tauri.conf.json` (`app.tray_by_id("main-tray")`) directly, preventing duplicate ID registration collisions and ensuring menu actions and click handlers attach reliably.

---

## 🔄 CI/CD & Branching Workflow Automation

- **Release Tag Verification Gate:** Added `verify-main-tag` job to `.github/workflows/release.yml`, executing an ancestry check (`git merge-base --is-ancestor HEAD main`) to enforce that release tags (`v*`) are cut strictly from `main`.
- **Automated Main-to-Develop Downmerge:** Created `.github/workflows/downmerge-main-to-develop.yml` which triggers on any push to `main` (hotfixes, releases) and automatically opens a pull request (`chore(sync): downmerge main into develop`) to keep `develop` in sync.
- **Protected Branch Git Hooks:** Updated local hooks (`.githooks/pre-commit`, `.githooks/pre-push`) to enforce feature PRs targeting `develop` and hotfix PRs targeting `main`.
- **macOS Sequoia Gatekeeper Guidance:** Documented first-launch Gatekeeper bypass steps (System Settings > Privacy & Security > Open Anyway) on the landing site and in `docs/DISTRIBUTION.md`.

---

## 🛠️ Build & Verification Matrix

- **Astro / Vite Frontend:** `npm run build` passes with zero errors, zero warnings.
- **Rust Backend:** `cargo check` & `cargo clippy` pass with zero errors.
- **Zero Allocations Verified:** Verified via profiling that all active rendering loops maintain a flat memory line without GC sawteeth.

---

# ANAHAT // v1.0.0 [ GOLDEN MASTER RELEASE ]

### Real-Time Acoustic Resonance, Cymatic Waveforms & Mathematical Harmonics Synthesizer

We are thrilled to launch the inaugural production release of **Anahat** (_Sanskrit: अनाहत — "The Unstruck Sound"_), a lightweight, background-first desktop neuroacoustic sound synthesizer and mathematical cymatics
visualizer built with a raw industrial brutalist aesthetic.

Unlike traditional ambient sound applications that loop static, compressed MP3 recordings, Anahat synthesizes **100% of its audio in real-time** via the Web Audio API and native Rust audio pipeline (`rodio`/`hound`),
paired with 11 GPU-accelerated WebGL visualizer engines running at 60 FPS.

---

### 🌐 Live Web Showcase & Documentation

- **Interactive Web Simulator & Downloads**: https://anahat.jagadishk.work
- **Product Hunt**: https://www.producthunt.com/@jagadishk
- **Support the Project**: https://coff.ee/jagadishk

---

### 🎛️ What's Included in v1.0.0

#### 1. Pure Algorithmic Audio Synthesizer (Zero MP3s)

- **100% Real-Time Mathematical Synthesis**: Real-time stereo binaural carrier generation, frequency offset modulation, and harmonic interval synthesis. Zero pre-recorded audio loops.
- **30-Preset Scientific Provenance Catalog**: Calibrated database spanning Vedic Solfeggio, planetary frequencies, circadian entrainment, Schumann Earth resonances, and clinical EEG targets (Delta, Theta, Alpha,
  Beta, Gamma).
- **Dual Chladni Harmonic Modulator**: Live adjustment of integer modal parameters ($n, m \in [1, 10]$) simultaneously modulating carrier harmonics and 3D nodal line patterns.
- **Stochastic Noise Modulators**: Independent Brown, Pink, and White noise generators with 2-pole low-pass resonant filter roll-off.
- **Lossless Audio Recording**: Direct disk capture to uncompressed 32-bit float WAV via native OS file dialogs.

#### 2. Tibetan Singing Bowl Modal Physical Modeling

- **Modal Resonance Physical Model**: Synthesizes a 40ms mallet strike impulse followed by 5 modal partials ($1.0 \times f_0$, $1.002 \times f_0$ beating pair, $2.01 \times f_0$ octave overtone, $2.76 \times f_0$
  bronze shimmer, $3.82 \times f_0$ crystal sparkle) with stereo spatial dispersion.
- **Dynamic Carrier Ducking**: Automatically attenuates background noise and carrier drones by 22% during chime strikes for non-clashing acoustic presence.
- **Sacred Phase Tuning**: Interval chimes automatically tune to sacred harmonic frequencies based on the active respiration phase (Inhale: 528 Hz, Hold-In: 594 Hz, Exhale: 432 Hz, Hold-Out: 396 Hz).
- **Toggleable Chimes**: Off by default; toggleable via master button or hotkey `B`.

#### 3. 11 GPU-Accelerated WebGL Visualizer Engines

- **01 // Chladni Plate Resonator**: 10,000 GPU particles migrating toward nodal curves based on the Ernst Chladni nodal plate equation.
- **02 // Fluid Cymatics**: 512×512 vertex-displaced surface gravity standing Faraday waves.
- **03 // Quantum Nodal Field**: Volumetric 3D density matrix mapping harmonic wavefunctions.
- **04 // Lissajous Orbit**: Orthogonal harmonic phase-portrait curve knot projection.
- **05 // 3D Waterfall**: Continuous cascading FFT frequency spectrum terrain.
- **06 // Winamp Oscilloscope**: Multi-trace dual-channel oscilloscope tracking time-domain waveform, upper harmonic ribbons, and sub-bass resonance.
- **07 // Torus Vortex**: Magnetic plasma confinement streamlines with live FFT audio-reactive expansion.
- **08 // Voxel Matrix**: 3D cubic lattice grid with audio-reactive displacement.
- **09 // Warp Tunnel**: 16-rib perspective corridor with individual neon rib colors and gradient-interpolated bridging rings.
- **10 // Neon Wire Tunnel**: Longitudinal cyber conduits with dynamic depth attenuation and bass-reactive lattice opacity.
- **11 // Ethereal Mist**: 36 short, spiraling smoke wisps spawning throughout the canvas volume with multi-octave 3D vortex curl noise, soft Gaussian blurry puff sprites, live beat pulsing, and dynamic contrast
  adaptation.

#### 4. 6 Harmonic Chromatic Palettes

- `stark`: High-contrast industrial neon (Stark Neon Crimson `#FF1433`, Electric Cyan `#00E5FF`, Hot Magenta `#FF0D86`).
- `pastel`: Gentle therapeutic luminescence (Rose Coral `#F561B8`, Sky Blue `#62C0F7`, Mint Green `#72E1B8`, Gold `#FFDC73`).
- `amber_crt`: Vintage 589nm laboratory amber phosphor (`#FFB000`).
- `green_crt`: Classic P1 oscillographic green phosphor (`#33FF33`).
- `cyber_blue`: High-energy electric cyberspace cyan-blue (`#00F0FF`).
- `monochrome`: Brutalist minimalist high-contrast `#FFFFFF` / `#000000` with crimson indicators.

#### 5. Autonomic Breath Cadence Controller & Timebox Engine

- **Paced Respiration Modes**:
  - `BOX`: Box Breathing (4s Inhale, 4s Hold, 4s Exhale, 4s Hold) — resets cortisol and hones laser focus.
  - `478`: 4-7-8 Relax (4s Inhale, 7s Hold, 8s Exhale) — activates parasympathetic vagal toning.
  - `COHERENT`: Coherent Breathing (5s Inhale, 5s Exhale) — balances cardiac-respiratory resonance.
- **Direct Master Sync Switch**: Dedicated LED toggle switch to immediately engage or disengage breath synchronization without dropdown traversal.
- **Dedicated Timebox Row**: Full-width duration selection for `10 MIN`, `20 MIN`, `60 MIN`, or continuous `∞ CONT` flow.

#### 6. Desktop-First Architecture

- **Custom Industrial Titlebar**: Integrated `/logo.svg` emblem, preset badge, live audio input toggles, Hotkeys overlay button, info modal, minimize to tray (`—`), and exit (`✕`).
- **System Tray Minimization**: Seamlessly minimizes to the OS system tray; clicking the tray icon unhides and focuses the window.
- **Fullscreen Theater Mode**: Distraction-free chromeless projection mode with a locked-dimension HUD toolbar and ESC escape key.
- **Interactive 3D Camera**: Left-click drag to rotate perspective, wheel to zoom, double-click or hotkey `R` to instantly reset to canonical front view.

---

### ⌨️ Global Keyboard Hotkeys

| Key                 | Action                              | Key   | Action                                                   |
| :------------------ | :---------------------------------- | :---- | :------------------------------------------------------- |
| `Space`             | Toggle Audio Engine Play / Pause    | `T`   | Toggle Fullscreen Theater Mode                           |
| `1` – `9`, `0`, `E` | Direct Visualizer Engine Select     | `C`   | Cycle Color Palette (6 Palettes)                         |
| `[` / `]`           | Cycle Prev / Next Visualizer Engine | `S`   | Cycle Random Engine Mode (`OFF` / `15S` / `30S` / `60S`) |
| `M`                 | Open Visualizer Engine Matrix       | `D`   | Cycle Detail Density (`LOW` / `MED` / `HIGH`)            |
| `R`                 | Reset 3D Perspective & Zoom         | `Z`   | Maximize / Restore Canvas Viewport                       |
| `B`                 | Toggle Tibetan Singing Bowl Chimes  | `I`   | Toggle Audio Input (Synth / Mic FFT)                     |
| `?` or `H`          | Open Command Matrix Hotkeys Help    | `Esc` | Exit Theater Mode / Close Modals                         |

---

### 📦 Installation Packages

- **macOS (Universal Binary)**: `Anahat_universal.dmg` (supports both Apple Silicon M1/M2/M3/M4 and Intel x86_64, macOS 10.15+)
- **Windows (64-bit)**: `Anahat_x64-setup.exe` & `Anahat_x64_en-US.msi` (Windows 10, 11)
- **Linux (x86_64)**: `Anahat_amd64.AppImage` & `anahat_amd64.deb`
