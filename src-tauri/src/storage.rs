use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

pub const MAX_FILE_BYTES: usize = 64 * 1024 * 1024;
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";

#[derive(Default)]
pub struct DesktopState {
    allowed_projects: Mutex<HashSet<PathBuf>>,
    // Serializes draft access; the frontend queues writes and clears in document order.
    pub autosave_lock: Mutex<()>,
}

impl DesktopState {
    pub fn authorize(&self, path: PathBuf) -> Result<(), String> {
        self.allowed_projects
            .lock()
            .map_err(|_| "Project access state is unavailable. Please restart DRAW!.".to_string())?
            .insert(path);
        Ok(())
    }

    pub fn authorized_path(&self, path: &str) -> Result<Option<PathBuf>, String> {
        let candidate = match normalize_target(Path::new(path)) {
            Ok(path) => path,
            Err(_) => return Ok(None),
        };
        let allowed = self.allowed_projects.lock().map_err(|_| {
            "Project access state is unavailable. Please restart DRAW!.".to_string()
        })?;
        Ok(allowed.contains(&candidate).then_some(candidate))
    }
}

pub fn validate_contents(contents: &str) -> Result<(), String> {
    if contents.is_empty() {
        return Err("The project is empty.".into());
    }
    if contents.len() > MAX_FILE_BYTES {
        return Err("The project exceeds the 64 MiB size limit.".into());
    }
    Ok(())
}

pub fn read_project(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|error| format!("Cannot open project: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Cannot inspect project: {error}"))?;
    if !metadata.is_file() {
        return Err("Please select a project file.".into());
    }
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err("The project exceeds the 64 MiB size limit.".into());
    }
    // Also bound the read in case the file grows after inspecting its metadata.
    let mut bytes = Vec::new();
    file.take((MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Cannot read project: {error}"))?;
    let contents = String::from_utf8(bytes)
        .map_err(|_| "The project is not a UTF-8 text file.".to_string())?;
    validate_contents(&contents)?;
    Ok(contents)
}

pub fn normalize_target(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Please choose an absolute file path.".into());
    }
    if path.exists() {
        if !path.is_file() {
            return Err("The selected path is not a file.".into());
        }
        return fs::canonicalize(path)
            .map_err(|error| format!("Cannot resolve the selected file: {error}"));
    }
    let parent = path
        .parent()
        .ok_or_else(|| "The selected folder is unavailable.".to_string())?;
    let filename = path
        .file_name()
        .ok_or_else(|| "Please choose a file name.".to_string())?;
    let parent = fs::canonicalize(parent)
        .map_err(|error| format!("Cannot access the selected folder: {error}"))?;
    Ok(parent.join(filename))
}

pub fn path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "This file name cannot be represented as text. Please rename it.".into())
}

pub fn suggested_filename(name: &str, extension: &str) -> String {
    let basename = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let clean: String = basename
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"|?*".contains(*c))
        .take(120)
        .collect();
    let clean = clean.trim_matches([' ', '.']);
    let name = if clean.is_empty() { "Untitled" } else { clean };
    let suffix = format!(".{extension}");
    if name.to_ascii_lowercase().ends_with(&suffix) {
        name.to_owned()
    } else {
        format!("{name}{suffix}")
    }
}

pub fn decode_png(data_url: &str) -> Result<Vec<u8>, String> {
    let encoded = data_url
        .strip_prefix(PNG_DATA_URL_PREFIX)
        .ok_or_else(|| "Only PNG image data can be exported.".to_string())?;
    if encoded.len() > MAX_FILE_BYTES.div_ceil(3) * 4 {
        return Err("The PNG exceeds the 64 MiB size limit.".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "The PNG image data is invalid.".to_string())?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err("The PNG exceeds the 64 MiB size limit.".into());
    }
    if bytes.len() < 33 || !bytes.starts_with(PNG_SIGNATURE) || &bytes[12..16] != b"IHDR" {
        return Err("The image is not a valid PNG file.".into());
    }
    Ok(bytes)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err("The file exceeds the 64 MiB size limit.".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "The destination folder is unavailable.".to_string())?;
    // Keep the temporary file on the same filesystem. A failed write leaves the old file intact.
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Cannot create a temporary file in this folder: {error}"))?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Cannot write the file: {error}"))?;
    temporary
        .persist(path)
        .map_err(|error| format!("Cannot replace the destination file: {}", error.error))?;
    Ok(())
}

pub fn read_autosave_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    read_project(path).map(Some)
}

pub fn clear_autosave_file(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Cannot remove the recovery draft: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_replacement_round_trips_unicode_without_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("作品.draw");
        atomic_write(&target, b"old").unwrap();
        let contents = "{\"name\":\"新作品\"}";
        atomic_write(&target, contents.as_bytes()).unwrap();
        assert_eq!(read_project(&target).unwrap(), contents);
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_replacement_does_not_remove_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("existing-directory");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep.txt"), b"keep").unwrap();
        assert!(atomic_write(&target, b"new").is_err());
        assert_eq!(fs::read(target.join("keep.txt")).unwrap(), b"keep");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn only_dialog_authorized_paths_can_be_reused() {
        let directory = tempfile::tempdir().unwrap();
        let chosen = normalize_target(&directory.path().join("chosen.draw")).unwrap();
        let other = directory.path().join("other.draw");
        let state = DesktopState::default();
        assert!(state.authorized_path(chosen.to_str().unwrap()).unwrap().is_none());
        state.authorize(chosen.clone()).unwrap();
        assert_eq!(state.authorized_path(chosen.to_str().unwrap()).unwrap(), Some(chosen));
        assert!(state.authorized_path(other.to_str().unwrap()).unwrap().is_none());
        assert!(state.authorized_path("relative.draw").unwrap().is_none());
    }

    #[test]
    fn oversized_and_non_utf8_projects_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("large.draw");
        File::create(&target).unwrap().set_len(MAX_FILE_BYTES as u64 + 1).unwrap();
        assert!(read_project(&target).unwrap_err().contains("64 MiB"));
        fs::write(&target, [0xff, 0xfe]).unwrap();
        assert!(read_project(&target).unwrap_err().contains("UTF-8"));
        assert!(validate_contents("").is_err());
    }

    #[test]
    fn png_export_rejects_other_formats_and_invalid_base64() {
        assert!(decode_png("data:image/jpeg;base64,AAAA").is_err());
        assert!(decode_png("data:image/png;base64,not-base64!").is_err());
        assert!(decode_png("data:image/png;base64,aGVsbG8=").is_err());
        let one_pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=";
        assert!(decode_png(one_pixel).unwrap().starts_with(PNG_SIGNATURE));
    }

    #[test]
    fn autosave_can_be_recovered_and_cleared_repeatedly() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("recovery.draw");
        assert_eq!(read_autosave_file(&target).unwrap(), None);
        atomic_write(&target, b"{\"draft\":true}").unwrap();
        assert_eq!(read_autosave_file(&target).unwrap(), Some("{\"draft\":true}".into()));
        clear_autosave_file(&target).unwrap();
        clear_autosave_file(&target).unwrap();
        assert_eq!(read_autosave_file(&target).unwrap(), None);
    }

    #[test]
    fn suggested_names_never_include_parent_paths() {
        assert_eq!(suggested_filename("../../picture", "png"), "picture.png");
        assert_eq!(suggested_filename("C:\\temp\\name.draw", "draw"), "name.draw");
        assert_eq!(suggested_filename("...", "draw"), "Untitled.draw");
    }
}
