use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

const LLAMA_TAG: &str = "b10453";

#[derive(Default)]
pub struct EngineState {
    child: Mutex<Option<Child>>,
}

#[derive(Clone, Serialize)]
pub struct EngineStatus {
    pub installed: bool,
    pub running: bool,
    pub ready: bool,
    pub port: u16,
    pub pid: Option<u32>,
    pub binary: String,
    pub error: Option<String>,
    #[serde(rename = "logTail")]
    pub log_tail: String,
}

#[derive(Clone, Deserialize)]
pub struct EngineCfg {
    pub port: u16,
    #[serde(rename = "modelPath")]
    pub model_path: String,
    #[serde(rename = "hfRepo")]
    pub hf_repo: String,
    pub threads: u32,
    #[serde(rename = "gpuLayers")]
    pub gpu_layers: u32,
    pub ctx: u32,
}

fn data_dir() -> PathBuf {
    dirs_fallback()
}

fn dirs_fallback() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".moya");
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(profile).join(".moya");
    }
    std::env::temp_dir().join("moya")
}

fn bin_path() -> PathBuf {
    let name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    data_dir().join("bin").join(name)
}

fn asset() -> (&'static str, bool) {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            return (
                "llama-b10453-bin-macos-arm64.tar.gz",
                true,
            );
        }
        return ("llama-b10453-bin-macos-x64.tar.gz", true);
    }
    if cfg!(windows) {
        return ("llama-b10453-bin-win-cpu-x64.zip", false);
    }
    ("llama-b10453-bin-ubuntu-x64.tar.gz", true)
}

fn health(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    Command::new("curl")
        .args(["-sf", "--max-time", "1", &url])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn current(state: &EngineState, error: Option<String>) -> EngineStatus {
    let binary = bin_path();
    let installed = binary.exists();
    let guard = state.child.lock().unwrap();
    let running = guard
        .as_ref()
        .map(|c| c.id() != 0)
        .unwrap_or(false);
    let port = 8081;
    let ready = health(port);
    EngineStatus {
        installed,
        running: running || ready,
        ready,
        port,
        pid: guard.as_ref().map(|c| c.id()),
        binary: binary.display().to_string(),
        error,
        log_tail: String::new(),
    }
}

#[tauri::command]
pub fn engine_status(state: tauri::State<EngineState>) -> EngineStatus {
    current(&state, None)
}

#[tauri::command]
pub fn engine_install(state: tauri::State<EngineState>) -> EngineStatus {
    if let Err(e) = install_binary() {
        return current(&state, Some(e));
    }
    current(&state, None)
}

fn install_binary() -> Result<(), String> {
    let dest = bin_path();
    if dest.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    let (file, tar) = asset();
    let url = format!("https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}/{file}");
    let archive = data_dir().join(file);
    let curl = Command::new("curl")
        .args(["-L", "--fail", "-o"])
        .arg(&archive)
        .arg(&url)
        .status()
        .map_err(|e| e.to_string())?;
    if !curl.success() {
        return Err("Download failed (curl).".into());
    }
    if !tar {
        return Err("Unzip the Windows archive into ~/.moya/bin/llama-server.exe".into());
    }
    let status = Command::new("tar")
        .args(["-xzf", archive.to_str().unwrap_or(""), "-C"])
        .arg(data_dir())
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Could not unpack llama-server.".into());
    }
    let found = find_server(&data_dir()).ok_or_else(|| "Archive had no llama-server.".to_string())?;
    if found != dest {
        std::fs::copy(found, &dest).map_err(|e| e.to_string())?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
    }
    Ok(())
}

fn find_server(root: &PathBuf) -> Option<PathBuf> {
    fn walk(dir: &PathBuf, depth: u8) -> Option<PathBuf> {
        if depth > 4 {
            return None;
        }
        let entries = std::fs::read_dir(dir).ok()?;
        for e in entries.flatten() {
            let p = e.path();
            let name = p.file_name()?.to_string_lossy();
            if p.is_file() && (name == "llama-server" || name == "llama-server.exe") {
                return Some(p);
            }
            if p.is_dir() {
                if let Some(hit) = walk(&p, depth + 1) {
                    return Some(hit);
                }
            }
        }
        None
    }
    walk(root, 0)
}

#[tauri::command]
pub fn engine_start(state: tauri::State<EngineState>, cfg: EngineCfg) -> EngineStatus {
    if health(cfg.port) {
        return current(&state, None);
    }
    if !bin_path().exists() {
        let installed = install_binary();
        if let Err(e) = installed {
            return current(&state, Some(e));
        }
    }
    {
        let mut slot = state.child.lock().unwrap();
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
        }
    }
    let mut cmd = Command::new(bin_path());
    cmd.arg("--port")
        .arg(cfg.port.to_string())
        .arg("--ctx-size")
        .arg(cfg.ctx.max(512).to_string())
        .arg("--jinja")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if cfg.gpu_layers > 0 {
        cmd.arg("-ngl").arg(cfg.gpu_layers.to_string());
    }
    if cfg.threads > 0 {
        cmd.arg("--threads").arg(cfg.threads.to_string());
    }
    if !cfg.model_path.trim().is_empty() {
        cmd.arg("-m").arg(cfg.model_path.trim());
    } else if !cfg.hf_repo.trim().is_empty() {
        cmd.arg("-hf").arg(cfg.hf_repo.trim());
    } else {
        return current(&state, Some("Set a model path or Hugging Face repo.".into()));
    }
    match cmd.spawn() {
        Ok(child) => {
            *state.child.lock().unwrap() = Some(child);
        }
        Err(e) => return current(&state, Some(e.to_string())),
    }
    for _ in 0..40 {
        thread::sleep(Duration::from_millis(500));
        if health(cfg.port) {
            return current(&state, None);
        }
    }
    current(
        &state,
        Some("Engine started but /health is not up yet. It may still be loading a model.".into()),
    )
}

#[tauri::command]
pub fn engine_stop(state: tauri::State<EngineState>) -> EngineStatus {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    current(&state, None)
}
