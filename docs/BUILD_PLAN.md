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
- Full GLSL shader branch support across `particles`, `fluid`, `waterfall`, and Three.js static line/mesh elements.
- UI Swatches, label cyclers, and hotkey `C` cycle through all 6 palettes smoothly.

### 2. Loading Splash Screen with Silent Boot (15-Second Precision Stage)
- **Chromeless Fullscreen Overlay (`#splash-screen`)**:
  - Displays `/logo.svg` emblem with glowing neon red backdrop.
  - Title: `ANAHAT // CYMATICS LAB`.
  - Subtitle: `Real-Time Acoustic Resonance, Cymatic Waveforms & Mathematical Harmonics Synthesizer`.
  - Multi-stage 15-second calibration sequence:
    - `0ms`: `[01/06] ALLOCATING 48 KHZ 32-BIT DSP CIRCULAR BUFFERS...` (15%)
    - `3800ms`: `[02/06] CALIBRATING STEREO OSCILLATOR HARMONIC SINK...` (32%)
    - `6800ms`: `[03/06] MAPPING SACRED SOLFEGGIO & CHLADNI HARMONICS...` (50%)
    - `9800ms`: `[04/06] COMPILING HIGH-PRECISION WEBGL CYMATIC SHADERS...` (70%)
    - `12400ms`: `[05/06] CALIBRATING BINAURAL STEREO PHASE SEPARATION...` (88%)
    - `14200ms`: `[06/06] SYSTEM SYNCHRONIZED // ENGAGING ACOUSTIC CANVAS` (100%)
  - Credits text: `made with 🫨 ☕ ❤️ 🤖 by Jagadish, Kasi.`
  - Includes optional `[ SKIP INTRO ⏭ ]` button and Space/Enter key bypass.
  - Unmutes audio only after splash sequence completes or is skipped.

### 3. Random Engine Auto-Cycle Mode
- Stepped interval switcher: `OFF` -> `15S` -> `30S` -> `60S` -> `OFF`.
- Available in Toolbar Row 1 (`[ ⚄ RND: OFF ]`) and Theater Overlay HUD (`theater-btn-random`).
- Shortcut Key: `S` toggles random mode cycling.
- Automatically selects a new visualizer engine at each interval tick without disrupting audio or camera orientation.

### 4. Title Bar Left Side Branding & Hotkey Overlays
- Replaced the unused 78px empty spacer on the left of the title bar with a branded identity container displaying the `/logo.svg` emblem alongside the title text.
- Added `[ ⌨ HOTKEYS ]` button directly in the TitleBar next to `[ INFO ]`.
- Global hotkeys `?` and `H` launch the dedicated 3-column brutalist command matrix overlay.
- Removed Fractal Flux visualizer mode cleanly from UI matrix, hotkey numbering, and WebGL shader passes.

### 5. Removal of Thickness & View Controls
- Removed `Thickness` cycle button (`btn-thick-cycle`, `theater-btn-thick`) from Visualizer Toolbar Row 2 and Fullscreen Theater Mode toolbar.
- Removed `View` angle cycle button (`btn-cam-angle-cycle`, `theater-btn-cam-angle`) from Visualizer Toolbar Row 2 and Fullscreen Theater Mode toolbar.
- Removed hotkey bindings `[ K ]`, `[ V ]`, and `[ R ]` from `#modal-hotkeys` command matrix, `#modal-info`, and keydown event handlers.
- Retained clean default geometry line weights and canonical front-facing camera projection.

### 6. Fullscreen Theater Toolbar Stabilization (Zero Button Shift)
- Locked strict invariant pixel dimensions across every button in `#theater-toolbar`:
  - Navigation Arrows: `26px`
  - Engine Selector Button: `184px` with CSS text-overflow truncation
  - Random Cycle Button (`#theater-btn-random`): `94px`
  - Palette Cycle Button (`#theater-btn-palette`): `90px`
  - Detail Density Button (`#theater-btn-detail`): `76px`
- Imposed `flex-shrink: 0`, `white-space: nowrap !important;` and fixed `gap: 6px`.
- Prevents buttons from reflowing, shifting left/right, or jittering as titles or cycle states change in Fullscreen Theater Mode.
