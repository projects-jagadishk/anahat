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
  - Reset View Button (`#theater-btn-reset-view`): `76px`
- Imposed `flex-shrink: 0`, `white-space: nowrap !important;` and fixed `gap: 6px`.
- Prevents buttons from reflowing, shifting left/right, or jittering as titles or cycle states change in Fullscreen Theater Mode.

### 7. Warp Tunnel Chromatic Perspective Upgrade
- **Radiating Perspective Lines (16 Longitudinal Ribs)**:
  - Each of the 16 radiating perspective lines is assigned a distinct hue mapped around the active harmonic palette (`stark`, `pastel`, `amber_crt`, `green_crt`, `cyber_blue`, `monochrome`).
  - Both segment endpoints along rib `i` share that rib's specific color, attenuated with depth distance along the corridor.
- **Horizontal Bridging Rings (Transverse Undulation Loops)**:
  - Each polygonal ring vertex `i` is set to radiating line `i`'s corresponding color.
  - Enabled hardware `vertexColors: true` on `THREE.LineLoop`.
  - Every bridging line segment connecting rib `i` to rib `(i + 1) % 16` hardware-interpolates (gradient transitions) smoothly between the two connecting colors.
  - Full synchronization with palette changes in `updateStaticMaterialsForPalette()`.

### 8. Interactive 3D Perspective Reset Controls
- **Toolbar Reset Button**: Added `[ ⟲ RESET VIEW ]` to Visualizer Toolbar Row 2 (`#btn-reset-perspective`, locked `96px`).
- **Theater Reset Button**: Added `[ ⟲ RESET ]` to Fullscreen Theater toolbar (`#theater-btn-reset-view`, locked `76px`).
- **Global Hotkey & Gesture**:
  - Hotkey `R` / `r`: Instantly resets camera elevation ($0^\circ$), azimuth ($0^\circ$), and distance ($2.4$) to default canonical front projection.
  - Canvas Double-Click: Double-clicking either the main deck canvas or fullscreen theater canvas resets perspective and zoom.
- **Documentation**: Documented `[ R ]` in both `#modal-hotkeys` and `#modal-info`.

### 9. Window Controls & System Tray Minimisation
- **Visible Window Controls**: Enabled brutalist TitleBar buttons across macOS and all platforms (`btn-minimize` and `btn-close`).
- **Minimise to Tray**: Clicking `—` invokes `app_minimize_to_tray` and hides the window into the system tray.
- **Restore from Tray**: Left-clicking or double-clicking the system tray icon or selecting "Show Anahat" immediately unminimizes, shows, and focuses the application window.
- **Close Action**: Clicking `✕` invokes `app_close` to cleanly exit the background process and audio threads.

### 10. Meditation Cadence Chimes & Audio Transitions
- **Tibetan Singing Bowl Physical Model**:
  - Synthesizes 40ms organic mallet strike impulse transient.
  - Generates 5 modal resonant partials ($1.0 \times f_0$, $1.002 \times f_0$ beating pair, $2.01 \times f_0$ octave overtone, $2.76 \times f_0$ bronze shimmer, $3.82 \times f_0$ crystal sparkle).
  - Stereo spatial panning dispersion across overtones.
  - Smooth carrier/noise ducking (22% dip for 1.8s) during chime strikes for clean, non-clashing acoustic presence.
  - Breath-phase sacred tuning: Inhale (528 Hz), Hold-In (594 Hz), Exhale (432 Hz), Hold-Out (396 Hz).
- **Chime Controls**:
  - Default State: **OFF by default** (`chimesEnabled = false`, button initialized to `🔕 CHIMES: OFF`).
  - Toggle Button: `[ 🔕 CHIMES: OFF ]` / `[ 🔔 CHIMES: ON ]` in the meditation row with hotkey `B`.

### 11. Visual Polish on Remaining 3D Engines
- **Neon Wire Tunnel**: Enabled `vertexColors: true` on longitudinal wire conduits with individual neon palette colors and depth attenuation. Added dynamic bass-reactive opacity pulsing to diagonal cyber lattice braces.
- **Torus Vortex**: Streamlines now feature dynamic harmonic palette color cycling, live FFT audio-reactive plasma expansion, and secondary palette glow on the magnetic wireframe cage.
- **Polar Radar**: Radial spectrum teeth, peak-hold markers, and rotating sonar sweep beam now fully synchronize with the active color palette.

### 12. Breath Sync Widget & Timebox Control Layout
- **Dedicated Timebox Row**:
  - Timebox duration toggles moved from cramped subrow to a dedicated, full-width row (`.deck__timebox-row`).
  - Buttons (`[ 10 MIN ]`, `[ 20 MIN ]`, `[ 60 MIN ]`, `[ ∞ CONT ]`) occupy equal flex space with enhanced 26px height and clear brutalist typography.
- **Master Breath Sync Toggle Switch**:
  - Added `#btn-cadence-toggle` (`.cadence-toggle-switch`) directly to the widget.
  - Features an active LED indicator dot (`.toggle-switch-indicator`) and explicit status label (`SYNC: OFF` / `SYNC: ON`).
  - Toggling directly disables/enables breath synchronization without requiring interaction with the dropdown menu.
  - Automatically remembers the previous active cadence pattern (e.g. `box`, `478`, `coherent`) upon re-enabling.
  - Two-way synchronized with `#select-cadence` dropdown and `#med-cadence-badge`.
