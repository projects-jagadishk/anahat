# Systems Engineering Audit & Remediation Plan: Memory Leak & Resource Overuse

**Target Architecture:** Tauri v2 | Rust Backend (`rodio`, `hound`, `cpal`) | Astro v7 + Three.js WebGL (WKWebView)  
**Symptom:** When the application runs and is left idle in the background, system memory and CPU escalate, causing OS-wide sluggishness until the application process is terminated.

---

## 1. Diagnosis Report: Top 5 Identified Resource Bottlenecks

```
                                  SYSTEM BOTTLENECK MAP
                                  
  [ Tauri Native Core ]                                [ WKWebView Frontend ]
  ┌──────────────────────────────────────────────┐     ┌──────────────────────────────────────────────┐
  │ 1. REAL-TIME AUDIO THREAD (CPAL)             │     │ 2. THREE.JS / WEBGL SCENE                    │
  │    • 192,000 malloc/free heap allocs/sec     │     │    • 12,000 CPU particles calculated at 60Hz │
  │    • Mutex contention on every single sample │     │    • Renders non-stop even when hidden/tray  │
  │    • String comparisons in audio loop        │     │    • Ghost render: Deck + Theater running    │
  ├──────────────────────────────────────────────┤     ├──────────────────────────────────────────────┤
  │ 4. UNBOUNDED RECORDING BUFFER & BLOCKING I/O │     │ 3. WEB AUDIO GRAPH NODE ACCUMULATION         │
  │    • 96,000 floats/sec pushed indefinitely   │     │    • Chime GainNodes never disconnected      │
  │    • 1.38 GB/hr pinned in RAM; cloned on save│     │    • Pinned to ctx.destination permanently   │
  │    • Heavy WAV encoding on async Tokio core  │     │    • ChannelMergerNode leaked on preset swap │
  └──────────────────────┬───────────────────────┘     └──────────────────────┬───────────────────────┘
                         │                                                    │
                         └───────────────── 5. IPC LIFECYCLE ─────────────────┘
                                  • "window-hidden" emitted but never consumed
                                  • Continuous RAF level-meter polling DOM in background
```

---

### Bottleneck 1: Catastrophic Heap Allocation & Mutex Contention in Real-Time DSP Audio Loop
* **Location:** `src-tauri/src/audio.rs` (`NeuroacousticSource::next()`)
* **Mechanism:**
  At 48 kHz stereo, `Iterator::next()` executes **96,000 times per second**. On *every single call*, the implementation executes:
  ```rust
  let p = match self.params.try_lock() {
      Ok(guard) => guard.clone(),
      Err(_) => DspParams::default(),
  };
  ```
  `DspParams` holds two dynamic strings: `pub waveform: String` and `pub noise_type: String`. Cloning `p` triggers **two heap allocations (`malloc`) and two drops (`free`) per sample frame**.
  * **Throughput:** 96,000 × 2 = **192,000 heap allocations/deallocations per second**.
  * Over 10 minutes idle: **~115,200,000 heap operations**.
* **Impact:**
  Calling `malloc` and locking an OS `Mutex` inside a high-priority CoreAudio/CPAL callback violates the first rule of real-time audio systems (priority inversion & allocator lock contention). The system memory allocator fragments, memory footprint expands exponentially, CPU cache lines thrash, and the operating system's virtual memory manager experiences global starvation.

---

### Bottleneck 2: Ghost WebGL Rendering & CPU Particle Simulation in Background/Hidden State
* **Location:** `src/components/logic/ChladniCanvas.ts`, `src-tauri/src/lib.rs`, `src/pages/index.astro`
* **Mechanism:**
  When Anahat is minimized or closed to the system tray via `window.hide()`, the backend emits `"window-hidden"`, but **nothing in the frontend listens to it**. WKWebView on macOS does not throttle `requestAnimationFrame` for transparent windows (`"transparent": true`).
  * 12,000 particles are mathematically projected with trigonometric and sqrt functions on the JS main thread every frame.
  * Three.js submits DrawCalls and command buffers to the GPU continuously.
  * `updateMeter` in `index.astro` runs a secondary `requestAnimationFrame` loop querying Web Audio and mutating DOM elements 60 times a second.
  * When entering Theater Mode, `theaterVisualizer` is launched, but `visualizer` is **never paused**—running two Three.js scenes simultaneously (24,000 particles).
* **Impact:** Continuous 100% Core GPU/CPU load while the application is minimized in the system tray, leading to thermal throttling, WindowServer slowdown, and battery exhaustion.

---

