use std::num::NonZeroU32;
use std::path::Path;
use std::sync::{Mutex, Once};
use std::time::{Duration, Instant};

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaChatTemplate, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

use crate::llm::{parse_tool_calls, tools_preamble, CompleteResult, LlmMessage, LlmTool};

/// Drop order is declaration order. llama.cpp must `llama_free_model` before
/// `llama_backend_free` or Metal/Vulkan weights can stay allocated.
/// llama-cpp-2's `LlamaBackend::init` is a process-wide AtomicBool; Drop is
/// what clears it, so a second load without dropping the first is
/// `BackendAlreadyInitialized`.
struct Loaded {
    model: LlamaModel,
    filename: String,
    last_used: Instant,
    backend: LlamaBackend,
}

static LOADED: Mutex<Option<Loaded>> = Mutex::new(None);

/// Weights stay on the GPU until we drop the model. Five quiet minutes is long
/// enough that a pause does not reload, short enough the tray is not 5GB idle.
const IDLE_UNLOAD: Duration = Duration::from_secs(5 * 60);

pub fn available() -> bool {
    true
}

pub fn backend_name() -> &'static str {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        "metal"
    }
    #[cfg(target_os = "android")]
    {
        "vulkan"
    }
}

pub fn ram_hint_mb() -> u64 {
    #[cfg(target_os = "android")]
    {
        return meminfo_total_mb();
    }
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        return darwin_mem_mb();
    }
    #[cfg(not(any(target_os = "android", target_os = "ios", target_os = "macos")))]
    {
        0
    }
}

#[cfg(target_os = "android")]
fn meminfo_total_mb() -> u64 {
    let Ok(text) = std::fs::read_to_string("/proc/meminfo") else {
        return 0;
    };
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            let kb: u64 = rest
                .split_whitespace()
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            return kb / 1024;
        }
    }
    0
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn darwin_mem_mb() -> u64 {
    let mut size: u64 = 0;
    let mut len = std::mem::size_of::<u64>();
    let name = std::ffi::CString::new("hw.memsize").unwrap_or_default();
    let rc = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            &mut size as *mut u64 as *mut libc::c_void,
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if rc == 0 {
        size / 1024 / 1024
    } else {
        0
    }
}

pub fn loaded_name() -> Option<String> {
    LOADED.lock().ok()?.as_ref().map(|l| l.filename.clone())
}

pub fn load(path: &Path, filename: String) -> Result<(), String> {
    let mut slot = LOADED.lock().map_err(|e| e.to_string())?;
    *slot = None;
    let backend = LlamaBackend::init().map_err(|e| e.to_string())?;
    let params = LlamaModelParams::default().with_n_gpu_layers(99);
    let model = LlamaModel::load_from_file(&backend, path, &params).map_err(|e| e.to_string())?;
    *slot = Some(Loaded {
        model,
        filename,
        last_used: Instant::now(),
        backend,
    });
    start_idle_reaper();
    Ok(())
}

pub fn unload() {
    if let Ok(mut slot) = LOADED.lock() {
        *slot = None;
    }
}

fn start_idle_reaper() {
    static START: Once = Once::new();
    START.call_once(|| {
        let _ = std::thread::Builder::new()
            .name("moya-gguf-idle".into())
            .spawn(|| loop {
                std::thread::sleep(Duration::from_secs(20));
                let Ok(mut slot) = LOADED.lock() else { continue };
                let Some(loaded) = slot.as_ref() else { continue };
                if loaded.last_used.elapsed() >= IDLE_UNLOAD {
                    *slot = None;
                }
            });
    });
}