- **Tibetan Singing Bowl Chime Relocation**:
  - Moved alongside `#btn-cadence-toggle` into the dual-toggle row (`.deck__med-toggles-row`).

### 13. Ethereal Mist Visualizer & Dual-Mode Contrast Overhaul
- **Curled Volumetric Smoke Tendrils**:
  - Replaced sharp 1px aliased lines with 16 volumetric curled streamers composed of overlapping circular Gaussian puff point sprites (`THREE.Points`).
  - Integrated procedural radial Gaussian alpha texture for soft, blurry, organic smoke borders without hard edges.
  - Added multi-octave 3D vortex curl noise (frequencies 3.2 and 5.2) with spiral plume rotation for natural swirling, coiling, and twisting motions.
- **Slow Motion & Live Beat Pulsing**:
  - Reduced upward convection velocity by >60% and slowed curl phase progression for a calm, ethereal drift.
  - Audio beat reactivity: smoke streamer expansion and puff sprite radii pulse dynamically with low-frequency audio energy `(1.0 + bass * 0.95)`.
- **Main Deck & Theater Mode Dual Visibility**:
  - Fixed visibility bug where `THREE.AdditiveBlending` washed out on the white main deck background (`#FFFFFF`).
  - Converted materials to `THREE.NormalBlending` with `depthWrite: false`.
  - Added background-adaptive color synthesis based on `this.isDark`:
    - **Main Deck (Paper-White)**: Rich, velvety, deep-pigment smoke plumes (deep navy, indigo-violet, teal-slate).
    - **Theater Mode (Onyx-Black)**: Luminous, glowing neon vapor (celestial cyan, ethereal violet).

### 12. Breath Sync Information & Subtle Orangish Canvas Pulse
- **Breath Sync Info Icon**:
  - Added brutalist circular info badge `ⓘ` next to the `BREATH_SYNC` label (`#btn-breath-sync-info`).
  - Displays comprehensive explanation tooltip on hover or immediate click:
    *"BREATH SYNCHRONIZATION: Guides visual respiration rhythm to modulate Autonomic Nervous System tone and Heart Rate Variability (HRV). Box Breathing (4-4-4-4) resets cortisol and builds focus; 4-7-8 Breathing activates parasympathetic vagal toning to reduce anxiety; Coherent Breathing (5s-5s) balances cardiac-respiratory resonance."*
- **Canvas Pulse Gated to Active Breath Sync**:
  - Border pulsing animation (`.deck__canvas-wrap--pulse`) now triggers **strictly when breath sync is active** (`activeCadence !== "off"`), never when breath sync is turned off.
- **Toast Removal**:
  - Removed top toast banner (`#burst-banner`) activation from cadence transitions and chime bursts.
- **Subtle Orangish Hue**:
  - Restyled `.deck__canvas-wrap--pulse` from heavy red to a subtle, warm amber/orange aura (`border-color: rgba(255, 140, 0, 0.65)`, inset 1px spread, and soft 14px outer glow `rgba(255, 130, 0, 0.22)`).
  - Added smooth CSS transitions on `.deck__canvas-wrap` (`transition: border-color 0.2s ease, box-shadow 0.25s ease;`) for a gentle decay.

### 13. Subtle Breath-Decay Aura, Prominent Breath Deck & Ethereal Mist Visualizer
- **Subtle Breath-Decay Animation**:
  - Replaced snappy border pulse with a natural respiratory keyframe decay curve (`@keyframes breath-decay-glow 2.8s cubic-bezier(0.16, 1, 0.3, 1)`).
  - Extremely subtle peak intensity (0.10 inset, 0.14 outer glow `rgba(245, 140, 20, ...)`) that gently blooms over 400ms and softly exhales/decays back to zero over 2.4s.
  - Active strictly when breath sync is active (`activeCadence !== "off"`).
- **Breath Sync Off by Default**:
  - Initialized `activeCadence = "off"` and dropdown to `BREATH_SYNC // [ OFF ]`.
  - HUD and cards display `OFF` state until user explicitly chooses a cadence pattern.
- **Prominent Right Column Breath Synchronizer**:
  - Moved Breath Synchronization section from the center column into a prominent top card in the right column (`#meditation-card`).
  - Features dark header with `[OFF]` / active cadence badge, `ⓘ` info button, pattern dropdown, chime toggle, timebox selector, and prominent `[ START SESSION ⏵ ]` action button.
- **Compact Provenance Widget**:
  - Reduced height of `#deck__prov-card` to `flex: 1 1 0; min-height: 0;` with compact spec rows, scrollable abstract, and tight action buttons, fitting cleanly below the breath synchronizer without page overflow.
- **Ethereal Mist Visualizer (`ENG_11` / Hotkey `E`)**:
  - 18 flowing sinuous smoke tendril streamers with decaying 3D positions and alpha-fade ribbons.
  - Harmonic 3D curl velocity fields with upward thermal convection and Chladni modal influence.
  - 2,500 sparkling micro-particles with audio-reactive shimmer.
  - 300 volumetric soft gaussian smoke cloud puffs.
  - Seamless scaling with respiratory breath cycle (`this.currentBreathScale`) and all 6 harmonic palettes.
