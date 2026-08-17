use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Auth {
    Prompt,
    Denied,
    Restricted,
    Granted,
}

#[derive(Clone, Debug, Serialize)]
pub struct MediaAuth {
    pub microphone: Auth,
    pub speech: Auth,
}

#[tauri::command]
pub async fn media_permission_status() -> MediaAuth {
    status()
}

#[tauri::command]
pub async fn request_media_permission() -> MediaAuth {
    match tauri::async_runtime::spawn_blocking(request).await {
        Ok(auth) => auth,
        Err(_) => status(),
    }
}

#[tauri::command]
pub fn open_media_settings(pane: String) {
    open_privacy_pane(&pane);
}

fn status() -> MediaAuth {
    #[cfg(target_os = "macos")]
    {
        MediaAuth {
            microphone: av_auth(unsafe { sys::moya_mic_auth_status() }),
            speech: sf_auth(unsafe { sys::moya_speech_auth_status() }),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        MediaAuth {
            microphone: Auth::Prompt,
            speech: Auth::Prompt,
        }
    }
}

fn request() -> MediaAuth {
    #[cfg(target_os = "macos")]
    {
        wait_callback(|ctx| unsafe { sys::moya_request_mic_access(on_i32, ctx) });
        wait_callback(|ctx| unsafe { sys::moya_request_speech_access(on_i32, ctx) });
    }
    status()
}

fn open_privacy_pane(pane: &str) {
    #[cfg(target_os = "macos")]
    {
        let key = if pane == "speech" {
            "Privacy_SpeechRecognition"
        } else {
            "Privacy_Microphone"
        };
        let modern =
            format!("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?{key}");
        let legacy = format!("x-apple.systempreferences:com.apple.preference.security?{key}");
        if !open_url(&modern) {
            let _ = open_url(&legacy);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pane;
    }
}

#[cfg(target_os = "macos")]
fn open_url(url: &str) -> bool {
    std::process::Command::new("open")
        .arg(url)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// AVAuthorizationStatus: 0 notDetermined, 1 restricted, 2 denied, 3 authorized.
#[cfg(target_os = "macos")]
fn av_auth(code: i32) -> Auth {
    match code {
        1 => Auth::Restricted,
        2 => Auth::Denied,
        3 => Auth::Granted,
        _ => Auth::Prompt,
    }
}

/// SFSpeechRecognizerAuthorizationStatus: 0 notDetermined, 1 denied, 2 restricted, 3 authorized.
#[cfg(target_os = "macos")]
fn sf_auth(code: i32) -> Auth {
    match code {
        1 => Auth::Denied,
        2 => Auth::Restricted,
        3 => Auth::Granted,
        _ => Auth::Prompt,
    }
}

#[cfg(target_os = "macos")]
mod sys {
    use std::ffi::c_void;

    extern "C" {
        pub fn moya_mic_auth_status() -> i32;
        pub fn moya_speech_auth_status() -> i32;
        pub fn moya_request_mic_access(cb: extern "C" fn(i32, *mut c_void), ctx: *mut c_void);
        pub fn moya_request_speech_access(cb: extern "C" fn(i32, *mut c_void), ctx: *mut c_void);
    }
}

#[cfg(target_os = "macos")]
extern "C" fn on_i32(value: i32, ctx: *mut std::ffi::c_void) {
    let tx = unsafe { Box::from_raw(ctx as *mut std::sync::mpsc::Sender<i32>) };
    let _ = tx.send(value);
}

#[cfg(target_os = "macos")]
fn wait_callback(start: impl FnOnce(*mut std::ffi::c_void)) {
    let (tx, rx) = std::sync::mpsc::channel::<i32>();
    let ctx = Box::into_raw(Box::new(tx)) as *mut std::ffi::c_void;
    start(ctx);
    let _ = rx.recv_timeout(std::time::Duration::from_secs(180));
}
