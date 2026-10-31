use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// Audio engine state shared across commands
#[derive(Default)]
pub struct AudioState {
    pub is_playing: bool,
    pub active_preset_id: Option<String>,
    pub carrier_hz: f64,
    pub offset_hz: f64,
    pub amplitude: f64,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
}

/// Payload sent back to the frontend
#[derive(Clone, Serialize)]
pub struct AudioUpdate {
    pub is_playing: bool,
    pub carrier_hz: f64,
    pub offset_hz: f64,
    pub amplitude: f64,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
}

// ═══════════════════════════════════════════════════════════
// IPC COMMANDS — called from the frontend via invoke()
// ═══════════════════════════════════════════════════════════

/// Ping command for health check
#[tauri::command]
fn ping() -> String {
    "ANAHAT // SYSTEMS NOMINAL".to_string()
}

/// Get current audio engine state
#[tauri::command]
fn get_audio_state(state: tauri::State<'_, std::sync::Mutex<AudioState>>) -> AudioUpdate {
    let s = state.lock().unwrap();
    AudioUpdate {
        is_playing: s.is_playing,
        carrier_hz: s.carrier_hz,
        offset_hz: s.offset_hz,
        amplitude: s.amplitude,
        harmonic_n: s.harmonic_n,
        harmonic_m: s.harmonic_m,
    }
}

/// Set harmonic parameters from frontend sliders
#[tauri::command]
fn set_harmonics(
    n: u32,
    m: u32,
    amplitude: f64,
    state: tauri::State<'_, std::sync::Mutex<AudioState>>,
) {
    let mut s = state.lock().unwrap();
    s.harmonic_n = n;
    s.harmonic_m = m;
    s.amplitude = amplitude;
}

/// Load a preset by updating audio state
#[tauri::command]
fn load_preset(
    preset_id: String,
    carrier_hz: f64,
    offset_hz: f64,
    harmonic_n: u32,
    harmonic_m: u32,
    state: tauri::State<'_, std::sync::Mutex<AudioState>>,
) {
    let mut s = state.lock().unwrap();
    s.active_preset_id = Some(preset_id);
    s.carrier_hz = carrier_hz;
    s.offset_hz = offset_hz;
    s.harmonic_n = harmonic_n;
    s.harmonic_m = harmonic_m;
    s.is_playing = true;
}

// ═══════════════════════════════════════════════════════════
// TRAY ICON SETUP
// ═══════════════════════════════════════════════════════════

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "Show Anahat").build(app)?;
    let play_pause_item = MenuItemBuilder::with_id("play_pause", "Play / Pause").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&play_pause_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("Anahat // Neuroacoustic Deck")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "play_pause" => {
                let _ = app.emit("tray-play-pause", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════
// APP BUILDER
// ═══════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(std::sync::Mutex::new(AudioState::default()))
        .invoke_handler(tauri::generate_handler![
            ping,
            get_audio_state,
            set_harmonics,
            load_preset,
        ])
        .setup(|app| {
            // Set up tray icon
            if let Err(e) = setup_tray(app) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Handle window close — hide to tray instead of quitting
            let window = app.get_webview_window("main").unwrap();
            let win_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Prevent the window from actually closing
                    api.prevent_close();
                    // Hide to system tray
                    let _ = win_clone.hide();
                    // Emit event so frontend can pause WebGL
                    let _ = win_clone.emit("window-hidden", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Anahat");
}