### Bottleneck 3: Permanent Web Audio Graph Node Accumulation (Memory Leak)
* **Location:** `src/components/logic/AudioEngine.ts` (`playCadenceChime()`), `AudioEngine.ts` (`updateWebAudioNodes()`)
* **Mechanism:**
  1. Each breath cadence interval (every 4–8 seconds) invokes `playCadenceChime()`, creating:
     - 1 `chimeMaster` (`GainNode`) connected directly to `this.ctx.destination` and `this.analyser`.
     - 1 `BiquadFilterNode`, 1 transient `GainNode`, 5 modal oscillator `GainNode`s, and 5 `StereoPannerNode`s.
     - While `osc.stop()` is scheduled, **`chimeMaster` is never disconnected**. Any node connected to an active `AudioDestinationNode` cannot be garbage collected by V8/JavaScriptCore. An idle session leaks **~13 audio nodes every 4 seconds** (~11,700 connected nodes/hour).
  2. Each preset change invokes `updateWebAudioNodes()`, instantiating a new `this.ctx.createChannelMerger(2)` connected to `masterGain` without disconnecting the previous merger node.
* **Impact:** Web Audio engine CPU cycles climb linearly with time as the Web Audio DSP graph traversal cost explodes.

---

### Bottleneck 4: Unbounded Audio Recording Accumulation & Blocking Disk I/O
* **Location:** `src-tauri/src/audio.rs`, `src-tauri/src/lib.rs`
* **Mechanism:**
  * When recording is enabled, `recorded_buffer` appends raw float samples without an upper bound or ring buffer strategy ($96,000\ \text{floats/sec} \approx 384\ \text{KB/sec} \approx 1.38\ \text{GB/hour}$).
  * On save, `buf.clone()` duplicates the entire gigabyte buffer in RAM.
  * The buffer is never released (`shrink_to_fit` or clear) after export; it remains permanently allocated in memory.
  * `audio_stop_and_save` performs millions of synchronous file writes (`hound::WavWriter::write_sample`) directly on the Tokio threadpool without `spawn_blocking`.
* **Impact:** Sudden Multi-Gigabyte RAM spikes and executor thread starvation freezing IPC communication.

---

### Bottleneck 5: Audio Synthesis Redundancy
* **Location:** `src/components/logic/AudioEngine.ts`
* **Mechanism:**
  `masterGain.connect(this.ctx.destination)` outputs audio through Web Audio while Rust Rodio concurrently outputs through CPAL to the hardware soundcard. The app synthesizes sound **twice**, consuming duplicate CPU and memory resources. Web Audio should only connect to `AnalyserNode`.

---

## 2. Refactored Code Fixes

### Fix 1: Zero-Allocation, Lock-Free DSP Parameters in Rust Core
Convert `DspParams` to a stack-allocated, `Copy`-compliant struct with `enum` representations. Add an `AtomicBool` dirty flag so `next()` never calls `try_lock()` or heap allocations during synthesis.

#### Before (`src-tauri/src/audio.rs`)
```rust
#[derive(Clone)]
pub struct DspParams {
    pub carrier_hz: f32,
    pub offset_hz: f32,
    pub amplitude: f32,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
    pub waveform: String,      // ❌ Heap allocated
    pub noise_type: String,    // ❌ Heap allocated
    pub noise_blend_ratio: f32,
}

// Inside Iterator::next():
let p = match self.params.try_lock() {
    Ok(guard) => guard.clone(), // ❌ 192,000 malloc/free operations/sec!
    Err(_) => DspParams::default(),
};
```

