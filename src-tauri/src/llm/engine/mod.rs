#[cfg(any(target_os = "android", target_os = "ios"))]
mod llama;
#[cfg(any(target_os = "android", target_os = "ios"))]
pub use llama::{available, backend_name, complete, load, loaded_name, ram_hint_mb, unload};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod stub;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use stub::{available, backend_name, complete, load, loaded_name, ram_hint_mb, unload};
