#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use auction_core::Store;
use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

struct WorkspaceState {
    path: PathBuf,
    store: Option<Store>,
}

impl WorkspaceState {
    fn request(
        &mut self,
        action: &str,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        if let Some(store) = self.store.as_mut() {
            return store.dispatch(action, payload);
        }
        let mut store = Store::open(&self.path)?;
        let result = store.dispatch(action, payload);
        self.store = Some(store);
        result
    }
}

#[tauri::command]
fn request(
    action: String,
    payload: serde_json::Value,
    store: State<'_, Mutex<WorkspaceState>>,
) -> Result<serde_json::Value, String> {
    store
        .lock()
        .map_err(|_| "Database lock failed".to_string())?
        .request(&action, payload)
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
            app.manage(Mutex::new(WorkspaceState { path, store: None }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![request, open_url])
        .run(tauri::generate_context!())
        .expect("Could not start Auction Helper");
}
