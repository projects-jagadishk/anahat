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
  - [x] **Left Column (300px)**: Dark header `ANAHAT V1.0 // PRESETS`, category headers (`--- [ VEDIC ] ---`, `--- [ SOLFEGGIO ] ---`, `--- [ PYTHAGOREAN ] ---`, `--- [ CLINICAL ] ---`, `--- [ CLASSICAL PHYSICS ] ---`).
  - [x] **Preset Item Molecule (Figma atomic design)**: Formatted `[PRE-001]` codes, clean titles, right-aligned Hz, default `#FFFFFF` / hover `#000000` / active playing `#FF3333` with terminal blink cursor `█`.
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
- [x] **Architecture Interface & Bridge** (`src/components/logic/AudioEngine.ts`):
  - [x] `AudioPresetParams` contract (carrier Hz, offset Hz, amplitude, waveform, noise type, blend ratio).
  - [x] Web Audio `AnalyserNode` real-time FFT spectrum export for 60 FPS WebGL visualizer coupling.
  - [x] Native Tauri IPC sync bridge calling `audio_set_params`, `audio_play`, `audio_pause`.
- [x] **Native Real-Time Synthesis (Rust DSP / `rodio 0.23`)** (`src-tauri/src/audio.rs`):
  - [x] Continuous stereo `NeuroacousticSource` running at 48,000 Hz.
  - [x] Independent L/R phase oscillators for binaural carrier/offset entrainment (`carrier ± offset/2`).
  - [x] Harmonic $n$ and $m$ overtone modulation synthesis modifying physical timbre in real-time.
  - [x] Interactive stochastic noise mixing (BROWN, PINK, WHITE, MUTE) with live blend ratio control (0% to 100%).
  - [x] Continuous real-time playback on background audio thread that persists when window is hidden to system tray.
- [x] **Local Session Recording (.WAV Capture)**:
  - [x] Thread-safe interleaved stereo buffer accumulation during recording.
  - [x] Native OS Save File dialog via `@tauri-apps/plugin-dialog`.
  - [x] High-fidelity uncompressed 16-bit 48kHz stereo WAV encoder using `hound` crate.

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

---

### Step 5: V1.5 Meditation Update (Timebox, Breath Sync, GSAP Sprite Metronome & Screen 7 Takeover)
- [x] **Native Shell Check**:
  - [x] Verified frameless and transparent Tauri window management remains robust across Screen 7 transition.
  - [x] Dynamic canvas expansion from 600px to 900px without breaking window bounds or macOS drag regions.
- [x] **Base Layout Extension**:
  - [x] Injected Timebox Selector (`[ 10M ] | [ 20M ] | [ 60M ] | [ ∞ ]`) in IBM Plex Mono with active invert to `#FF3333`.
  - [x] Injected Cadence Dropdown (`BREATH_SYNC // [ BOX ]`, `[ 4-7-8 ]`, `[ COHERENT ]`, `[ OFF ]`).
  - [x] Strict height containment (308px locked height) ensuring noise sliders and harmonic controls never overflow.
- [x] **V1.5 Meditation UI Construction (Screen 7 Guided Session Takeover)**:
  - [x] Grid dynamically adapts to `300px 1fr 0px`, collapsing Provenance Card and expanding WebGL canvas.
  - [x] Massive Hollow Countdown Timer in Space Grotesk `Display/Massive` with 2.5px stroke outline.
  - [x] Live phase status readout (`PHASE: INHALE [ 4S ]`).
  - [x] Interactive session toggle button (`[ START SESSION ⏵ ]` / `[ END SESSION ⏹ ]`).
- [x] **Audio Engine Interval Chimes**:
  - [x] Crisp, unadulterated 880 Hz / 528 Hz pure sine burst with instant attack and exponential decay.
  - [x] Triggered on cadence phase transitions and session milestone completion.
  - [x] Coupled with momentary 120ms canvas flash in pure `Accent-Industrial` red (`#FF3333`).
- [x] **WebGL Breath Sync Engine**:
  - [x] Three.js uniform and physics mapping for Box, 4-7-8, and Coherent cadences.
  - [x] Radial expansion during Inhale ($1.0 \to 1.65$) with elevated wander motion.
  - [x] Violent collapse during Exhale ($1.65 \to 0.82$) with accelerated nodal gradient settling.
  - [x] Faraday fluid wave height and speed dynamically breathing in lockstep.
- [x] **GSAP Sprite Metronome (`<SpriteMetronome />`)**:
  - [x] 1-bit high-contrast 160×160px stark square with 4px black border and `COMPANION_ID: TABBY_01`.
  - [x] GSAP timeline cycling chest breathing, ear orientation, and tail taps matching the cadence seconds.
  - [x] Seamless docking to the top-left of the expanded WebGL canvas during Screen 7 Takeover.
  - [x] Dedicated 2D canvas pixel-art renderer (`#tabby-canvas`) for guaranteed 60FPS animation with zero SVG transform bugs.
  - [x] Canvas toolbar toggle `[X] COMPANION` to toggle companion visibility on/off anytime.
