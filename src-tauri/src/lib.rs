mod storage;
mod lifecycle;

use lifecycle::ExitGuard;
use serde::Serialize;
use std::path::PathBuf;
use storage::{
    atomic_write, clear_autosave_file, decode_png, normalize_target, path_string,
    read_autosave_file, read_project, suggested_filename, validate_contents, DesktopState,
};
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem, Submenu}, AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct OpenedProject {
    path: String,
    contents: String,
}

// Native dialogs and disk I/O never block the webview/main event loop.
async fn file_task<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| "The file operation could not finish. Please try again.".to_string())?
}

fn autosave_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot locate the recovery folder: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create the recovery folder: {error}"))?;
    Ok(directory.join("recovery.draw"))
}

#[tauri::command]
async fn open_project(app: AppHandle) -> Result<Option<OpenedProject>, String> {
    file_task(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Open DRAW! project")
            .add_filter("DRAW! project", &["draw"]);
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let Some(selected) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let selected = selected
            .into_path()
            .map_err(|error| format!("Cannot access the selected file: {error}"))?;
        let path = normalize_target(&selected)?;
        let contents = read_project(&path)?;
        let display_path = path_string(&path)?;
        app.state::<DesktopState>().authorize(path)?;
        Ok(Some(OpenedProject {
            path: display_path,
            contents,
        }))
    })
    .await
}

#[tauri::command]
async fn save_project(
    app: AppHandle,
    contents: String,
    path: Option<String>,
    suggested_name: String,
) -> Result<Option<String>, String> {
    file_task(move || {
        validate_contents(&contents)?;
        let state = app.state::<DesktopState>();
        let approved = match path {
            Some(path) => state.authorized_path(&path)?,
            None => None,
        };
        let target = match approved {
            Some(path) => path,
            None => {
                // A path supplied by JavaScript is never enough to grant write access.
                let mut dialog = app
                    .dialog()
                    .file()
                    .set_title("Save DRAW! project")
                    .add_filter("DRAW! project", &["draw"])
                    .set_file_name(suggested_filename(&suggested_name, "draw"));
                if let Some(window) = app.get_webview_window("main") {
                    dialog = dialog.set_parent(&window);
                }
                let Some(selected) = dialog.blocking_save_file() else {
                    return Ok(None);
                };
                let selected = selected
                    .into_path()
                    .map_err(|error| format!("Cannot access the selected file: {error}"))?;
                normalize_target(&selected)?
            }
        };
        let display_path = path_string(&target)?;
        atomic_write(&target, contents.as_bytes())?;
        state.authorize(target)?;
        Ok(Some(display_path))
    })
    .await
}

#[tauri::command]
async fn export_png(
    app: AppHandle,
    data_url: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    file_task(move || {
        let bytes = decode_png(&data_url)?;
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Export PNG")
            .add_filter("PNG image", &["png"])
            .set_file_name(suggested_filename(&suggested_name, "png"));
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let Some(selected) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let selected = selected
            .into_path()
            .map_err(|error| format!("Cannot access the selected file: {error}"))?;
        let target = normalize_target(&selected)?;
        let display_path = path_string(&target)?;
        atomic_write(&target, &bytes)?;
        Ok(Some(display_path))
    })
    .await
}

#[tauri::command]
async fn write_autosave(app: AppHandle, contents: String) -> Result<(), String> {
    file_task(move || {
        validate_contents(&contents)?;
        let state = app.state::<DesktopState>();
        let _guard = state
            .autosave_lock
            .lock()
            .map_err(|_| "Recovery storage is unavailable. Please restart DRAW!.".to_string())?;
        atomic_write(&autosave_path(&app)?, contents.as_bytes())
    })
    .await
}

#[tauri::command]
async fn read_autosave(app: AppHandle) -> Result<Option<String>, String> {
    file_task(move || {
        let state = app.state::<DesktopState>();
        let _guard = state
            .autosave_lock
            .lock()
            .map_err(|_| "Recovery storage is unavailable. Please restart DRAW!.".to_string())?;
        read_autosave_file(&autosave_path(&app)?)
    })
    .await
}

#[tauri::command]
async fn clear_autosave(app: AppHandle) -> Result<(), String> {
    file_task(move || {
        let state = app.state::<DesktopState>();
        let _guard = state
            .autosave_lock
            .lock()
            .map_err(|_| "Recovery storage is unavailable. Please restart DRAW!.".to_string())?;
        clear_autosave_file(&autosave_path(&app)?)
    })
    .await
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.state::<ExitGuard>().approve();
    app.exit(0);
}

fn request_quit(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // The frontend shares its save/discard/cancel transaction with window close.
        if let Err(error) = window.emit("draw:quit-requested", ()) {
            eprintln!("Could not request a safe shutdown: {error}");
        }
    } else {
        app.exit(0);
    }
}

fn application_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // Do not use PredefinedMenuItem::quit: on macOS it calls terminate: directly,
    // bypassing the webview close handler and the cancellable ExitRequested event.
    let quit = MenuItem::with_id(app, "draw-quit", "Quit DRAW!", true, Some("CmdOrCtrl+Q"))?;
    let file = Submenu::with_items(app, "File", true, &[
        &PredefinedMenuItem::close_window(app, None)?,
        #[cfg(not(target_os = "macos"))]
        &quit,
    ])?;
    // Keep native clipboard actions for text fields. Canvas undo/redo stays with
    // the frontend instead of being swallowed by native Cmd/Ctrl+Z menu items.
    let edit = Submenu::with_items(app, "Edit", true, &[
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;
    #[cfg(target_os = "macos")]
    let application = Submenu::with_items(app, "DRAW", true, &[
        &PredefinedMenuItem::about(app, Some("About DRAW!"), None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::services(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])?;
    Menu::with_items(app, &[
        #[cfg(target_os = "macos")]
        &application,
        &file,
        &edit,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DesktopState::default())
        .manage(ExitGuard::default())
        .menu(application_menu)
        .on_menu_event(|app, event| {
            if event.id() == "draw-quit" {
                request_quit(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_project,
            save_project,
            export_png,
            write_autosave,
            read_autosave,
            clear_autosave,
            exit_app,
        ])
        .build(tauri::generate_context!())
        .expect("Could not start DRAW!");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let has_main_window = app.get_webview_window("main").is_some();
            if app.state::<ExitGuard>().needs_confirmation(has_main_window) {
                api.prevent_exit();
                request_quit(app);
            }
        }
    });
}
