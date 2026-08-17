import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { assertDesktopFrontend, desktopFrontendIndex } from "./desktop-frontend.mjs"

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

test("package:mac sets CI so DMG packaging does not require Finder automation", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	assert.match(
		pkg.scripts["package:mac"],
		/\bCI=true\b/,
		"macOS create-dmg AppleScript needs Finder automation; CI=true passes --skip-jenkins",
	)
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
