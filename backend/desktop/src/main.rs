#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use auction_core::Store;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn request(
    action: String,
    payload: serde_json::Value,
    store: State<'_, Mutex<Store>>,
) -> Result<serde_json::Value, String> {
    store
        .lock()
        .map_err(|_| "Database lock failed".to_string())?
        .dispatch(&action, payload)
}

#[tauri::command]
fn open_url(url: String, app: tauri::AppHandle) -> Result<(), String> {
    auction_core::valuation::validate_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("auction-helper.db");
            let store = Store::open(&path).map_err(std::io::Error::other)?;
            app.manage(Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![request, open_url])
        .run(tauri::generate_context!())
        .expect("Could not start Auction Helper");
}