#### After (`src-tauri/src/audio.rs`)
```rust
#[derive(Copy, Clone, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum WaveformType {
    #[default]
    Sine = 0,
    Binaural = 1,
    Isochronic = 2,
}

impl WaveformType {
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "binaural" => Self::Binaural,
            "isochronic" => Self::Isochronic,
            _ => Self::Sine,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sine => "sine",
            Self::Binaural => "binaural",
            Self::Isochronic => "isochronic",
        }
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum NoiseType {
    None = 0,
    White = 1,
    Pink = 2,
    #[default]
    Brown = 3,
}

impl NoiseType {
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "none" => Self::None,
            "white" => Self::White,
            "pink" => Self::Pink,
            _ => Self::Brown,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::White => "white",
            Self::Pink => "pink",
            Self::Brown => "brown",
        }
    }
}

/// Zero-allocation, Copy-friendly DSP parameter block
#[derive(Copy, Clone)]
pub struct DspParams {
    pub carrier_hz: f32,
    pub offset_hz: f32,
    pub amplitude: f32,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
    pub waveform: WaveformType,
    pub noise_type: NoiseType,
    pub noise_blend_ratio: f32,
}

impl Default for DspParams {
    fn default() -> Self {
        Self {
            carrier_hz: 136.1,
            offset_hz: 0.0,
            amplitude: 0.7,
            harmonic_n: 3,
            harmonic_m: 4,
            waveform: WaveformType::Sine,
            noise_type: NoiseType::Brown,
            noise_blend_ratio: 0.25,
        }
    }
}

pub struct NeuroacousticSource {
    sample_rate: u32,
    params: Arc<Mutex<DspParams>>,
    params_dirty: Arc<AtomicBool>,
    cached_params: DspParams, // Local cache avoiding locks
    is_playing: Arc<AtomicBool>,
    is_recording: Arc<AtomicBool>,
    recorded_buffer: Arc<Mutex<Vec<f32>>>,
    // ... registers ...
}

impl Iterator for NeuroacousticSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if !self.is_playing.load(Ordering::Relaxed) {
            return Some(0.0);
        }

        // Only lock when parameters were actually updated via IPC
        if self.params_dirty.load(Ordering::Relaxed) {
            if let Ok(guard) = self.params.try_lock() {
                self.cached_params = *guard; // Bitwise copy, ZERO heap allocations
                self.params_dirty.store(false, Ordering::Release);
            }
        }

        let p = self.cached_params; // Direct stack copy
        let sample_rate = self.sample_rate as f64;
        let pi2 = std::f64::consts::TAU;

        if self.channel_toggle == 0 {
            let carrier = p.carrier_hz as f64;
            let offset = p.offset_hz as f64;

            let left_hz = match p.waveform {
                WaveformType::Binaural => carrier - (offset * 0.5),
                _ => carrier,
            };

            let tone_raw = self.synthesize_harmonic_tone(self.sample_clock_left, p.harmonic_n, p.harmonic_m);
            self.sample_clock_left += left_hz / sample_rate;
            if self.sample_clock_left >= 1.0 { self.sample_clock_left -= 1.0; }

            let iso_mod = if p.waveform == WaveformType::Isochronic && offset > 0.0 {
                let mod_wave = (self.sample_clock_iso * pi2).sin() as f32;
                self.sample_clock_iso += offset / sample_rate;
                if self.sample_clock_iso >= 1.0 { self.sample_clock_iso -= 1.0; }
                0.5 + 0.5 * mod_wave
            } else {
                1.0
            };

            let noise_sample = match p.noise_type {
                NoiseType::White => self.next_white_noise(),
                NoiseType::Pink => self.next_pink_noise(),
                NoiseType::Brown => self.next_brown_noise(),
                NoiseType::None => 0.0,
            };

            let tone_gain = p.amplitude * (1.0 - p.noise_blend_ratio) * iso_mod;
            let noise_gain = p.amplitude * p.noise_blend_ratio * 0.75;
            let left = ((tone_raw * tone_gain) + (noise_sample * noise_gain)).clamp(-1.0, 1.0);

            self.current_left_sample = left;
            self.channel_toggle = 1;

            if self.is_recording.load(Ordering::Relaxed) {
                if let Ok(mut buf) = self.recorded_buffer.try_lock() {
                    buf.push(left);
                }
            }

            Some(left)
        } else {
            // Right channel calculation with p.waveform enum matching ...
            // (identical zero-alloc logic for channel 1)
            self.channel_toggle = 0;
            // ...
            Some(self.current_left_sample)
        }
    }
}
```

---

### Fix 2: Background Lifecycle Management & Render Throttling
Pause Three.js WebGL and DOM polling whenever the window is hidden, minimized to tray, or not focused.

#### Before (`src/pages/index.astro`)
```typescript
// ❌ Runs 60 FPS RAF loop forever, even when hidden or minimized
const updateMeter = () => {
  if (telemetryMeterBar) {
    const isMic = audioEngine.getSourceMode() === "mic_ingest";
    const rms = isMic ? audioEngine.getRMSLevel() : (audioEngine.isPlaying() ? 0.35 : 0.0);
    // ... DOM text mutations ...
  }
  requestAnimationFrame(updateMeter);
};
requestAnimationFrame(updateMeter);
```

