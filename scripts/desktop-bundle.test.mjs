import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
	assertDesktopFrontend,
	clearStaleDmgWork,
	desktopFrontendIndex,
	isStaleRwDmg,
	shouldEjectDmgVolume,
} from "./desktop-frontend.mjs"
import { DMG_APP, DMG_APPLICATIONS, DMG_BACKGROUND, DMG_WINDOW } from "./write-dmg-background.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const tauriDir = join(root, "src-tauri")
const confPath = join(tauriDir, "tauri.conf.json")

function readConf() {
	return JSON.parse(readFileSync(confPath, "utf8"))
}

test("every bundle icon in tauri.conf.json exists on disk", () => {
	const conf = readConf()
	const icons = conf.bundle?.icon
	assert.ok(Array.isArray(icons) && icons.length > 0, "bundle.icon must list icon files")
	for (const icon of icons) {
		assert.equal(existsSync(join(tauriDir, icon)), true, `tauri bundle icon missing: ${icon}`)
	}
})

test("listed .icns icons are Apple Icon Image files", () => {
	const conf = readConf()
	const icons = (conf.bundle?.icon ?? []).filter((icon) => icon.endsWith(".icns"))
	assert.ok(icons.length > 0, "macOS bundle needs an .icns icon")
	for (const icon of icons) {
		const bytes = readFileSync(join(tauriDir, icon))
		assert.equal(bytes.subarray(0, 4).toString("ascii"), "icns", `${icon} is not an icns file`)
	}
})

function makeFrontendWorkspace(html) {
	const workspace = mkdtempSync(join(tmpdir(), "moya-desktop-frontend-"))
	mkdirSync(join(workspace, "src-tauri"), { recursive: true })
	writeFileSync(
		join(workspace, "src-tauri/tauri.conf.json"),
		JSON.stringify({ build: { frontendDist: "../dist/client" } }),
	)
	mkdirSync(join(workspace, "dist/client"), { recursive: true })
	if (html !== undefined) {
		writeFileSync(join(workspace, "dist/client/index.html"), html)
	}
	return workspace
}

test("tauri.conf.json frontendDist is a relative path Tauri can resolve", () => {
	const { frontendDist } = desktopFrontendIndex(root)
	assert.equal(frontendDist, "../dist/client")
})

test("assertDesktopFrontend rejects a frontendDist without index.html", () => {
	const workspace = makeFrontendWorkspace()
	assert.throws(() => assertDesktopFrontend(workspace), /no index.html/)
})

test("assertDesktopFrontend accepts a bootable index.html", () => {
	const workspace = makeFrontendWorkspace(
		'<!DOCTYPE html><html><head></head><body><script src="./assets/app.js"></script></body></html>',
	)
	assert.equal(assertDesktopFrontend(workspace), join(workspace, "dist/client/index.html"))
})

test("build:desktop validates the frontend after vite", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	assert.match(pkg.scripts["build:desktop"], /desktop-frontend\.mjs/)
})

test("leftover create-dmg RW images next to Moya.app are stale", () => {
	assert.equal(isStaleRwDmg("rw.37179.Moya_0.1.6_aarch64.dmg"), true)
	assert.equal(isStaleRwDmg("Moya.app"), false)
	assert.equal(isStaleRwDmg("Moya_0.1.6_aarch64.dmg"), false)
	assert.equal(shouldEjectDmgVolume("Moya"), true)
	assert.equal(shouldEjectDmgVolume("Moya 1"), true)
	assert.equal(shouldEjectDmgVolume("dmg.j87AM9"), true)
	assert.equal(shouldEjectDmgVolume("Kabu Installer"), false)
	assert.equal(shouldEjectDmgVolume("Macintosh HD"), false)
})

test("clearStaleDmgWork deletes leftover RW images and ejects Moya volumes", () => {
	const workspace = mkdtempSync(join(tmpdir(), "moya-dmg-stale-"))
	const macos = join(workspace, "src-tauri/target/release/bundle/macos")
	mkdirSync(macos, { recursive: true })
	writeFileSync(join(macos, "rw.37179.Moya_0.1.6_aarch64.dmg"), "stale")
	writeFileSync(join(macos, "keep.txt"), "ok")
	const removed = []
	const detached = []
	const result = clearStaleDmgWork(workspace, {
		readdir: (dir) => (dir === "/Volumes" ? ["Macintosh HD", "Moya 1", "Kabu Installer"] : readdirSync(dir)),
		unlink: (path) => {
			removed.push(path)
			unlinkSync(path)
		},
		run: (cmd, args) => {
			assert.equal(cmd, "hdiutil")
			detached.push(args[1])
			return { status: 0, stdout: "", stderr: "" }
		},
	})
	assert.deepEqual(result.removed, ["rw.37179.Moya_0.1.6_aarch64.dmg"])
	assert.deepEqual(result.ejected, ["Moya 1"])
	assert.equal(existsSync(join(macos, "keep.txt")), true)
	assert.equal(existsSync(join(macos, "rw.37179.Moya_0.1.6_aarch64.dmg")), false)
	assert.deepEqual(detached, ["/Volumes/Moya 1"])
	assert.equal(removed.length, 1)
})

test("package:mac does not force CI so a local DMG can be a drag-to-Applications window", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	assert.equal(
		/\bCI=true\b/.test(pkg.scripts["package:mac"]),
		false,
		"CI=true skips Finder layout and leaves a huge empty folder window",
	)
	assert.match(pkg.scripts["package:mac"], /package-mac\.mjs/)
})

