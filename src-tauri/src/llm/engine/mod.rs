//! In-process llama.cpp.
//!
//! Linked today: macOS Metal, iOS Metal, Android Vulkan.
//! Not linked: Windows and Linux — keep the stub until a Vulkan/CPU build is
//! proven. Enabling those OSes is this file's `cfg` plus a `Cargo.toml` target.

#[cfg(any(target_os = "android", target_os = "ios", target_os = "macos"))]
mod llama;
#[cfg(any(target_os = "android", target_os = "ios", target_os = "macos"))]
pub use llama::{available, backend_name, complete, load, loaded_name, ram_hint_mb, unload};

#[cfg(not(any(target_os = "android", target_os = "ios", target_os = "macos")))]
mod stub;
#[cfg(not(any(target_os = "android", target_os = "ios", target_os = "macos")))]
pub use stub::{available, backend_name, complete, load, loaded_name, ram_hint_mb, unload};
