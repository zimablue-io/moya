import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, renameSync, unlinkSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { clearStaleDmgWork } from "./desktop-frontend.mjs"
import { applyDmgInstallerLayout } from "./dmg-layout.mjs"
import { DMG_APP, DMG_APPLICATIONS, DMG_ICON_SIZE, DMG_WINDOW } from "./write-dmg-background.mjs"

export { volumeHasInstallerLayout } from "./dmg-layout.mjs"

const require = createRequire(import.meta.url)

export const DMG_RETRY_LIMIT = 2

/** create-dmg flag: skip Finder AppleScript. Needed when this terminal has no Automation → Finder (-1743). */
export function argsWithoutFinderLayout(args) {
	const flags = args.slice(0, -2)
	const tail = args.slice(-2)
	if (flags.includes("--skip-jenkins")) return args
	return [...flags, "--skip-jenkins", ...tail]
}

export function dmgArch(nodeArch = process.arch) {
	if (nodeArch === "arm64") return "aarch64"
	if (nodeArch === "x64") return "x64"
	throw new Error(`unsupported DMG arch: ${nodeArch}`)
}

export function dmgFileName(version, arch = dmgArch()) {
	return `Moya_${version}_${arch}.dmg`
}

export function bundleDmgSpec({ root, version, arch = dmgArch() }) {
	const name = dmgFileName(version, arch)
	const macos = join(root, "src-tauri/target/release/bundle/macos")
	const dmgDir = join(root, "src-tauri/target/release/bundle/dmg")
	return {
		name,
		macos,
		cwd: macos,
		script: join(dmgDir, "bundle_dmg.sh"),
		icon: join(dmgDir, "icon.icns"),
		dest: join(dmgDir, name),
		src: join(macos, name),
		args: [
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
			"--icon-size",
			String(DMG_ICON_SIZE),
			"--hide-extension",
			"Moya.app",
			"--background",
			join(root, "src-tauri/dmg/background.png"),
			"--volicon",
			join(dmgDir, "icon.icns"),
			name,
			"Moya.app",
		],
	}
}

export function clearPartialDmgOutput(macos, { readdir = readdirSync, unlink = unlinkSync } = {}) {
	const removed = []
	let names = []
	try {
		names = readdir(macos)
	} catch {
		return removed
	}
	for (const name of names) {
		if (!/^Moya_.+\.dmg$/.test(name)) continue
		unlink(join(macos, name))
		removed.push(name)
	}
	return removed
}

export function placeFinishedDmg(spec, { exists = existsSync, rename = renameSync } = {}) {
	if (!exists(spec.src)) {
		throw new Error(`bundle_dmg.sh exited 0 but ${spec.src} is missing`)
	}
	rename(spec.src, spec.dest)
	return spec.dest
}

export async function retryVisibleDmg({
	root,
	version,
	arch = dmgArch(),
	attempts = DMG_RETRY_LIMIT,
	run = spawnSync,
	clear = clearStaleDmgWork,
	log = console.error,
	layout = applyDmgInstallerLayout,
} = {}) {
	const spec = bundleDmgSpec({ root, version, arch })
	if (!existsSync(spec.script)) {
		return { ok: false, reason: "bundle_dmg.sh missing — the build failed before the DMG step" }
	}
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const skipFinder = attempt === attempts
		const args = skipFinder ? argsWithoutFinderLayout(spec.args) : spec.args
		clear(root)
		clearPartialDmgOutput(spec.macos)
		if (skipFinder) {
			log("Finder AppleScript is not authorized. Writing icon-view layout without Finder.")
		} else {
			log(`retrying bundle_dmg.sh (${attempt}/${attempts}) with Finder layout`)
		}
		const result = run("bash", [spec.script, ...args], { cwd: spec.cwd, stdio: "inherit" })
		if ((result.status ?? 1) === 0) {
			const laid = await layout(spec.src)
			if (!laid?.ok) continue
			const dest = placeFinishedDmg(spec)
			return { ok: true, dest, attempt, skipFinder }
		}
	}
	return { ok: false, reason: "bundle_dmg.sh failed after retries — see the script output above" }
}

export function tauriBin(root) {
	return join(root, "node_modules/.bin/tauri")
}

/** -vv is how Tauri prints bundle_dmg.sh stdout/stderr (log::debug in output_ok). */
export const TAURI_BUILD_ARGS = ["build", "-vv"]

export async function packageMac({
	root,
	version,
	run = spawnSync,
	retry = retryVisibleDmg,
	layout = applyDmgInstallerLayout,
} = {}) {
	const spec = bundleDmgSpec({ root, version })
	const tauri = run(tauriBin(root), TAURI_BUILD_ARGS, { cwd: root, stdio: "inherit", env: process.env })
	if ((tauri.status ?? 1) === 0) {
		const dest = existsSync(spec.dest) ? spec.dest : spec.src
		const laid = await layout(dest)
		if (!laid?.ok) {
			console.error(laid?.reason ?? "DMG layout failed")
			return { ok: false, retried: false, status: 1 }
		}
		return { ok: true, retried: false, dest: laid.dest ?? dest }
	}
	const again = await retry({ root, version, run, layout })
	if (!again.ok) {
		console.error(again.reason)
		return { ok: false, retried: true, status: tauri.status ?? 1 }
	}
	console.log(`DMG ok after retry: ${again.dest}`)
	return { ok: true, retried: true, dest: again.dest }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	const { version } = require("../package.json")
	const result = await packageMac({ root, version })
	process.exit(result.ok ? 0 : (result.status ?? 1))
}
