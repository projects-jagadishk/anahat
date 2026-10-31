# ANAHAT // BUILD PLAN & TECHNICAL ROADMAP

## Current Implementation Status: COMPLETE

### 1. Color Palettes Expansion
- **6 Full Harmonic Palettes Supported:**
  - `pastel`: Soft aesthetic tones (Rose Coral `#F561B8`, Sky Blue `#62C0F7`, Mint Green `#72E1B8`, Gold `#FFDC73`).
  - `stark`: High-contrast neon hues (Stark Neon Crimson `#FF1433`, Electric Cyan `#00E5FF`, Hot Magenta `#FF0D86`).
  - `monochrome`: Brutalist minimalist `#EEEEEE` with red accents.
  - `amber_crt`: Vintage 589nm laboratory amber phosphor (`#FFB000`).
  - `green_crt`: Classic P1 oscillographic green phosphor (`#33FF33`).
  - `cyber_blue`: Electric cyberspace cyan-blue (`#00F0FF`).
- Full GLSL shader branch support across `particles`, `fluid`, `waterfall`, `fractal`, and Three.js static line/mesh elements.
- UI Swatches, label cyclers, and hotkey `C` cycle through all 6 palettes smoothly.

### 2. Loading Splash Screen with Silent Boot
- **Chromeless Fullscreen Overlay (`#splash-screen`)**:
  - Displays `/logo.svg` emblem with glowing neon red backdrop.
  - Title: `ANAHAT // CYMATICS LAB`.
  - Subtitle: `Real-Time Acoustic Resonance, Cymatic Waveforms & Mathematical Harmonics Synthesizer`.
  - Progress bar tracking stages:
    - `0ms`: `12%` (`DSP KERNEL: ALLOCATING BUFFERS...`)
    - `300ms`: `35%` (`CALIBRATING HARMONICS // N, M MODES`)
    - `750ms`: `72%` (`INITIALIZING WEBGL 3D CYMATICS ENGINE`)
    - `1200ms`: `100%` (`READY // ENGAGING NEUROACOUSTIC DSP`)
  - Credits text: `made with 🫨 ☕ ❤️ 🤖 by Jagadish, Kasi.`
  - Smooth fade-out at ~1600ms.
- **Audio Silence Guarantee**:
  - Rust backend (`src-tauri/src/audio.rs`) initializes `is_playing` as `AtomicBool::new(false)`.
  - Frontend `AudioEngine` initializes `isPlaying = false`.
  - Audio playback only starts after the splash screen finishes loading (`audioEngine.play()`), ensuring zero sound is emitted during boot.

### 3. Fractal Visualizer Engine (`fractal`: FRACTAL FLUX)
- Replaced `galactic_waves` with procedural 3D recursive fractal engine `FRACTAL FLUX` (`[11] KEY:-`).
- Implements real-time Julia and Mandelbrot chaos dynamics on a 140×140 plane geometry.
- GLSL vertex shader calculates dynamic topological relief heights based on Julia iteration escape velocity.
- GLSL fragment shader generates smooth cosine-gradient coloring modulated by live audio amplitude, frequency spectrum bands, and harmonic modal parameters $n$ and $m$.
- Integrated into Engine Navigator, Engine Matrix modal, and Fullscreen Theater mode HUD.

### 4. Random Engine Auto-Cycle Mode
- Stepped interval switcher: `OFF` -> `15S` -> `30S` -> `60S` -> `OFF`.
- Available in Toolbar Row 1 (`[ ⚄ RND: OFF ]`) and Theater Overlay HUD (`theater-btn-random`).
- Shortcut Key: `S` toggles random mode cycling.
- Automatically selects a new visualizer engine at each interval tick without disrupting audio or camera orientation.

### 5. Camera Stabilization & Hotkeys Overlay
- **Removed Orbital Camera Drift Effect**:
  - Eliminated continuous turntable auto-drift from the render loop. Visualizations now remain completely static, stable, and focused on symmetry and cymatic resonance.
  - Removed `btn-cam-speed-cycle` from visualizer toolbar and theater overlay HUD, decluttering the toolbar.
  - Preserved static angle presets (Front 0°, Isometric 35°, Top-Down 80° via `[V]`) and added instant reset to front view via `[R]` or double-click.
- **Dedicated Keyboard Shortcuts Command Matrix Overlay (`#modal-hotkeys`)**:
  - Added `[ ⌨ HOTKEYS ]` button directly in the TitleBar next to `[ INFO ]`.
  - Global hotkeys `?` and `H` launch the dedicated 3-column brutalist command matrix overlay.
  - Also added Section 03 `[ OPERATIONAL KEYBOARD SHORTCUTS MATRIX ]` inside the System Info modal (`#modal-info`).
