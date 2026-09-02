use std::fs;
use std::path::{Path, PathBuf};

use super::LlmFile;

/// Desktop OS that can expose a real filesystem path. Android/iOS are Unix
/// but sandboxed — do not scan `~/Documents/models` there.
pub fn scans_user_models() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

pub fn can_pick_from_disk() -> bool {
    super::engine::available() && scans_user_models()
}

pub fn is_sidecar_gguf(name: impl AsRef<Path>) -> bool {
    let name = name.as_ref();
    let base = name
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    base.starts_with("mmproj-") || base.starts_with("mtp-")
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Folders a desktop user may already keep GGUFs in. Empty on phone/tablet.
pub fn user_models_dirs() -> Vec<PathBuf> {
    if !scans_user_models() {
        return vec![];
    }
    let Some(home) = home_dir() else {
        return vec![];
    };
    vec![home.join("Documents").join("models")]
}

pub fn download_filename(name: &str) -> Result<String, String> {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid filename.".to_string())?;
    if !base.ends_with(".gguf") || base.contains("..") {
        return Err("GGUF filename required.".into());
    }
    if is_sidecar_gguf(base) {
        return Err("That file is a projector or draft model, not a chat GGUF.".into());
    }
    Ok(base.to_string())
}

/// Unix `/…`, Windows `C:\…` / `C:/…`, and `~/…`.
pub fn is_absolute_spec(spec: &str) -> bool {
    if Path::new(spec).is_absolute() {
        return true;
    }
    let bytes = spec.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

pub fn resolve_gguf_path(app_gguf_dir: &Path, spec: &str) -> Result<PathBuf, String> {
    let spec = spec.trim();
    if spec.is_empty() || spec.contains("..") {
        return Err("GGUF path required.".into());
    }
    let path = if is_absolute_spec(spec) {
        PathBuf::from(spec)
    } else if let Some(rest) = spec.strip_prefix("~/") {
        let home = home_dir().ok_or_else(|| "No home directory.".to_string())?;
        home.join(rest)
    } else {
        let base = download_filename(spec)?;
        app_gguf_dir.join(base)
    };
    if path.extension().and_then(|s| s.to_str()) != Some("gguf") {
        return Err("GGUF filename required.".into());
    }
    if is_sidecar_gguf(&path) {
        return Err("That file is a projector or draft model, not a chat GGUF.".into());
    }
    Ok(path)
}

pub fn collect_ggufs(dir: &Path, out: &mut Vec<LlmFile>, depth: u32) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_ggufs(&path, out, depth + 1);
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) != Some("gguf") {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if is_sidecar_gguf(name) {
            continue;
        }
        let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(LlmFile {
            name: path.to_string_lossy().into_owned(),
            bytes,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_projector_and_draft_ggufs() {
        assert!(is_sidecar_gguf("mmproj-F16-gemma-4-E4B-it.gguf"));
        assert!(is_sidecar_gguf("mtp-gemma-4-E4B-it.gguf"));
        assert!(is_sidecar_gguf("/tmp/mmproj-x.gguf"));
        assert!(!is_sidecar_gguf("gemma-4-E4B-it-UD-Q4_K_XL.gguf"));
    }

    #[test]
    fn absolute_specs_include_windows_drive_letters() {
        assert!(is_absolute_spec("/Users/me/model.gguf"));
        assert!(is_absolute_spec(r"C:\models\gemma.gguf"));
        assert!(is_absolute_spec("D:/models/gemma.gguf"));
        assert!(!is_absolute_spec("gemma.gguf"));
        assert!(!is_absolute_spec("models/gemma.gguf"));
    }

    #[test]
    fn resolve_uses_app_dir_for_basenames() {
        let dir = PathBuf::from("/tmp/gguf");
        let path = resolve_gguf_path(&dir, "tiny.gguf").unwrap();
        assert_eq!(path, dir.join("tiny.gguf"));
    }

    #[test]
    fn resolve_keeps_absolute_and_home_paths() {
        let dir = PathBuf::from("/tmp/gguf");
        assert_eq!(
            resolve_gguf_path(&dir, "/opt/models/a.gguf").unwrap(),
            PathBuf::from("/opt/models/a.gguf")
        );
        let home = home_dir().expect("home");
        assert_eq!(
            resolve_gguf_path(&dir, "~/Documents/models/a.gguf").unwrap(),
            home.join("Documents/models/a.gguf")
        );
    }
}