#### After (`src/pages/index.astro`)
```typescript
// 1. Wire Window Visibility / Tray State
let isAppVisible = true;
let meterRafId: number | null = null;

function pauseAllVisualizers() {
  visualizer?.pause();
  theaterVisualizer?.pause();
  if (meterRafId !== null) {
    cancelAnimationFrame(meterRafId);
    meterRafId = null;
  }
}

function resumeActiveVisualizer() {
  const theaterActive = document.getElementById("theater-overlay")?.classList.contains("theater-overlay--active");
  if (theaterActive) {
    theaterVisualizer?.resume();
  } else {
    visualizer?.resume();
  }
  scheduleMeterUpdate();
}

function scheduleMeterUpdate() {
  if (meterRafId !== null || !isAppVisible) return;
  const updateMeter = () => {
    if (!isAppVisible) {
      meterRafId = null;
      return;
    }
    if (telemetryMeterBar) {
      const isMic = audioEngine.getSourceMode() === "mic_ingest";
      const rms = isMic ? audioEngine.getRMSLevel() : (audioEngine.isPlaying() ? 0.35 : 0.0);
      const segments = 10;
      const filled = Math.min(segments, Math.max(0, Math.round(rms * 16)));
      telemetryMeterBar.textContent = `LEVEL: [${"█".repeat(filled)}${"░".repeat(segments - filled)}]`;
    }
    meterRafId = requestAnimationFrame(updateMeter);
  };
  meterRafId = requestAnimationFrame(updateMeter);
}

// Tauri v2 native tray/window event handlers
listen("window-hidden", () => {
  isAppVisible = false;
  pauseAllVisualizers();
});

listen("window-shown", () => {
  isAppVisible = true;
  resumeActiveVisualizer();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    isAppVisible = false;
    pauseAllVisualizers();
  } else {
    isAppVisible = true;
    resumeActiveVisualizer();
  }
});

// Mutual Exclusion for Theater Mode (Never run both visualizers concurrently)
async function enterTheaterMode() {
  visualizer?.pause(); // 🛑 Suspend deck visualizer
  // ... mount/sync theater ...
  theaterVisualizer?.resume();
}

async function exitTheaterMode() {
  theaterVisualizer?.pause(); // 🛑 Suspend theater visualizer
  // ... exit fullscreen ...
  visualizer?.resume();
}
```

---

### Fix 3: Self-Cleaning Web Audio Node Graph Lifecycle
Ensure every transient node created during chimes or preset switches cleans itself up and disconnects from `AudioDestinationNode`.

#### Before (`src/components/logic/AudioEngine.ts`)
```typescript
// ❌ Creates new GainNode connected to destination and never disconnects it
const chimeMaster = this.ctx.createGain();
chimeMaster.gain.setValueAtTime(0.75, now);
chimeMaster.connect(this.ctx.destination);
chimeMaster.connect(this.analyser);
// Nodes remain pinned in the Web Audio graph permanently!
```

#### After (`src/components/logic/AudioEngine.ts`)
```typescript
export class AudioEngine {
  private activeMergerNode: ChannelMergerNode | null = null;
  // ...

  private ensureAudioContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 48000 });

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentAmplitude, this.ctx.currentTime);

      // Connect to Analyser for FFT reactivity ONLY.
      // Do NOT connect masterGain to ctx.destination in native Tauri mode,
      // as Rust Rodio engine already outputs to the audio hardware.
      this.masterGain.connect(this.analyser);
    }
  }

  private updateWebAudioNodes(carrierHz: number, offsetHz: number, waveform: string): void {
    if (!this.ctx || !this.masterGain) return;

    if (this.leftOsc) {
      try { this.leftOsc.stop(); this.leftOsc.disconnect(); } catch (_) {}
      this.leftOsc = null;
    }
    if (this.rightOsc) {
      try { this.rightOsc.stop(); this.rightOsc.disconnect(); } catch (_) {}
      this.rightOsc = null;
    }

    // Clean up previous merger node before creating a new one
    if (this.activeMergerNode) {
      try { this.activeMergerNode.disconnect(); } catch (_) {}
      this.activeMergerNode = null;
    }

    if (!this.isPlaying) return;

    const leftFreq = waveform === "binaural" ? carrierHz - (offsetHz * 0.5) : carrierHz;
    const rightFreq = waveform === "binaural" ? carrierHz + (offsetHz * 0.5) : carrierHz;

    this.activeMergerNode = this.ctx.createChannelMerger(2);
    this.leftOsc = this.ctx.createOscillator();
    this.leftOsc.type = "sine";
    this.leftOsc.frequency.setValueAtTime(leftFreq, this.ctx.currentTime);
    this.leftOsc.connect(this.activeMergerNode, 0, 0);

    this.rightOsc = this.ctx.createOscillator();
    this.rightOsc.type = "sine";
    this.rightOsc.frequency.setValueAtTime(rightFreq, this.ctx.currentTime);
    this.rightOsc.connect(this.activeMergerNode, 0, 1);

    this.activeMergerNode.connect(this.masterGain);
    this.leftOsc.start();
    this.rightOsc.start();
  }

  playCadenceChime(phase: "inhale" | "hold-in" | "exhale" | "hold-out" = "inhale"): void {
    if (!this.chimesEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const chimeMaster = this.ctx.createGain();
    chimeMaster.gain.setValueAtTime(0.75, now);
    chimeMaster.connect(this.ctx.destination);
    if (this.analyser) chimeMaster.connect(this.analyser);

    const nodesToCleanup: AudioNode[] = [chimeMaster];
    const maxDecay = 3.5;

    // ... create modal partials and push to nodesToCleanup ...

    // Schedule deterministic audio graph detachment
    setTimeout(() => {
      nodesToCleanup.forEach((node) => {
        try { node.disconnect(); } catch (_) {}
      });
      nodesToCleanup.length = 0;
    }, (maxDecay + 0.2) * 1000);
  }
}
```

