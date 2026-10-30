# Product Requirements Document (PRD): Anahat

**Document Version:** 2.3 (Presets Integration & Brutalist UI Overhaul)
**Project Status:** Discovery / Active Planning
**Team Allocation:** 1 Product Manager, 3 Software Engineers (Systems/Rust, WebGL/Math, UX/UI)

---

## 1. Executive Summary & Vision

**Anahat** (Sanskrit: _The unstruck sound_) is a lightweight, background-first desktop application designed to reduce cognitive load, mask environmental distractions, and induce specific neurological states through mathematically generated acoustics and real-time visual resonance.

By bridging algorithmic, scientifically backed acoustic therapy (e.g., 40Hz Gamma stimulation, 528Hz tuning) with interactive, physics-based visualizers (Chladni plates, Lissajous curves), Anahat serves as an invisible ambient tool for focus and a striking, full-screen visual installation for wellness environments.

## 2. Target Audience & Use Cases

1.  **The Deep-Work Knowledge Worker:** Needs an unobtrusive, background app (system tray) that generates non-looping Brown noise and mild Beta/Gamma frequencies to maintain focus and mask office/household transients.
2.  **The Clinical / Wellness Practitioner:** Uses the application on a secondary monitor or overhead projector. Needs a chromeless, distraction-free "Theater Mode" to display fluid cymatics or Chladni resonance while guiding patients through relaxation or meditation.
3.  **The Audiophile & Math Enthusiast:** Appreciates the transparent, generative nature of the audio (synthesis over MP3s) and the exact visual mapping of mathematical formulas to the Web Audio API.

---

## 3. Functional Requirements

### 3.1. Algorithmic Audio Engine (Rust / Native)

- **Real-Time Synthesis:** The application MUST NOT use pre-recorded audio files. All sound must be synthesized in real-time using Rust DSP libraries (`fundsp`, `rodio`).
- **Binaural & Isochronic Generation:** Ability to generate a carrier frequency (e.g., 200Hz) and modulate an offset frequency (e.g., 4Hz for Theta) independently to the left and right audio channels.
- **Stochastic Noise Modulators:** Generators for Pink, Brown, and White noise, including adjustable low-pass filters to roll off harsh high frequencies.
- **Session Recording:** The user must be able to click "Record", capturing the live-generated audio buffer directly to an uncompressed `.wav` or high-quality `.flac` file on their local disk via native OS file dialogs.

### 3.2. Mathematical Visualization Engine (WebGL / Three.js)

- **Chladni Resonance (Da Vinci Method):** A 3D particle system of at least 10,000 points migrating towards the nodal lines of a vibrating plate.
- **Fluid Cymatics (Faraday Waves):** A fluid dynamics simulation representing surface tension and standing waves of water vibrating at specific frequencies.
- **Audio-Visual Sync:** Visuals must react to the active audio variables (frequency, amplitude) passed from the Rust backend via Tauri IPC at a target of 60 FPS.

---

## 3.5. WebGL & GLSL Technical Specifications

This section contains the explicit mathematical formulas and GPU architecture required for the WebGL visualization engine.

#### A. Global Uniforms Structure

The visualization engine must accept the following uniforms updated every frame via the `requestAnimationFrame` loop:

- `uniform float u_time;` // Elapsed time for fluid displacement and noise generation.
- `uniform float u_n;` // Harmonic variable 1 (e.g., 1 to 10).
- `uniform float u_m;` // Harmonic variable 2 (e.g., 1 to 10).
- `uniform float u_amplitude;` // Master audio amplitude mapped from [0, 1].
- `uniform sampler2D u_audio_data;` // 1D array of frequency data passed as a `DataTexture` from the Web Audio API analyzer.

#### B. Chladni Particle System (GPGPU / Ping-Pong FBO)

To achieve 60 FPS with 10,000+ particles, CPU calculations are strictly forbidden. The system must use a GPU Compute approach.

- **The Chladni Equation:** Let coordinates $x, y \in [-1, 1]$.
  $$Z = \sin(u\_n \cdot \pi \cdot x) \cdot \sin(u\_m \cdot \pi \cdot y) \pm \sin(u\_m \cdot \pi \cdot x) \cdot \sin(u\_n \cdot \pi \cdot y)$$
- **Physics Logic (Position Shader):**
  - Velocity update: `velocity -= gradient * speed_factor * u_amplitude;`
  - Add Simplex Noise (Brownian motion) to the velocity: `velocity += snoise(position.xy * noise_scale + u_time) * wander_strength;`
  - Position update: `position += velocity;`