- [x] **Zero-Layout-Shift Overlaid Canvas HUD**:
  - [x] Moved countdown timer out of bottom control deck; overlaid directly on WebGL canvas (`#canvas-hud`).
  - [x] Giant hollow Space Grotesk countdown readout floating directly over the visualization with zero shifts.
- [x] **Mathematical Wave Burst (Replacing Flat Red Flash)**:
  - [x] Concentric propagating sine shockwave ripple through particles and fluid mesh outward from center.
  - [x] Dual-harmonic 528 Hz pure sine bell chime (fundamental + 1056 Hz crystal overtone).
  - [x] Canvas container subtle brutalist border pulse (`.deck__canvas-wrap--pulse`).
- [x] **Pastel Spectrum Waveform Gradients**:
  - [x] Iridescent pastel spectrum shader (Coral -> Rose -> Lavender -> Sky -> Mint -> Amber).
  - [x] Applied across particle nodal interference fields and Faraday fluid 3D standing wireframe waves.
- [x] **Viscous Chladni Particle Motion Smoothing**:
  - [x] Eliminated erratic white-noise micro-jittering and random seizing.
  - [x] Implemented viscous fluid inertia with 0.94 damping, normalized gradient pull vectors, and organic harmonic curl drift.
- [x] **Winamp-Style 3D Oscilloscope & Lissajous Visualizer (`oscillo` mode)**:
  - [x] Real-time time-domain PCM byte sampling from Web Audio API Analyser via `audioEngine.getWaveformData(buf)`.
  - [x] 4 multi-trace ribbons: Center time-domain waveform, upper harmonic ribbon, lower sub-bass ribbon, and 3D rotating Lissajous orbit loop.
  - [x] Reactive pastel gradient palette shader across all ribbons.
  - [x] Toolbar toggle `[ ] OSCILLO` wired in both main deck and theater mode.
- [x] **Unmissable Sine Wave Burst & Shockwave Ring**:
  - [x] Dynamic Three.js `THREE.RingGeometry` physical shockwave ring with particle radial displacement.
  - [x] Prominent brutalist top banner `[ ⚡ INTERVAL CHIME // 528 HZ SINE BURST ]` popping on session chime.
- [x] **Synchronized Theater Mode (Screen 2)**:
  - [x] Complete real-time audio and waveform sync with `theaterVisualizer.setAudioProvider` and `theaterVisualizer.setWaveProvider`.
  - [x] Chromeless full-screen mode toggles (`[ CHLADNI ] | [ FLUID ] | [ OSCILLO ]`).
  - [x] Live HUD readouts for preset code, frequency in Hz, and meditation cadence phase.
- [x] **System Specification & Clinical Disclaimers (Info Modal)**:
  - [x] Titlebar trigger `[ INFO // ? ]` available globally across the application.
  - [x] Modal detailing purpose, architectural rationale, and 8 core subsystems.
  - [x] Prominent brutalist clinical advisory covering Non-Medical Device status, Photosensitive Epilepsy warning, Hearing & Decibel Safety protocol, Motor Vehicle/Machinery restrictions, and Pre-existing condition guidance.
  - [x] 100% offline air-gapped privacy assurance.
- [x] **Complete 10-Mode Visualizer Engine Suite & High-Definition Geometry Overhaul**:
  - [x] **[01] Chladni Nodes** (Hotkey `1`): 2D acoustic standing wave sand physics with viscous fluid damping (0.94), smooth flow with zero seizing, and breath sync expansion/collapse.
  - [x] **[02] Faraday Fluid** (Hotkey `2`): 3D continuous standing parametric liquid surface wave mesh with standing waves and interference ripples.
  - [x] **[03] Winamp Oscilloscope** (Hotkey `3`): Saturated high-contrast ribbon spectrum (Crimson, Cobalt, Emerald, Gold) with luminance weighting + rotating 3D Lissajous orbit loop.
  - [x] **[04] Polar Radar** (Hotkey `4`): 360° circular FFT spectrum analyzer with 96 discrete radial frequency bar teeth, floating peak-hold needles, continuous rotating sonar radar sweep, and -18dB/-12dB/-6dB calibration range rings.
  - [x] **[05] 3D Waterfall** (Hotkey `5`): Continuous 60 FPS scrolling topographic terrain ridges using dedicated `ShaderMaterial` with multi-harmonic standing waves + FFT audio transient peaks.
  - [x] **[06] Torus Vortex** (Hotkey `6`): 16 continuous closed 3D helical Tokamak magnetic streamlines in alternating Crimson, Cobalt, and Charcoal + structural wireframe cage + central poloidal spindle.
  - [x] **[07] Voxel Matrix** (Hotkey `7`): 3D volumetric equalizer matrix with 256 instanced pillars (16×16 grid) and gravity-decaying peak caps in `#FF3333` industrial red.
  - [x] **[08] Harmonograph** (Hotkey `8`): Rotary 3-pendulum resonance trajectory with dual 1,400-point Lissajous ribbon traces and smooth pastel spectrum gradients.
  - [x] **[09] Warp Tunnel** (Hotkey `9`): Infinite 3D acoustic perspective corridor with 24 sequential polygonal rings connected by 16 spaceframe rib lines.
  - [x] **[10] Vector CRT** (Hotkey `0`): Vintage laboratory phosphor X-Y vectorscope with persistence trail decay and graticule calibration bezel.
