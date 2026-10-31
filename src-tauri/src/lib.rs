pub mod audio;

use audio::AudioController;
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// High-level audio state payload sent to frontend
#[derive(Clone, Serialize)]
pub struct AudioStatusPayload {
    pub is_playing: bool,
    pub is_recording: bool,
    pub carrier_hz: f32,
    pub offset_hz: f32,
    pub amplitude: f32,
    pub harmonic_n: u32,
    pub harmonic_m: u32,
    pub waveform: String,
    pub noise_type: String,
    pub noise_blend_ratio: f32,
}

// ═══════════════════════════════════════════════════════════
// IPC COMMANDS — called from frontend via invoke()
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn ping() -> String {
    "ANAHAT // SYSTEMS NOMINAL".to_string()
}

#[tauri::command]
fn audio_play(audio: tauri::State<'_, Arc<AudioController>>) {
    audio.play();
}

#[tauri::command]
fn audio_pause(audio: tauri::State<'_, Arc<AudioController>>) {
    audio.pause();
}

#[tauri::command]
fn audio_toggle(audio: tauri::State<'_, Arc<AudioController>>) -> bool {
    audio.toggle_playback()
}

#[tauri::command]
fn audio_set_params(
    carrier_hz: Option<f32>,
    offset_hz: Option<f32>,
    amplitude: Option<f32>,
    harmonic_n: Option<u32>,
    harmonic_m: Option<u32>,
    waveform: Option<String>,
    noise_type: Option<String>,
    noise_blend_ratio: Option<f32>,
    audio: tauri::State<'_, Arc<AudioController>>,
) {
    audio.update_params(
        carrier_hz,
        offset_hz,
        amplitude,
        harmonic_n,
        harmonic_m,
        waveform,
        noise_type,
        noise_blend_ratio,
    );
}

#[tauri::command]
fn audio_start_recording(audio: tauri::State<'_, Arc<AudioController>>) {
    audio.start_recording();
}

#[tauri::command]
fn audio_stop_and_save(
    destination_path: String,
    audio: tauri::State<'_, Arc<AudioController>>,
) -> Result<usize, String> {
    audio.stop_and_save_wav(&destination_path)
}

#[tauri::command]
fn audio_get_status(audio: tauri::State<'_, Arc<AudioController>>) -> AudioStatusPayload {
    let p = audio.params.lock().unwrap().clone();
    AudioStatusPayload {
        is_playing: audio.is_playing.load(Ordering::SeqCst),
        is_recording: audio.is_recording.load(Ordering::SeqCst),
        carrier_hz: p.carrier_hz,
        offset_hz: p.offset_hz,
        amplitude: p.amplitude,
        harmonic_n: p.harmonic_n,
        harmonic_m: p.harmonic_m,
        waveform: p.waveform,
        noise_type: p.noise_type,
        noise_blend_ratio: p.noise_blend_ratio,
    }
}

// ═══════════════════════════════════════════════════════════
// TRAY ICON SETUP
// ═══════════════════════════════════════════════════════════

fn setup_tray(app: &tauri::App, audio: Arc<AudioController>) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "Show Anahat").build(app)?;
    let play_pause_item = MenuItemBuilder::with_id("play_pause", "Play / Pause").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&play_pause_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let audio_clone = audio.clone();

    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("Anahat // Neuroacoustic Sound Deck")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "play_pause" => {
                let is_playing = audio_clone.toggle_playback();
                let _ = app.emit("tray-playback-changed", is_playing);
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
    let audio_controller = Arc::new(AudioController::init().expect("Failed to initialize audio engine"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(audio_controller.clone())
        .invoke_handler(tauri::generate_handler![
            ping,
            audio_play,
            audio_pause,
            audio_toggle,
            audio_set_params,
            audio_start_recording,
            audio_stop_and_save,
            audio_get_status,
        ])
        .setup(move |app| {
            // Set up system tray icon
            if let Err(e) = setup_tray(app, audio_controller.clone()) {
                eprintln!("[Tray] Failed to setup tray: {}", e);
            }

            // Window close intercepted -> hide to system tray (audio persists seamlessly)
            let window = app.get_webview_window("main").unwrap();
            let win_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_clone.hide();
                    let _ = win_clone.emit("window-hidden", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Anahat");
}