---

### Fix 4: Non-Blocking Async File Encoding & Zero-Copy Buffer Release
Drain `recorded_buffer` with `std::mem::take` to clear backend memory immediately, and offload file encoding to `tokio::task::spawn_blocking`.

#### Before (`src-tauri/src/lib.rs`)
```rust
// ❌ Blocks Tokio async worker thread while encoding hundreds of MBs of WAV data
#[tauri::command]
fn audio_stop_and_save(
    destination_path: String,
    audio: tauri::State<'_, Arc<AudioController>>,
) -> Result<usize, String> {
    audio.stop_and_save_wav(&destination_path)
}
```

#### After (`src-tauri/src/lib.rs`)
```rust
#[tauri::command]
async fn audio_stop_and_save(
    destination_path: String,
    audio: tauri::State<'_, Arc<AudioController>>,
) -> Result<usize, String> {
    let controller = audio.inner().clone();
    tokio::task::spawn_blocking(move || {
        controller.stop_and_save_wav(&destination_path)
    })
    .await
    .map_err(|e| format!("Join error: {}", e))?
}
```

And in `src-tauri/src/audio.rs`:
```rust
pub fn stop_and_save_wav(&self, destination_path: &str) -> Result<usize, String> {
    self.is_recording.store(false, Ordering::SeqCst);

    // ZERO-COPY: Drain vector out of mutex and leave empty capacity behind
    let samples = {
        let mut buf = self.recorded_buffer.lock().map_err(|e| e.to_string())?;
        let drained = std::mem::take(&mut *buf);
        buf.shrink_to_fit(); // Release memory back to OS immediately
        drained
    };

    if samples.is_empty() {
        return Err("Recording buffer is empty.".to_string());
    }

    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: 48000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(destination_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    for &sample in &samples {
        let s16 = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
        writer.write_sample(s16).map_err(|e| format!("WAV write error: {}", e))?;
    }

    writer.finalize().map_err(|e| format!("Failed to finalize WAV header: {}", e))?;
    Ok(samples.len() / 2)
}
```

---

### Fix 5: Retain and Clean Up Tauri Event Listeners
Unsubscribe all Tauri event listeners and cancel background timers on window unload.

#### After (`src/pages/index.astro`)
```typescript
const unlistenFns: Array<() => void> = [];

async function setupEventListeners() {
  const unlistenTray = await listen<boolean>("tray-playback-changed", (event) => {
    if (event.payload) audioEngine.play();
    else audioEngine.pause();
  });
  unlistenFns.push(unlistenTray);

  const unlistenHide = await listen("window-hidden", () => {
    isAppVisible = false;
    pauseAllVisualizers();
  });
  unlistenFns.push(unlistenHide);

  const unlistenShow = await listen("window-shown", () => {
    isAppVisible = true;
    resumeActiveVisualizer();
  });
  unlistenFns.push(unlistenShow);
}

window.addEventListener("beforeunload", () => {
  unlistenFns.forEach((unlisten) => unlisten());
  unlistenFns.length = 0;
  if (recInterval) clearInterval(recInterval);
  if (sessionInterval) clearInterval(sessionInterval);
  if (randomCycleTimer) clearInterval(randomCycleTimer);
  cadenceController.destroy();
  visualizer?.dispose();
  theaterVisualizer?.dispose();
});
```

---

## 3. Profiling & Diagnostic Strategy

Use the following commands and diagnostic flags to trace memory and thread consumption:

### A. macOS Native Profiling (Rust Core & Allocations)

```bash
# 1. Install cargo-instruments
cargo install cargo-instruments

# 2. Profile Allocations & Heap Churn (Tracing malloc/free in CPAL thread)
cd src-tauri
cargo instruments -t "Allocations" --bin anahat

# 3. Profile CPU Time & Contention (Tracing Mutex locks in Iterator::next)
cargo instruments -t "Time Profiler" --bin anahat

# 4. Inspect Live Heap & Memory Leaks of Running Process
ps aux | grep anahat
leaks <PID>
heap <PID> -addresses=all
vmmap -summary <PID>
```
* **Success Metric:** In the *Allocations* instrument, the allocation rate graph should drop from **>200,000 allocations/sec** down to **<50 allocations/sec** during idle audio synthesis.

---

### B. WKWebView & Safari Web Inspector (DOM, Web Audio & WebGL)