- **Rendering (Fragment Shader):** Particles should be rendered as stark, hard-edged squares or dots tinted exclusively in the `Accent-Industrial` red (`#FF3333`) against the white/grid background, adhering to the Brutalist aesthetic.

#### C. Faraday Waves (Fluid Cymatics Shader)

Instead of particles, this mode uses a continuous mesh (`THREE.PlaneGeometry` with at least 512x512 segments) displaced purely via a Vertex Shader.

- **Vertex Displacement Math:**
  - Base standing wave: `float wave = sin(length(uv - 0.5) * u_n * 10.0 - u_time * speed);`
  - Interference pattern: Add a secondary directional wave: `float interference = cos(uv.x * u_m * 15.0) * sin(uv.y * u_n * 15.0);`
  - Audio reactivity: Modulate height `Z` by `u_amplitude` to create sharp ripples during transient beats.

---

## 4. Acoustic Presets Database & Scientific Provenance

**Context:** Anahat ships with a local, hardcoded database of 30 scientifically researched and culturally significant neuroacoustic tones. This data drives the UI (Provenance Spec Card), the Web Audio API (Target Hz), and the Three.js WebGL canvas (Chladni `n` and `m` variables).

### 4.1 JSON Schema Architecture

The database is structured as a strictly typed JSON array. Every preset must adhere to this schema to ensure the Brutalist UI components render uniformly without breaking the rigid layouts.

```json
{
  "id": "PRE-001",
  "name": "Anahata Chakra (Heart)",
  "cultural_era": "Vedic",
  "target_hz": 136.1,
  "harmonic_n": 3,
  "harmonic_m": 4,
  "therapeutic_use_case": "Stress Reduction & Parasympathetic Activation",
  "neurological_target": "Vagus Nerve Stimulation",
  "clinical_evidence_rating": "High",
  "description": "Rooted in ancient Vedic traditions. Clinically observed to lower resting heart rate."
}
```

### 4.2 The 30 Presets: Categorical Breakdown

**Category 1: Vedic & Ancient Indian (8 Presets)**

- **Key Entries:** Anahata (136.1 Hz), Muladhara (194.18 Hz), Sahasrara (172.06 Hz).
- **Visualizer Profile:** Symmetrical, highly stable Chladni states (e.g., `n=4, m=4`).

**Category 2: Solfeggio Frequencies / Medieval (9 Presets)**

- **Key Entries:** UT (396 Hz), MI (528 Hz), SOL (741 Hz).
- **Visualizer Profile:** Utilizes asymmetrical fluid dynamics to represent phase-shifting.

**Category 3: Pythagorean & Ancient Greek (6 Presets)**

- **Key Entries:** Perfect Fifth (256/384 Hz), Pythagorean A (432 Hz).
- **Visualizer Profile:** Strict, rigid particle nodes. Exact integer math for variables (`n=2, m=3`).

**Category 4: Modern Clinical & Binaural Targets (7 Presets)**

- **Key Entries:** Delta Sleep (1-4 Hz offsets), Theta (4-8 Hz), Gamma Cognition (40 Hz).
- **Visualizer Profile:** Low-frequency presets map to highly active, chaotic particle states.

---

## 5. User Interface & Experience (UX/UI)

### 5.1. Aesthetic Constraints (Utilitarian Brutalism)

The interface must feel like raw industrial laboratory equipment or an architectural blueprint.

- **Color Palette:** Strictly High Contrast/Monochrome.
  - Background: `#E5E5E5` (Concrete Gray).
  - Surfaces: `#FFFFFF` (White) and `#000000` (Black).
  - Accent: `#FF3333` (Industrial Red for active states and WebGL particles).
- **Typography:**
  - Headings/Display: _Space Grotesk_ (Bold, Uppercase).
  - UI/Body/Math/Data: _IBM Plex Mono_ (or Space Mono).
- **Geometry:** 0px corner radius on absolutely everything. Thick, harsh borders (2px or 4px solid black). Hard offset drop shadows (X:6, Y:6, Blur:0).
- **Prohibited:** No glassmorphism, no rounded corners, no gradients, no soft drop shadows.

### 5.2. Core View States

1.  **The Main Deck:** The default 1280x800 desktop window featuring a rigid, structural grid layout segmented by thick black lines. Includes the custom frameless Tauri title bar (`data-tauri-drag-region`).
2.  **Theater Mode (Projection):** A pure black (`#000000`), chromeless, full-screen projection. All UI controls are stripped away, leaving only the `Accent-Industrial` red visualization.
3.  **Tray Mini-Player:** A small (e.g., 320x400) pop-out window from the OS tray, designed like a harsh vertical list/terminal for quick actions.

