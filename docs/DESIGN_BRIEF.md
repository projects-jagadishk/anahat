# Figma Design System Architecture: Anahat

**Project:** Anahat (Neuroacoustic Sound Deck & Visualizer)
**Design Paradigm:** Utilitarian Brutalism / Industrial Laboratory
**Target Device:** Native Desktop Application (macOS & Windows via Tauri v2)
**Target Figma URL:** [Anahat Figma File](https://www.figma.com/design/tD1zntGslnFYJ8jI2y4k8V/Anahat)

## 1. Design Philosophy & Art Direction

Anahat is a neuroacoustic therapeutic tool rooted in mathematics and physics. The design must reflect this by abandoning all modern "soft" UI trends.

- **Structural Honesty:** The interface must feel like raw industrial lab equipment or an architectural blueprint.
- **High Contrast & Hierarchy:** Rely on stark contrast, exposed grid structures, thick strokes, and monospaced typography with aggressive scaling.
- **Tactility:** UI elements shouldn't feel like they "float"; they should feel stamped, bolted, or heavily offset with hard, unblurred shadows.
- **Prohibited Elements:** NO glassmorphism. NO blurs. NO rounded corners (0px global radius). NO soft drop shadows. NO gradients.

## 2. Figma File Architecture (Page Structure)

The Figma file must be organized strictly into the following pages to ensure a scalable Design System and seamless developer handoff:

1. `❖ Cover & Art Direction` (Moodboards, PRD links)
2. `⚙️ Foundations (Tokens)` (Local variables, text styles)
3. `🧩 Component Library` (Atomic design system)
4. `💻 Desktop Screens` (Tauri OS views)
5. `▶️ Prototypes & Motion` (Flows and interactions)
6. `🗑️ Archive`

## 3. Foundations (Design Tokens)

Establish these foundational tokens in Figma's Local Variables before drawing any components.

### 3.1 Color Tokens (High Contrast / Monochrome)

- **`bg-concrete`**: `#E5E5E5` (Main absolute app background)
- **`bg-surface-light`**: `#FFFFFF` (Content blocks, canvas, default buttons)
- **`bg-surface-dark`**: `#000000` (Title bars, inverted states, tooltips, modals)
- **`border-heavy`**: `#000000` (Used for primary structural grid - 2px or 4px)
- **`border-light`**: `#D3D3D3` (Used for background coordinate grids - 1px)
- **`accent-industrial`**: `#FF3333` (Stark red for active states, particles, and alerts)

### 3.2 Typography System (Text Styles)

_CRITICAL:_ Standard fonts must be aggressively styled to fit the Brutalist aesthetic.

- **`Display / Headings`**: **Space Grotesk** (Bold, Uppercase).
  - _Tracking constraint:_ Apply **-3% to -5%** negative letter-spacing to make it feel stamped and heavy.
  - `Display/Massive`: 120px+, 100% Line Height (Hz readouts). _Variant: "Hollow"_ - 0% fill with a 2px Inside Stroke (`border-heavy`).
  - `Heading/H1`: 32px, Auto Line Height.
  - `Heading/H2`: 24px, Auto Line Height.
- **`Data / UI`**: **IBM Plex Mono** (or Space Mono).
  - `Mono/Body`: 14px, 140% Line Height.
  - `Mono/Label`: 10px-12px, 120% Line Height, Uppercase. _Tracking constraint:_ Apply **+10% to +15%** positive letter-spacing.
  - `Mono/Code`: 16px, Medium weight (Variables, timecodes).

### 3.3 Geometry & Elevation

- **`Corner-Radius`**: `0px` global baseline.
- **`Stroke-Weights`**: Define `1px` (Grid), `2px` (Internal UI), `4px` (Structural).
- **`Shadow-Brutalist`**: Drop shadow with `X: 6`, `Y: 6`, `Blur: 0`, `Spread: 0`, `Color: #000000`. Applied to actionable elements (buttons, modals).

## 4. Component Library (Atomic Design)

Construct components using Auto Layout, Component Properties (Booleans, Text), and Variants.

### 4.1 Atoms

- **Grid Lines:** Reusable 2px and 4px solid black vector lines used to construct screen grids.
- **Brutalist Button:**
  - _Text Logic:_ Inject ASCII/Terminal symbology (e.g., `[ REC ]`, `STATUS // ACTIVE`) rather than standard labels.
  - _Default:_ Fill `bg-surface-light`, 2px `border-heavy`, `Shadow-Brutalist`. Space Grotesk text.
  - _Hover:_ Invert colors (Black fill, White text).
  - _Pressed/Active:_ Remove shadow, Translate X:6 Y:6. Fill `accent-industrial`.
- **Radio Toggles:** Hard-edged 16x16px boxes. Selected state is a stark `X` inside.

### 4.2 Molecules

- **Harmonic Slider:** 4px black track. Thumb is a tall vertical rectangle (`bg-surface-dark`) that snaps to the track. Value label attached above in `Mono/Code`. Use ASCII blocks like `████░░` for visual volume feedback if needed.
- **Preset List Item:** Auto Layout row. Includes ID (`[PRE-001]`) and Name. Variants: `Default` (White/Black), `Hover` (Black/White), `Playing` (Includes blinking terminal cursor graphic).
- **Tauri Title Bar:** 40px height, `bg-surface-dark`, text `bg-surface-light`. **CRITICAL:** Include a text layer `[ DATA-TAURI-DRAG-REGION ]` centered, and leave 70px left padding for macOS controls.

### 4.3 Organisms

- **Provenance Spec Card:** Auto Layout block wrapped in 4px `border-heavy`. Ingests JSON data.
  - _Alignment Constraint:_ Enforce **Forced Justification** on the `Mono/Body` text so it perfectly hits both the left and right borders, emulating a printed text block.
- **Control Deck:** Groups Harmonic Sliders ($n$, $m$) alongside the `Display/Massive` Hz readout.

### 4.4 Meditation V1.5 Components (Code-First)

_Note: These are constructed directly in code via Tailwind, bypassing Figma._

- **Timebox Selector (Atom):** A horizontal row of brutalist radio toggles `[ 10M ] | [ 20M ] | [ 60M ] | [ ∞ ]` in IBM Plex Mono. Active state inverts to `accent-industrial`.
- **Cadence Dropdown (Atom):** A heavy 2px bordered dropdown labeled `BREATH_SYNC // [ BOX ]`. Options include 4-7-8 and OFF.
- **1-Bit Sprite Container (Molecule):** A stark 160x160px square with a 4px `border-heavy`. Contains the GSAP canvas for the cat sprite, with a tiny label underneath: `COMPANION_ID: TABBY_01`.

## 5. Screen Inventory & Layout Architecture

All screens must be assembled _exclusively_ from the Component Library.

### Screen 1: The Main Deck (1200x800)

- **Grid System:** No floating cards. Use continuous 4px black lines to segment the `bg-concrete` canvas.
- **Top (40px):** Tauri Title Bar Molecule.
- **Left Column (300px):** "ANAHAT V1.0" header. Preset List categorized by JSON headers (`VEDIC`, `SOLFEGGIO`). Bottom: Chunky `[ REC ]` Button Atom.
- **Center Column:**
  - _Top:_ WebGL Canvas square (`bg-surface-light` + 1px grid overlay). Top-left toggles: `[X] PARTICLES | [ ] FLUID`.
  - _Bottom (Control Deck):_ Enforce **Extreme Scale Contrast**. Pair the massive 120px+ Hz readout directly next to tiny 10px `Mono/Label` descriptors to create visual tension.
- **Right Column (300px):** Provenance Spec Card Organism.

### Screen 2: Fullscreen Clinical Projection (1920x1080)

- **Architecture:** Chromeless. `0px` borders, pure `bg-surface-dark` background.
- **Canvas:** Renders the WebGL particles in `accent-industrial`.
- **UI:** A stark `#FFFFFF` square button in the top right with an "X" to exit.

### Screen 3: System Tray Flyout (300x400)

- **Architecture:** Background OS flyout. `bg-surface-light`, 4px black border, `Shadow-Brutalist`.
- **Content:** Harsh vertical list separated by 2px lines. Header: `ANAHAT // ACTIVE`. Includes a `NOW PLAYING: 432 HZ` readout, hard geometric blocks for `[ PLAY/PAUSE ]` / `[ SKIP ]`.

### Screen 4: Audio Routing Matrix (800x600 Overlay)

- **Architecture:** Brutalist modal mirroring a physical patch bay.
- **Content:** Left column contains dropdowns for `INPUT` and `OUTPUT`. Right column contains brutalist checkboxes for `[X] LAUNCH ON STARTUP` and `[X] BACKGROUND AUDIO`.

### Screen 5: Recording Active State (Mutation of Screen 1)

- **Visual Updates:** The `[ REC ]` button inverts to `accent-industrial` (pressed state).
- **Canvas Capture:** A 4px `accent-industrial` border clamps around the inner WebGL canvas. A timecode (e.g., `REC 00:01:24:10`) appears in the top-right of the canvas, utilizing terminal blink motion.

### Screen 6: V2 Roadmap Modal - Biometric Sync

- **Architecture:** 500x400 modal dead center over the Main Deck.
- **Content:** Fill `bg-surface-light`, 4px border, `Shadow-Brutalist`. Text: `AWAITING BIOMETRIC SYNC // BLE` with a raw sine wave vector graphic.

### Screen 7: Guided Session Active State (Code-First)

_This screen activates when a meditation timebox is initiated._

- **Canvas Takeover:** The WebGL canvas expands to fill the Center and Right columns (hiding the Provenance Card).
- **Massive Countdown:** The Hz readout in the Control Deck is replaced by a giant hollow ticking countdown timer (e.g., `19:59`) in Space Grotesk `Display/Massive`.
- **Sprite Metronome:** The `1-Bit Sprite Container` docks to the top-left of the expanded WebGL canvas.
- **Interval Chime Cue:** The entire WebGL canvas background flashes pure `accent-industrial` (#FF3333) momentarily on specific audio chime milestones.

### Screen 8: V2 Roadmap Modal - Biometric Sync

- **Architecture:** 500x400 modal dead center over the Main Deck.
- **Content:** Fill `bg-surface-light`, 4px border, `Shadow-Brutalist`. Text: `AWAITING BIOMETRIC SYNC // BLE` with a raw sine wave vector graphic.

## 6. Interaction & Motion Guidelines

Brutalism relies on functional, mechanical motion. Modern easing curves are prohibited.

- **Transitions:** Instant (0ms) or extremely fast linear cuts (e.g., 50ms). No springs, no ease-in-out.
- **Active States:** Emulate physical hardware. Buttons physically depress (offset shadow disappears, container moves X:6, Y:6 to meet the shadow plane).
- **Terminal Aesthetics:** Recording indicators or loading states should mimic terminal blinking (opacity toggling 100% to 0% every 500ms, no fading).

## 7. Developer Handoff Protocols

- **Export Assets:** Any vector icons (e.g., sine waves, 'X' closes) must be exportable as flattened SVGs with stroke paths outlined.
- **Tauri API Hooks:** Ensure the `[ DATA-TAURI-DRAG-REGION ]` node is explicitly visible in the Dev Mode inspect panel so Rust engineers know where to bind the window drag APIs.
- **Layer Naming:** Use strict kebab-case for all layers and components (e.g., `btn-primary-active`, `card-provenance`) to mirror the upcoming Tailwind CSS implementation.