test("beforeBundleCommand ejects leftover Moya volumes right before the DMG, not only 40s earlier", () => {
	const conf = readConf()
	assert.match(conf.build?.beforeBundleCommand ?? "", /desktop-frontend\.mjs/)
})

test("DMG is a 660×400 drag-to-Applications window, not a default folder view", () => {
	const conf = readConf()
	const dmg = conf.bundle?.macOS?.dmg
	assert.equal(dmg?.background, DMG_BACKGROUND)
	assert.equal(existsSync(join(tauriDir, DMG_BACKGROUND)), true, `missing ${DMG_BACKGROUND}`)
	assert.equal(dmg?.windowSize?.width, DMG_WINDOW.width)
	assert.equal(dmg?.windowSize?.height, DMG_WINDOW.height)
	assert.equal(dmg?.appPosition?.x, DMG_APP.x)
	assert.equal(dmg?.appPosition?.y, DMG_APP.y)
	assert.equal(dmg?.applicationFolderPosition?.x, DMG_APPLICATIONS.x)
	assert.equal(dmg?.applicationFolderPosition?.y, DMG_APPLICATIONS.y)
})

test("tauri beforeDevCommand starts the frontend that desktop waits for", () => {
	const conf = readConf()
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	const command = conf.build?.beforeDevCommand
	assert.equal(typeof command, "string")
	assert.notEqual(command.trim(), "", "beforeDevCommand is empty so tauri dev waits 180s and dies")
	assert.match(command, /npm run dev/)
	assert.equal(conf.build.devUrl, "http://127.0.0.1:5173")
	assert.match(pkg.scripts.dev, /--port 5173/)
})

test("bundle identifier does not end with .app", () => {
	const { identifier } = readConf()
	assert.equal(typeof identifier, "string")
	assert.ok(identifier.length > 0, "identifier is required")
	assert.equal(
		identifier.endsWith(".app"),
		false,
		`identifier "${identifier}" ends with .app and conflicts with the macOS bundle extension`,
	)
})

test("macOS Info.plist declares microphone and speech-recognition usage", () => {
	const plist = readFileSync(join(tauriDir, "Info.plist"), "utf8")
	assert.match(plist, /<key>NSMicrophoneUsageDescription<\/key>/)
	assert.match(plist, /<key>NSSpeechRecognitionUsageDescription<\/key>/)
	assert.match(plist, /microphone/i)
	assert.match(plist, /<key>NSAllowsLocalNetworking<\/key>/)
})

test("macOS bundle ad-hoc signs so Gatekeeper does not call a linker-signed app damaged", () => {
	const conf = readConf()
	assert.equal(
		conf.bundle?.macOS?.signingIdentity,
		"-",
		"signingIdentity - tells Tauri to seal CodeResources; omit it and downloaded apps say they are damaged",
	)
})

test("macOS bundle requires 10.15 so Speech and mic auth APIs are in range", () => {
	const conf = readConf()
	assert.equal(conf.bundle?.macOS?.minimumSystemVersion, "10.15")
	const buildRs = readFileSync(join(tauriDir, "build.rs"), "utf8")
	assert.match(buildRs, /mmacosx-version-min=10\.15/)
})

test("macOS entitlements allow hardened-runtime microphone access", () => {
	const conf = readConf()
	assert.equal(conf.bundle?.macOS?.entitlements, "Entitlements.plist")
	const entitlements = readFileSync(join(tauriDir, "Entitlements.plist"), "utf8")
	assert.match(entitlements, /<key>com\.apple\.security\.device\.audio-input<\/key>/)
	assert.match(entitlements, /<key>com\.apple\.security\.cs\.allow-jit<\/key>/)
})

test("desktop app registers native microphone permission commands", () => {
	const lib = readFileSync(join(tauriDir, "src/lib.rs"), "utf8")
	assert.match(lib, /media::request_media_permission/)
	assert.match(lib, /media::open_media_settings/)
	assert.equal(existsSync(join(tauriDir, "src/macos_media.m")), true)
})

test("desktop tray and autostart stay desktop-only; mobile uses the same llm commands", () => {
	const lib = readFileSync(join(tauriDir, "src/lib.rs"), "utf8")
	assert.match(lib, /#\[cfg\(desktop\)\]/)
	assert.match(lib, /llm::llm_complete/)
	assert.match(lib, /tauri_plugin_autostart/)
	assert.equal(existsSync(join(tauriDir, "src/llm.rs")), true)
	assert.equal(existsSync(join(tauriDir, "src/llm/engine/llama.rs")), true)
	assert.equal(existsSync(join(tauriDir, "src/llm/engine/stub.rs")), true)
	const cargo = readFileSync(join(tauriDir, "Cargo.toml"), "utf8")
	assert.match(cargo, /target_os = "android"/)
	assert.match(cargo, /target_os = "ios"/)
	assert.match(cargo, /llama-cpp-2/)
	assert.match(cargo, /vulkan/)
	assert.match(cargo, /metal/)
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	assert.match(pkg.scripts["android:init"], /tauri android init/)
	assert.match(pkg.scripts["ios:init"], /tauri ios init/)
	assert.equal(existsSync(join(root, "scripts/patch-mobile-permissions.mjs")), true)
})
