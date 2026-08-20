use std::path::Path;

use crate::llm::{CompleteResult, LlmMessage, LlmTool};

pub fn available() -> bool {
    false
}

pub fn backend_name() -> &'static str {
    "none"
}

pub fn ram_hint_mb() -> u64 {
    0
}

pub fn loaded_name() -> Option<String> {
    None
}

pub fn load(_path: &Path, _filename: String) -> Result<(), String> {
    Err("On-device GGUF is for the Android and iOS apps. On this Mac run llama-server.".into())
}

pub fn unload() {}

pub fn complete(
    _messages: &[LlmMessage],
    _tools: &[LlmTool],
    _max_tokens: u32,
    _temperature: f32,
) -> Result<CompleteResult, String> {
    Ok(CompleteResult {
        ok: false,
        content: String::new(),
        tool_calls: vec![],
        error: Some(
            "On-device GGUF is for the Android and iOS apps. On this Mac run llama-server.".into(),
        ),
    })
}