- [x] **High-Efficiency Engine Switcher**:
  - [x] Canvas & Theater Navigator: `[◀] [01 // CHLADNI NODES [PHYSICS] ▾] [▶]`
  - [x] Brutalist Engine Matrix Modal with 10 interactive tiles, hotkey badges, and descriptions.
  - [x] Global Keyboard Hotkeys: Direct jump with keys `[1 - 9, 0]`, cycle with `[ [ / ] ]`, matrix toggle with `[M]`, theater toggle with `[T]`.
  - [x] Theater Mode Auto-Fade: Floating HUD bar auto-fades after 2.5s of mouse inactivity.

---

### Step 6: Live Audio Input & External Mic Ingest Mode
- [x] **Acoustic Ingest Pipeline (`AudioEngine.ts`)**:
  - [x] `AudioSourceMode = "internal_dsp" | "mic_ingest"`.
  - [x] `getUserMedia` raw capture with zero acoustic feedback (mic connects exclusively to `AnalyserNode`, never to `ctx.destination`).
  - [x] Automatic pause and mute of internal synthesis when mic is active to eliminate harmonic clashing.
  - [x] Stepped digital sensitivity gain (`0.5X` to `3.0X`).
  - [x] Live RMS decibel level calculation from byte time-domain data.
- [x] **Native macOS Entitlements (`src-tauri/Info.plist` & `tauri.conf.json`)**:
  - [x] Created `Info.plist` with `NSMicrophoneUsageDescription`.
  - [x] Wired `bundle.macOS.infoPlist` for seamless OS permission granting.
- [x] **Brutalist UI & Interaction Deck (`TitleBar.astro` & `src/pages/index.astro`)**:
  - [x] TitleBar quick toggle: `SRC: [ DSP ]` / `SRC: [ MIC ]` with red active state.
  - [x] Canvas Toolbar monitor pill: `SRC: MIC` with pulsing red dot, live 10-segment ASCII meter `[██████░░░░]`, and sensitivity stepper button `1.4X`.
  - [x] Synchronized `#modal-routing` hardware patch bay selector and Theater Mode HUD indicator.
  - [x] Global keyboard shortcut: key `[I]` toggles between Internal DSP and Microphone Ingest.
- [x] **Universal 10-Engine Visualizer Coupling**:
  - [x] All 10 visualizers immediately visualize external audio, voice, instruments, and Spotify in 60 FPS without modifying shaders.

---

### Step 7: Real Hardware Output Routing (DAC / Device Switcher)
- [x] **Native Rust Rodio/CPAL Device Enumeration & Dynamic Sink Hot-Swapping (`src-tauri/src/audio.rs` & `src-tauri/src/lib.rs`)**:
  - [x] Added `AudioDeviceInfo` struct with `serde::Serialize` / `serde::Deserialize`.
  - [x] Implemented `AudioController::list_output_devices()` enumerating all physical and virtual CoreAudio output devices via `cpal::traits::HostTrait` and `cpal::traits::DeviceTrait` with `.description()`.
  - [x] Implemented `AudioController::set_output_device(&self, device_name: &str)` allowing runtime migration of the continuous `NeuroacousticSource` to external USB DACs, audiophile headphones, multi-channel interfaces, and Bluetooth sinks with zero audio glitches.
  - [x] Added and registered Tauri IPC commands `audio_list_devices` and `audio_set_device`.
- [x] **Frontend Audio Device Controller (`src/components/logic/AudioEngine.ts`)**:
  - [x] Added `AudioOutputDevice` interface.
  - [x] Implemented `listOutputDevices(): Promise<AudioOutputDevice[]>` with native Tauri query and Web Audio `MediaDevices.enumerateDevices()` fallback.
  - [x] Implemented `setOutputDevice(deviceName: string)` switching both native Rust Rodio sink and Web Audio `setSinkId` (on supported engines) in unified lockstep.
  - [x] Added `onOutputDeviceChange` reactive event listener hook.
- [x] **Brutalist Hardware Patch Bay (`#modal-routing` & `TitleBar.astro`)**:
  - [x] Dynamic hardware patch bay list in `#modal-routing` populated with real system audio output devices.
  - [x] Interactive one-click output switching with immediate visual selection (`[X]` indicator) and active sink status readout.
  - [x] Titlebar hardware status pill dynamically reflecting the active DAC/output name (e.g. `OUT: [ DEFAULT SYSTEM.. ]`).
  - [x] Keyboard shortcuts: key `[O]` opens the Hardware Routing Matrix, and `Escape` closes any open modal.