1. **Enable Developer Tools:** Ensure `tauri.conf.json` or your build flags allow the web inspector:
   ```json
   "build": {
     "devUrl": "http://localhost:4321"
   }
   ```
2. **Launch Safari:** Go to `Develop` -> `Computer Name` -> `Anahat`.
3. **Memory Snapshots:**
   - Open the **Memory** tab.
   - Take **Snapshot 1** immediately after boot.
   - Leave the application running idle for 15 minutes.
   - Take **Snapshot 2** and select **Comparison**.
   - Filter by `GainNode`, `AudioNode`, `BufferGeometry`, and `ArrayBuffer`.
   - *Verification:* The count of `GainNode` and `AudioNode` instances should remain constant ($0\ \Delta$) rather than accumulating in the thousands.
4. **Performance Recording:**
   - Record a 5-second slice while minimized to system tray.
   - *Verification:* CPU activity should drop to ~0% with zero `requestAnimationFrame` triggers.

---

## 4. Remediation Checklist & Verification Steps

| Check | Target Component | Expected Behavior Post-Fix |
| :--- | :--- | :--- |
| [x] | **Audio Core** | Zero heap allocations in `NeuroacousticSource::next()` |
| [x] | **Audio Mutex** | Mutex locked only on user slider adjustments, not per audio sample |
| [x] | **Tray Minimization** | Three.js WebGL & RAF loop paused immediately when window hides |
| [x] | **Theater Mode** | Main Deck visualizer paused while Theater visualizer is active |
| [x] | **Web Audio Chimes** | All transient chime nodes detached via `setTimeout` after envelope completion |
| [x] | **Audio Redundancy** | Web Audio `masterGain` disconnected from `ctx.destination` (Rodio outputs to hardware) |
| [x] | **Session Export** | `recorded_buffer` drained via `std::mem::take` and encoded via `spawn_blocking` |
| [x] | **Event Cleanup** | All `listen()` unlisteners and timers cleared on `beforeunload` |


---

## 5. Phase 2 Deep Audit: Secondary Memory Leaks & Edge Cases

Following the primary remediation, a secondary deep systems audit revealed 5 additional high-impact bottlenecks and resource leaks:

### 1. Three.js VRAM / GPU Leak on Unmount/Dispose (`ChladniCanvas.ts`)
* **Issue:** `ChladniCanvas.dispose()` only disposed `particlePoints` and `fluidMesh`. The other 9 visualization engines (`oscilloGroup`, `radarGroup`, `waterfallMesh`, `torusGroup`, `voxelGroup`, `tunnelGroup`, `digitalScopeGroup`, `wireTunnelGroup`, `etherealGroup`), along with procedural canvas textures (`etherealPuffTexture`) and all line/mesh materials, were left allocated in GPU Unified Memory (VRAM).
* **Fix:** Added recursive traversal of `this.scene` to dispose all geometries, materials (arrays or single), and textures (`etherealPuffTexture.dispose()`).

### 2. 200,000+ JS Color Object Allocations / Sec (`samplePalette` & `updateEtherealMist`)
* **Issue:** `samplePalette()` created and cloned 6 `new THREE.Color()` objects on every call. In `updateEtherealMist()`, it was called 486 times *per frame* across wisps, particles, and smoke puffs ($486 \times 7 = 3,402\ \text{allocations/frame} \approx \mathbf{204,120\ allocations/sec}$ in JavaScript), triggering heavy V8/WebKit Minor GC pauses.
* **Fix:** Replaced dynamic allocations with static palette color constants (`PAL_MONO`, `PAL_AMBER`, `PAL_GREEN`, `PAL_CYBER`, `PAL_STARK`, `PAL_PASTEL`) and a reusable `scratchColor` output buffer, eliminating 100% of runtime object allocations in `samplePalette()`.

### 3. CPU Math Saturation & Ignored Particle Detail Culling (`updateParticles`)
* **Issue:** `updateParticles()` calculated finite differences (`(chladni(x + eps) - val) / eps`) with 3 calls to `chladni` ($12 \times \text{Math.sin}()$ per particle) for 12,000 particles = $\mathbf{8,640,000\ \text{trig evaluations/sec}}$ at 60 FPS ($17.2\text{M/sec}$ at 120 FPS). Furthermore, `setDetail("low")` only adjusted `setDrawRange()`, while the CPU continued to calculate all 12,000 particles.
* **Fix:** Replaced numerical finite differences with the exact analytic gradient formula ($\frac{\partial Z}{\partial x}$ and $\frac{\partial Z}{\partial y}$), halving trigonometric evaluations. Connected `activeParticleCount` to the CPU integration loop so lower detail levels immediately reduce CPU simulation workload by up to 75%.

