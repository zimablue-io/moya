use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

mod engine;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStatus {
    pub available: bool,
    pub ready: bool,
    pub backend: String,
    pub loaded: Option<String>,
    pub ram_hint: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct LlmFile {
    pub name: String,
    pub bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub filename: String,
    pub received: u64,
    pub total: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[allow(dead_code)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub tool_calls: Option<Vec<InboundToolCall>>,
}

#[derive(Clone, Debug, Deserialize)]
#[allow(dead_code)]
pub struct InboundToolCall {
    pub id: Option<String>,
    pub function: Option<InboundFn>,
}

#[derive(Clone, Debug, Deserialize)]
#[allow(dead_code)]
pub struct InboundFn {
    pub name: String,
    #[serde(default)]
    pub arguments: String,
}

#[derive(Clone, Debug, Deserialize)]
#[allow(dead_code)]
pub struct LlmTool {
    pub function: LlmFunction,
}

#[derive(Clone, Debug, Deserialize)]
#[allow(dead_code)]
pub struct LlmFunction {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub parameters: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallOut {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteResult {
    pub ok: bool,
    pub content: String,
    pub tool_calls: Vec<ToolCallOut>,
    pub error: Option<String>,
}

fn gguf_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("gguf");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_filename(name: &str) -> Result<String, String> {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid filename.".to_string())?;
    if !base.ends_with(".gguf") || base.contains("..") {
        return Err("GGUF filename required.".into());
    }
    Ok(base.to_string())
}

fn status_now(loaded: Option<String>) -> LlmStatus {
    LlmStatus {
        available: engine::available(),
        ready: loaded.is_some() && engine::available(),
        backend: engine::backend_name().to_string(),
        loaded,
        ram_hint: engine::ram_hint_mb(),
    }
}

#[tauri::command]
pub fn llm_status() -> LlmStatus {
    status_now(engine::loaded_name())
}

#[tauri::command]
pub fn llm_list(app: AppHandle) -> Result<Vec<LlmFile>, String> {
    if !engine::available() {
        return Ok(vec![]);
    }
    let dir = gguf_dir(&app)?;
    let mut out = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("gguf") {
            continue;
        }
        let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            out.push(LlmFile {
                name: name.to_string(),
                bytes,
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub async fn llm_download(
    app: AppHandle,
    url: String,
    filename: String,
) -> Result<LlmFile, String> {
    if !engine::available() {
        return Err(
            "On-device GGUF is for the Android and iOS apps. On this Mac run llama-server.".into(),
        );
    }
    let filename = safe_filename(&filename)?;
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1")) {
        return Err("HTTPS GGUF URL required.".into());
    }
    let dir = gguf_dir(&app)?;
    let dest = dir.join(&filename);
    let tmp = dir.join(format!("{filename}.part"));
    let app2 = app.clone();
    let filename2 = filename.clone();
    tauri::async_runtime::spawn_blocking(move || {
        download_file(&app2, &url, &tmp, &dest, &filename2)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn download_file(
    app: &AppHandle,
    url: &str,
    tmp: &Path,
    dest: &Path,
    filename: &str,
) -> Result<LlmFile, String> {
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let total = resp
        .header("Content-Length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let mut reader = resp.into_reader();
    let mut file = fs::File::create(tmp).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 65_536];
    let mut received = 0u64;
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        received += n as u64;
        let _ = app.emit(
            "llm-download-progress",
            DownloadProgress {
                filename: filename.to_string(),
                received,
                total,
            },
        );
    }
    drop(file);
    fs::rename(tmp, dest).map_err(|e| e.to_string())?;
    Ok(LlmFile {
        name: filename.to_string(),
        bytes: received,
    })
}

#[tauri::command]
pub async fn llm_load(app: AppHandle, filename: String) -> Result<LlmStatus, String> {
    if !engine::available() {
        return Err(
            "On-device GGUF is for the Android and iOS apps. On this Mac run llama-server.".into(),
        );
    }
    let filename = safe_filename(&filename)?;
    let path = gguf_dir(&app)?.join(&filename);
    if !path.is_file() {
        return Err("That GGUF is not on this device yet.".into());
    }
    tauri::async_runtime::spawn_blocking(move || engine::load(&path, filename))
        .await
        .map_err(|e| e.to_string())??;
    Ok(status_now(engine::loaded_name()))
}

#[tauri::command]
pub async fn llm_unload() -> Result<LlmStatus, String> {
    tauri::async_runtime::spawn_blocking(engine::unload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(status_now(None))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn llm_complete(
    app: AppHandle,
    messages: Vec<LlmMessage>,
    tools: Vec<LlmTool>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    filename: Option<String>,
) -> Result<CompleteResult, String> {
    if !engine::available() {
        return Ok(CompleteResult {
            ok: false,
            content: String::new(),
            tool_calls: vec![],
            error: Some(
                "On-device GGUF is for the Android and iOS apps. On this Mac run llama-server."
                    .into(),
            ),
        });
    }
    if let Some(name) = filename.clone() {
        let name = safe_filename(&name)?;
        if engine::loaded_name().as_deref() != Some(name.as_str()) {
            let path = gguf_dir(&app)?.join(&name);
            if !path.is_file() {
                return Ok(CompleteResult {
                    ok: false,
                    content: String::new(),
                    tool_calls: vec![],
                    error: Some("Download or pick a GGUF first.".into()),
                });
            }
            let path2 = path.clone();
            let name2 = name.clone();
            tauri::async_runtime::spawn_blocking(move || engine::load(&path2, name2))
                .await
                .map_err(|e| e.to_string())??;
        }
    }
    let max_tokens = max_tokens.unwrap_or(900).min(2048);
    let temperature = temperature.unwrap_or(0.6);
    tauri::async_runtime::spawn_blocking(move || {
        engine::complete(&messages, &tools, max_tokens, temperature)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[allow(dead_code)]
pub fn parse_tool_calls(text: &str) -> (String, Vec<ToolCallOut>) {
    let mut calls = vec![];
    let mut rest = text.to_string();
    while let Some(start) = rest.find("<tool_call>") {
        let Some(end_rel) = rest[start..].find("</tool_call>") else {
            break;
        };
        let body_start = start + "<tool_call>".len();
        let body_end = start + end_rel;
        let body = rest[body_start..body_end].trim();
        if let Some(call) = tool_call_from_body(body, calls.len()) {
            calls.push(call);
        }
        rest.replace_range(start..body_end + "</tool_call>".len(), "");
    }
    if calls.is_empty() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(text.trim()) {
            if let Some(call) = tool_call_from_json(&value, 0) {
                return (String::new(), vec![call]);
            }
        }
    }
    (rest.trim().to_string(), calls)
}

#[allow(dead_code)]
fn tool_call_from_body(body: &str, index: usize) -> Option<ToolCallOut> {
    let trimmed = body.trim();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return tool_call_from_json(&value, index);
    }
    let mut lines = trimmed.lines().map(str::trim).filter(|l| !l.is_empty());
    let name = lines.next()?.to_string();
    let args = lines.collect::<Vec<_>>().join("\n");
    let arguments = if args.is_empty() {
        "{}".into()
    } else if serde_json::from_str::<serde_json::Value>(&args).is_ok() {
        args
    } else {
        serde_json::json!({ "input": args }).to_string()
    };
    Some(ToolCallOut {
        id: format!("call_{index}"),
        name,
        arguments,
    })
}

#[allow(dead_code)]
fn tool_call_from_json(value: &serde_json::Value, index: usize) -> Option<ToolCallOut> {
    let obj = value.as_object()?;
    let name = obj.get("name")?.as_str()?.to_string();
    let arguments = match obj.get("arguments") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
        None => "{}".into(),
    };
    Some(ToolCallOut {
        id: format!("call_{index}"),
        name,
        arguments,
    })
}

#[allow(dead_code)]
pub fn tools_preamble(tools: &[LlmTool]) -> String {
    if tools.is_empty() {
        return String::new();
    }
    let listed: Vec<serde_json::Value> = tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "name": t.function.name,
                "description": t.function.description,
                "parameters": t.function.parameters,
            })
        })
        .collect();
    format!(
        "You can call tools. When you need one, output only:\n<tool_call>{{\"name\":\"tool_name\",\"arguments\":{{}}}}</tool_call>\nTools: {}\n",
        serde_json::Value::Array(listed)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_xml_tool_call() {
        let (content, calls) = parse_tool_calls(
            "ok\n<tool_call>{\"name\":\"memory.write\",\"arguments\":{\"text\":\"hi\"}}</tool_call>",
        );
        assert_eq!(content, "ok");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "memory.write");
    }
}
