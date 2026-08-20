import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_APP = "src-tauri/target/release/bundle/macos/Moya.app"

export const SHIPPING_PATHS = [
	"src-tauri/tauri.conf.json",
	"src-tauri/Entitlements.plist",
	"src-tauri/Info.plist",
	"src-tauri/Cargo.toml",
	".github/workflows/release.yml",
	"scripts/mac-bundle.mjs",
	"package.json",
]

export function isShippingPath(rel) {
	const path = String(rel ?? "").replace(/^\.\//, "")
	return SHIPPING_PATHS.includes(path) || path.startsWith("src-tauri/src/")
}

/** Fail the same way Finder does: linker-signed binary, no sealed CodeResources. */
export function assessCodesignInfo(info) {
	const text = String(info ?? "")
	if (/Sealed Resources=none/.test(text) || /linker-signed/.test(text)) {
		throw new Error(
			"linker-signed-only bundle: macOS reports this app as damaged after a browser download. Run pnpm package:mac with signingIdentity - and pnpm verify:mac.",
		)
	}
	if (!/Sealed Resources version=/.test(text)) {
		throw new Error("bundle is missing sealed resources — do not commit or upload this .app")
	}
	return { sealed: true }
}

export function assertMacBundle(appPath, { exists = true, verifyOk = true, codesignInfo } = {}) {
	if (!exists) {
		throw new Error(
			`${appPath} is missing. Build it on this Mac with pnpm package:mac before committing packaging changes. GitHub Actions is too late.`,
		)
	}
	if (!verifyOk) {
		throw new Error(`${appPath} failed codesign --verify --deep --strict`)
	}
	assessCodesignInfo(codesignInfo)
	return appPath
}

export function inspectLocalMacBundle(root, appRel = DEFAULT_APP, run = spawnSync, exists = existsSync) {
	const appPath = join(root, appRel)
	if (!exists(appPath)) {
		assertMacBundle(appRel, { exists: false })
	}
	const verify = run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { encoding: "utf8" })
	const inspect = run("codesign", ["-dv", "--verbose=4", appPath], { encoding: "utf8" })
	const info = `${inspect.stdout ?? ""}\n${inspect.stderr ?? ""}`
	if (verify.status !== 0) {
		assertMacBundle(appRel, {
			exists: true,
			verifyOk: false,
			codesignInfo: `${verify.stderr ?? ""}\n${info}`,
		})
	}
	assertMacBundle(appRel, { exists: true, verifyOk: true, codesignInfo: info })
	return { appPath, info }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	const result = inspectLocalMacBundle(root)
	console.log(`mac bundle ok: ${result.appPath}`)
}