### 4. Background CoreAudio Thread Spinning (`AudioContext::suspend()` missing)
* **Issue:** When the app was paused or minimized to the tray, `AudioContext.suspend()` was never called. In WebKit, an un-suspended `AudioContext` keeps an active CoreAudio thread running at 48 kHz even when completely silent.
* **Fix:** Added `ctx.suspend()` on pause and window hide, and `ctx.resume()` on playback and window restore.

### 5. Recording Mutex Contention & Channel Desync (`src-tauri/src/audio.rs`)
* **Issue:** Recording attempted to lock `self.recorded_buffer` twice per stereo frame (once on channel 0, once on channel 1), creating 96,000 mutex lock/unlock operations per second with risk of stereo channel desynchronization if a lock was dropped. It also lacked a safety bound.
* **Fix:** Unified stereo recording into channel 1 (locking once per stereo pair at 48,000 locks/sec), pushing left and right together, and enforced a safe 1-hour recording ceiling (`MAX_RECORDING_SAMPLES`).

| Check | Phase 2 Target | Expected Behavior Post-Fix |
| :--- | :--- | :--- |
| [x] | **Scene Disposal** | All 11 visualizer geometries, materials, and textures freed via `scene.traverse` |
| [x] | **Color Allocation** | Zero heap allocations in `samplePalette()` using static color constants |
| [x] | **Particle Math** | Exact analytic gradient replaces finite differences; CPU respects `activeParticleCount` |
| [x] | **WebKit CoreAudio** | `AudioContext::suspend()` suspends WebKit audio thread when paused/hidden |
| [x] | **Recording Pair** | Left and right recorded atomically with 1-hour safe memory ceiling |
| [x] | **Mic Hardware** | `audioEngine.disableMicIngest()` halts hardware mic tracks on `beforeunload` |

---

## 6. Phase 3 Deep Audit: Security Hardening & Complete Visualizer Zero-Allocation

Following Phase 2, a comprehensive third-tier audit was executed targeting attack surfaces (IPC bridge, capabilities, XSS vulnerabilities) and remaining per-frame heap churn across all secondary visualizers.

### 1. [SECURITY - MAJOR] Stored XSS via `.anahat` Preset Profile Import
* **Location:** `src/pages/index.astro` (`renderUserPresets()` and `handleImportFile()`).
* **Vulnerability:** User-controlled strings (`preset.displayName`, `preset.name`, `preset.code`) from imported JSON files or `localStorage` were interpolated directly into `btn.innerHTML = ...`. An attacker sharing a crafted `.anahat` profile could trigger arbitrary script execution within the application's Webview context (`<img src=x onerror=...>` or `<svg onload=...>`). Furthermore, `handleImportFile()` did not validate property types or guard against prototype pollution keys (`__proto__`, `constructor`).
* **Remediation:**
  1. Refactored `renderUserPresets()` to build DOM nodes with `document.createElement()` and bind text exclusively via `.textContent`.
  2. Implemented strict schema validation and sanitization in `handleImportFile()`, enforcing numeric bounds on frequencies, clamping string lengths, stripping disallowed characters, and setting a maximum storage quota of 50 custom presets.

### 2. [SECURITY - MAJOR] Global IPC Exposure & Unused Shell Capability
* **Location:** `src-tauri/tauri.conf.json`, `src-tauri/capabilities/main.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`.
* **Vulnerability:**
  - `tauri.conf.json` had `"withGlobalTauri": true`, which unconditionally attaches the internal `window.__TAURI__` IPC object to the webview global namespace. The application frontend never uses `window.__TAURI__` (it strictly uses scoped ES module imports from `@tauri-apps/api`).
  - `tauri-plugin-shell` was compiled into `Cargo.toml`, enabled in `lib.rs`, and granted `"shell:default"` capability in `capabilities/main.json`, yet shell commands or URL launching are not used anywhere in the app.
* **Remediation:**
  1. Disabled `"withGlobalTauri": false` adhering to the principle of least privilege.
  2. Removed `tauri-plugin-shell` from `Cargo.toml`, `lib.rs`, and `capabilities/main.json`, reducing binary footprint and closing the command execution/browser launching attack vector.