pub fn complete(
    messages: &[LlmMessage],
    tools: &[LlmTool],
    max_tokens: u32,
    temperature: f32,
) -> Result<CompleteResult, String> {
    let mut slot = LOADED.lock().map_err(|e| e.to_string())?;
    let loaded = slot
        .as_mut()
        .ok_or_else(|| "Load a GGUF first.".to_string())?;
    loaded.last_used = Instant::now();
    let prompt = build_prompt(&loaded.model, messages, tools)?;
    let n_ctx = if ram_hint_mb() >= 6144 { 4096 } else { 2048 };
    // Default llama.cpp n_batch is 2048. The Rust LlamaBatch was hard-capped at 512, so
    // Talk (catalog tools in every prompt) died with `Insufficient Space of 512`.
    let n_batch = n_ctx;
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(NonZeroU32::new(n_ctx).unwrap()))
        .with_n_batch(n_batch);
    let mut ctx = loaded
        .model
        .new_context(&loaded.backend, ctx_params)
        .map_err(|e| e.to_string())?;
    let tokens = loaded
        .model
        .str_to_token(&prompt, AddBos::Always)
        .map_err(|e| e.to_string())?;
    if tokens.is_empty() {
        return Err("Empty prompt.".into());
    }
    if tokens.len() >= n_ctx as usize {
        return Err(format!(
            "Prompt is {} tokens; context is {}. Shorten the conversation or pick a smaller model.",
            tokens.len(),
            n_ctx
        ));
    }
    let mut batch = LlamaBatch::new(n_batch as usize, 1);
    let last = (tokens.len() - 1) as i32;
    for (i, token) in tokens.iter().copied().enumerate() {
        batch
            .add(token, i as i32, &[0], i as i32 == last)
            .map_err(|e| e.to_string())?;
    }
    ctx.decode(&mut batch).map_err(|e| e.to_string())?;
    let mut sampler = if temperature <= 0.05 {
        LlamaSampler::greedy()
    } else {
        LlamaSampler::chain_simple([LlamaSampler::temp(temperature), LlamaSampler::dist(1234)])
    };
    let mut decoder = encoding_rs::UTF_8.new_decoder();
    let mut n_cur = tokens.len() as i32;
    let mut pieces = String::new();
    let room = n_ctx as i32 - n_cur;
    let limit = n_cur + (max_tokens as i32).min(room);
    while n_cur < limit {
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(token);
        if loaded.model.is_eog_token(token) {
            break;
        }
        let piece = loaded
            .model
            .token_to_piece(token, &mut decoder, true, None)
            .map_err(|e| e.to_string())?;
        pieces.push_str(&piece);
        batch.clear();
        batch
            .add(token, n_cur, &[0], true)
            .map_err(|e| e.to_string())?;
        ctx.decode(&mut batch).map_err(|e| e.to_string())?;
        n_cur += 1;
    }
    let (content, tool_calls) = parse_tool_calls(&pieces);
    loaded.last_used = Instant::now();
    Ok(CompleteResult {
        ok: true,
        content,
        tool_calls,
        error: None,
    })
}

fn build_prompt(
    model: &LlamaModel,
    messages: &[LlmMessage],
    tools: &[LlmTool],
) -> Result<String, String> {
    let preamble = tools_preamble(tools);
    let mut chat = Vec::new();
    if !preamble.is_empty() {
        chat.push(LlamaChatMessage::new("system".into(), preamble).map_err(|e| e.to_string())?);
    }
    for msg in messages {
        let mut content = msg.content.clone();
        if let Some(calls) = &msg.tool_calls {
            for call in calls {
                if let Some(fn_) = &call.function {
                    content.push_str(&format!(
                        "\n<tool_call>{{\"name\":\"{}\",\"arguments\":{}}}</tool_call>",
                        fn_.name,
                        if fn_.arguments.is_empty() {
                            "{}"
                        } else {
                            &fn_.arguments
                        }
                    ));
                }
            }
        }
        chat.push(LlamaChatMessage::new(msg.role.clone(), content).map_err(|e| e.to_string())?);
    }
    let tmpl = match model.chat_template(None) {
        Ok(tmpl) => tmpl,
        Err(_) => match LlamaChatTemplate::new("gemma") {
            Ok(tmpl) => tmpl,
            Err(_) => return Ok(fallback_prompt(messages, tools)),
        },
    };
    match model.apply_chat_template(&tmpl, &chat, true) {
        Ok(prompt) => Ok(prompt),
        Err(_) => Ok(fallback_prompt(messages, tools)),
    }
}

fn fallback_prompt(messages: &[LlmMessage], tools: &[LlmTool]) -> String {
    let mut out = tools_preamble(tools);
    for msg in messages {
        out.push_str(&format!("{}: {}\n", msg.role, msg.content));
    }
    out.push_str("assistant: ");
    out
}
