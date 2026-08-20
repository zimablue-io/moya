import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
	argsWithoutFinderLayout,
	bundleDmgSpec,
	clearPartialDmgOutput,
	dmgArch,
	dmgFileName,
	packageMac,
	placeFinishedDmg,
	retryVisibleDmg,
	TAURI_BUILD_ARGS,
} from "./package-mac.mjs"
import { DMG_APP, DMG_APPLICATIONS, DMG_WINDOW } from "./write-dmg-background.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("first Tauri build is verbose so bundle_dmg.sh stdout is not discarded", () => {
	assert.deepEqual(TAURI_BUILD_ARGS, ["build", "-vv"])
})

test("local DMG arch follows this Mac, not a hardcoded Intel name", () => {
	assert.equal(dmgArch("arm64"), "aarch64")
	assert.equal(dmgArch("x64"), "x64")
	assert.equal(dmgFileName("0.1.6", "aarch64"), "Moya_0.1.6_aarch64.dmg")
})

test("retry argv matches Tauri's bundle_dmg.sh invocation", () => {
	const spec = bundleDmgSpec({ root, version: "0.1.6", arch: "aarch64" })
	assert.deepEqual(spec.args, [
		"--volname",
		"Moya",
		"--icon",
		"Moya.app",
		String(DMG_APP.x),
		String(DMG_APP.y),
		"--app-drop-link",
		String(DMG_APPLICATIONS.x),
		String(DMG_APPLICATIONS.y),
		"--window-size",
		String(DMG_WINDOW.width),
		String(DMG_WINDOW.height),
		"--hide-extension",
		"Moya.app",
		"--background",
		join(root, "src-tauri/dmg/background.png"),
		"--volicon",
		join(root, "src-tauri/target/release/bundle/dmg/icon.icns"),
		"Moya_0.1.6_aarch64.dmg",
		"Moya.app",
	])
	assert.equal(spec.cwd, spec.macos)
})

test("argsWithoutFinderLayout inserts --skip-jenkins without setting CI=true", () => {
	const spec = bundleDmgSpec({ root, version: "0.1.6", arch: "aarch64" })
	const skipped = argsWithoutFinderLayout(spec.args)
	assert.equal(skipped.includes("--skip-jenkins"), true)
	assert.equal(skipped.at(-2), "Moya_0.1.6_aarch64.dmg")
	assert.equal(skipped.at(-1), "Moya.app")
	assert.equal(spec.args.includes("--skip-jenkins"), false)
})

test("last retry skips Finder AppleScript so a terminal without Automation still gets a DMG", () => {
	const workspace = mkdtempSync(join(tmpdir(), "moya-skip-finder-"))
	const dmgDir = join(workspace, "src-tauri/target/release/bundle/dmg")
	const macos = join(workspace, "src-tauri/target/release/bundle/macos")
	mkdirSync(dmgDir, { recursive: true })
	mkdirSync(macos, { recursive: true })
	writeFileSync(join(dmgDir, "bundle_dmg.sh"), "#!/bin/bash\n")
	const calls = []
	const result = retryVisibleDmg({
		root: workspace,
		version: "0.1.6",
		arch: "aarch64",
		clear: () => ({ removed: [], ejected: [] }),
		log() {},
		run: (cmd, args, opts) => {
			calls.push({ cmd, args, cwd: opts?.cwd })
			if (args.includes("--skip-jenkins")) {
				writeFileSync(join(macos, "Moya_0.1.6_aarch64.dmg"), "ok")
				return { status: 0 }
			}
			return { status: 64 }
		},
	})
	assert.equal(result.ok, true)
	assert.equal(result.skipFinder, true)
	assert.equal(
		calls.some((call) => call.args.includes("--skip-jenkins")),
		true,
	)
})

test("clearPartialDmgOutput removes a leftover final DMG next to Moya.app", () => {
	const macos = mkdtempSync(join(tmpdir(), "moya-partial-dmg-"))
	writeFileSync(join(macos, "Moya_0.1.6_aarch64.dmg"), "partial")
	writeFileSync(join(macos, "keep.txt"), "ok")
	const removed = clearPartialDmgOutput(macos)
	assert.deepEqual(removed, ["Moya_0.1.6_aarch64.dmg"])
})

test("packageMac retries bundle_dmg.sh with visible output after Tauri hides the error", () => {
	const workspace = mkdtempSync(join(tmpdir(), "moya-package-mac-"))
	const dmgDir = join(workspace, "src-tauri/target/release/bundle/dmg")
	const macos = join(workspace, "src-tauri/target/release/bundle/macos")
	mkdirSync(dmgDir, { recursive: true })
	mkdirSync(macos, { recursive: true })
	writeFileSync(join(dmgDir, "bundle_dmg.sh"), "#!/bin/bash\n")
	const calls = []
	const result = packageMac({
		root: workspace,
		version: "0.1.6",
		run: (cmd, args, opts) => {
			calls.push({ cmd, args, cwd: opts?.cwd, stdio: opts?.stdio })
			if (String(cmd).endsWith("tauri")) return { status: 1 }
			if (cmd === "bash") {
				writeFileSync(join(macos, "Moya_0.1.6_aarch64.dmg"), "ok")
				return { status: 0 }
			}
			return { status: 1 }
		},
		retry: (opts) => retryVisibleDmg({ ...opts, clear: () => ({ removed: [], ejected: [] }), log() {} }),
	})
	assert.equal(result.ok, true)
	assert.equal(result.retried, true)
	assert.equal(
		calls.some((call) => call.cmd === "bash" && call.stdio === "inherit"),
		true,
	)
	assert.equal(
		calls.some((call) => String(call.cmd).endsWith("tauri") && call.args.includes("-vv")),
		true,
	)
})

test("placeFinishedDmg moves the DMG from macos/ to dmg/ the way Tauri does", () => {
	const workspace = mkdtempSync(join(tmpdir(), "moya-place-dmg-"))
	const spec = bundleDmgSpec({ root: workspace, version: "0.1.6", arch: "aarch64" })
	mkdirSync(spec.macos, { recursive: true })
	mkdirSync(dirname(spec.dest), { recursive: true })
	writeFileSync(spec.src, "dmg")
	assert.equal(placeFinishedDmg(spec), spec.dest)
})
