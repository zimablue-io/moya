/// Native Open dialog when this OS can return a real filesystem path.
/// Phone/tablet sandboxes cannot; they download into app data instead.
/// Windows/Linux compile this but the engine is still a stub, so this
/// returns `None` until llama.cpp is linked there.
pub async fn pick_gguf() -> Result<Option<String>, String> {
    if !super::paths::can_pick_from_disk() {
        return Ok(None);
    }
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        let mut dialog = rfd::AsyncFileDialog::new().add_filter("GGUF", &["gguf"]);
        if let Some(dir) = super::paths::user_models_dirs().into_iter().next() {
            dialog = dialog.set_directory(dir);
        }
        Ok(dialog
            .pick_file()
            .await
            .map(|file| file.path().to_string_lossy().into_owned()))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(None)
    }
}