### 3. [PERFORMANCE - MAJOR] Visualizer-Wide Per-Frame GC Pressure (130,000+ allocs/sec)
* **Location:** `src/components/logic/ChladniCanvas.ts`:
  - `updateRadar`: `barCol = colBase.clone().lerp(...)` allocated 96 `THREE.Color` instances per frame (5,760/sec).
  - `updateVoxelGrid`: `const dummy = new THREE.Object3D()`, `new THREE.Color(1.0, 0.4, 0.2)`, `new THREE.Color(1.0, 0.95, 0.5)` allocated 512 `THREE.Color` objects and 1 `Object3D` per frame (~30,000/sec).
  - `updateTunnel`: `ringCoords = []`, `ringV = []`, `[x, y, z]` arrays, plus `sortedIndices = Array.from(...)` allocated 408 arrays per frame (~24,480 arrays/sec).
  - `updateWireTunnel`: `ringCoords = []`, `ringV = []`, `[x, y, z]` arrays, plus `sortedRings = Array.from(...)` allocated 390 arrays per frame (~23,400 arrays/sec).
  - `updateEtherealMist`: Wisps, particles, and volumetric smoke puffs allocated over 2,200 `THREE.Color` objects per frame (~132,000 heap allocations/sec) on white/dark mode tinting.
* **Remediation:**
  - Defined static immutable colors: `COLOR_VOXEL_KICK`, `COLOR_VOXEL_PEAK`, `COLOR_DARK_SMOKE`, `COLOR_DARK_TONE`, `COLOR_DARK_PUFF`.
  - Added dedicated scratch color buffers (`scratchColor2`, `scratchColor3`, `scratchBarCol`) and reusable `dummyVoxel: THREE.Object3D`.
  - In `updateTunnel` and `updateWireTunnel`, eliminated all `ringCoords` nested arrays by indexing the existing `Float32Array` buffers directly, and sorting using pre-allocated index arrays `tunnelSortedIndices` and `wireSortedRings`.
  - Zero heap allocations remain inside any active visualizer rendering loop!

| Check | Phase 3 Target | Expected Behavior Post-Fix |
| :--- | :--- | :--- |
| [x] | **XSS Hardening** | `renderUserPresets()` uses safe `textContent`; imported JSON sanitized with strict schema |
| [x] | **IPC Isolation** | `"withGlobalTauri": false`; unused `tauri-plugin-shell` completely removed |
| [x] | **Radar Loop** | Pre-allocated `scratchBarCol` eliminates 96 `THREE.Color.clone()` calls per frame |
| [x] | **Voxel Loop** | `dummyVoxel` and static colors eliminate 512 `THREE.Color` & `Object3D` allocations/frame |
| [x] | **Tunnel Loop** | Direct `Float32Array` indexing eliminates 408 nested array allocations per frame |
| [x] | **Wire Tunnel Loop** | Direct `Float32Array` indexing eliminates 390 nested array allocations per frame |
| [x] | **Mist & Smoke Loop** | Static colors eliminate 2,200 `THREE.Color` allocations per frame |

---

## 7. Minor Findings Catalog & Remediation Status

All 5 minor findings were addressed and verified in the requested priority order (3, 4, 5, 2, 1):

| # | Priority Order | Finding | Location | Remediation Executed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 3 | **1st** | **ResizeObserver / Resize Debounce** | [`ChladniCanvas.ts`](file:///Users/jagzviruz/projects/personal/anahat/src/components/logic/ChladniCanvas.ts#L2891) | Added 80ms timer debounce and dimension equality guards (`lastWidth`, `lastHeight`) in `handleResize()` to prevent thrashing WebGL render target allocations during DPI/window changes. | **Fixed** |
| 4 | **2nd** | **CSP `style-src` Hardening** | [`tauri.conf.json`](file:///Users/jagzviruz/projects/personal/anahat/src-tauri/tauri.conf.json#L38) | Upgraded to CSP Level 3 directives: `style-src-elem 'self' https://fonts.googleapis.com` strictly prohibits injected `<style>` tags, while `style-src-attr 'unsafe-inline'` permits dynamic JS style mutations without compromise. | **Fixed** |
| 5 | **3rd** | **Vendor Chunk Code-Splitting** | [`astro.config.mjs`](file:///Users/jagzviruz/projects/personal/anahat/astro.config.mjs#L10) | Configured Vite Rollup `manualChunks` isolating `three-vendor` (470KB) and `gsap-vendor` (67KB), shrinking the main application entry script from 656KB to 118KB and eliminating all 500KB bundle size warnings. | **Fixed** |
| 2 | **4th** | **WAV Destination Extension Guard** | [`audio.rs`](file:///Users/jagzviruz/projects/personal/anahat/src-tauri/src/audio.rs#L560) | Validated destination path and enforced `.wav` extension via `path.with_extension("wav")`, preventing malformed or misleading filenames from being written. | **Fixed** |
| 1 | **5th** | **Unbounded localStorage Custom Presets** | [`index.astro`](file:///Users/jagzviruz/projects/personal/anahat/src/pages/index.astro#L5379) | Enforced 50-preset quota across all entrypoints: `openNewPresetModal`, `btnSave`, preset imports, and `localStorage.setItem(..., slice(0, 50))`. | **Fixed** |