---

## 6. Non-Functional Requirements (NFRs)

- **Performance (Backgrounded):** When the main window is closed/hidden to the tray, the WebGL render loop MUST pause entirely. CPU usage for audio generation must remain under **2%** on an Apple Silicon or modern Intel processor.
- **Performance (Foregrounded):** The Three.js canvas must maintain **60 FPS** while rendering 10,000+ particles on integrated graphics.
- **Memory Footprint:** Total application RAM usage must not exceed **150MB** in the background state (a primary reason for choosing Tauri/Rust over Electron).
- **Privacy / Local-First:** The app requires **zero internet connectivity** to function (aside from clicking external DOI links in the browser).

---

## 7. User Stories & Acceptance Criteria

### Epic 1: Audio Generation & Control

**1.1 Blending Audio Environments**

- **User Story:** As a knowledge worker, I want to blend a specific binaural beat with brown noise so that I can mask my noisy office.
- **Acceptance Criteria:**
  - The UI provides independent brutalist volume sliders for the Harmonic Generator and Noise channels.
  - The Rust backend efficiently mixes both signals in real-time.

**1.2 Local Session Recording**

- **User Story:** As a practitioner, I want to record the live-generated acoustic session.
- **Acceptance Criteria:**
  - A chunky `[ REC ]` button is available.
  - Clicking record inverts the button to industrial red, adds a 4px red border to the canvas, and opens a native OS save dialog for a `.wav` file.

### Epic 2: Interactive Mathematical Visualization

**2.1 Real-Time Harmonic Mapping**

- **User Story:** As a math enthusiast, I want to see a precise visual representation of the active frequencies.
- **Acceptance Criteria:**
  - Adjusting the frequency sliders instantly updates the $n$ and $m$ variables in the WebGL Chladni shader.
  - Particles smoothly interpolate to nodal positions based on GPU-calculated velocity vectors.

### Epic 3: Scientific Provenance & Education

**3.1 Preset Discovery & Verification**

- **User Story:** As a skeptical user, I want to see the scientific backing for the frequency I am listening to.
- **Acceptance Criteria:**
  - When selecting a preset, a dedicated right-hand UI card (designed like a printed spec sheet) populates with the JSON data.

### Epic 4: Desktop Native Integration (Tauri)

**4.1 Background Unobtrusiveness**

- **User Story:** As a user aiming for deep focus, I want the application to run invisibly in the background.
- **Acceptance Criteria:**
  - Clicking "Close" hides the UI but does not kill the Rust backend.
  - Audio continues playing uninterrupted from the OS Tray.
  - Closing the window triggers an IPC event that pauses the WebGL loop.

---

## 8. Phased Release Plan

- **Phase 1 (MVP - "The Core"):** Tauri backend audio synthesis, basic Astro UI shell with Brutalist grid layout, static Three.js particle placeholder, system tray functionality.
- **Phase 2 ("The Resonance"):** Implementation of the complex GPGPU Chladni shaders and Faraday fluid math, IPC bridge syncing audio parameters to the visualizer, integration of the 30-preset `presets.json`.
- **Phase 3 ("The Environment"):** Fullscreen Theater Mode, Audio Output routing (hardware selection), Local Session Recording (WAV export).
- **Phase 4 ("The Installation" - V2):** Integration of external hardware (BLE Wearables, DMX lighting).

---

## 9. Future Scope & Roadmap (V2+)

### 9.1. Closed-Loop Biofeedback (Hardware Integration)

- **BLE Sync:** Connect to wearables like the Oura Ring or Apple Watch.
- **Dynamic Shifting:** If HRV drops (indicating stress), Anahat automatically crossfades the audio engine to a Delta beat, while visually softening the Chladni particles.

### 9.2. Active Environmental Masking

- **Microphone FFT Analysis:** Analyze the frequency spectrum of the user's actual room.
- **Phase Inversion:** Generate frequencies tailored to mask exact acoustic transients, creating localized "Active Noise Canceling."

### 9.3. Advanced Creator Export Pipeline

- **WebCodecs MP4 Export:** Capture the Three.js canvas frame-by-frame and mux it with the Rust audio buffer to export perfectly synced MP4/WebM videos.

### 9.4. Professional Installation Capabilities

- **Syphon / Spout Integration:** Route Anahat's visuals directly into mapping software like Resolume or MadMapper.
- **DMX Smart Lighting Sync:** Map frequency amplitude to DMX lighting protocols, allowing physical room lights to throb in resonance with the visualizer.
