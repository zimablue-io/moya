fn main() {
    tauri_build::build();

    let macos = std::env::var("CARGO_CFG_TARGET_OS").ok().as_deref() == Some("macos");
    if !macos {
        return;
    }

    println!("cargo:rerun-if-changed=src/macos_media.m");
    println!("cargo:rerun-if-changed=Info.plist");
    // Apple Clang defaults an unscoped .m to macOS 10.13. Speech and mic
    // authorization APIs are 10.15 / 10.14, which is also Tauri 2's floor.
    cc::Build::new()
        .file("src/macos_media.m")
        .flag("-fobjc-arc")
        .flag("-mmacosx-version-min=10.15")
        .compile("moya_media");
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=Speech");

    // `tauri dev` runs a naked binary. Embed the usage strings so TCC can prompt.
    if let Ok(plist) = std::fs::canonicalize("Info.plist") {
        println!(
            "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
            plist.display()
        );
    }
}
