fn main() {
    #[cfg(feature = "preview")]
    {
        for source in [
            "../src/index.html",
            "../src/style.css",
            "../src/renderer.js",
            "../src/server-view.js",
            "frontend-bridge.js",
            "prepare-assets.js",
        ] {
            println!("cargo:rerun-if-changed={source}");
        }
        let status = std::process::Command::new("node")
            .arg("prepare-assets.js")
            .status()
            .expect("Node.js is required");
        assert!(status.success(), "Failed to prepare Tauri assets");
        tauri_build::build();
    }
}
