import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** Failed create-dmg runs leave these next to Moya.app. The next -srcfolder packs them in. */
export const STALE_RW_DMG = /^rw\.\d+\.Moya_.*\.dmg$/

export function isStaleRwDmg(name) {
	return STALE_RW_DMG.test(String(name ?? ""))
}

export function shouldEjectDmgVolume(name) {
	const volume = String(name ?? "")
	if (volume === "Moya" || /^Moya \d+$/.test(volume)) return true
	if (/^dmg\.[A-Za-z0-9]+$/.test(volume)) return true
	return false
}

export function clearStaleDmgWork(root, { readdir = readdirSync, unlink = unlinkSync, run = spawnSync } = {}) {
	const removed = []
	for (const rel of ["src-tauri/target/release/bundle/macos", "src-tauri/target/release/bundle/dmg"]) {
		const dir = join(root, rel)
		let names = []
		try {
			names = readdir(dir)
		} catch {
			continue
		}
		for (const name of names) {
			if (!isStaleRwDmg(name)) continue
			unlink(join(dir, name))
			removed.push(name)
		}
	}
	const ejected = []
	let volumes = []
	try {
		volumes = readdir("/Volumes")
	} catch {
		volumes = []
	}
	for (const name of volumes.filter((volume) => shouldEjectDmgVolume(volume))) {
		const mount = join("/Volumes", name)
		const result = run("hdiutil", ["detach", mount, "-force"], { encoding: "utf8" })
		if (result.status !== 0) {
			const err = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim()
			throw new Error(`Could not eject ${mount}: ${err || `exit ${result.status}`}`)
		}
		ejected.push(name)
	}
	return { removed, ejected }
}

export function desktopFrontendIndex(workspaceRoot) {
	const confPath = join(workspaceRoot, "src-tauri/tauri.conf.json")
	const conf = JSON.parse(readFileSync(confPath, "utf8"))
	const frontendDist = conf.build?.frontendDist
	if (typeof frontendDist !== "string" || frontendDist.length === 0) {
		throw new Error("tauri.conf.json build.frontendDist is missing")
	}
	return {
		frontendDist,
		indexPath: join(workspaceRoot, "src-tauri", frontendDist, "index.html"),
	}
}

export function assertDesktopFrontend(workspaceRoot) {
	const { frontendDist, indexPath } = desktopFrontendIndex(workspaceRoot)
	if (!existsSync(indexPath)) {
		throw new Error(
			`Tauri frontendDist ${frontendDist} has no index.html — the desktop window has nothing to load (${indexPath})`,
		)
	}
	const html = readFileSync(indexPath, "utf8")
	if (!html.includes("<html") || !html.includes("<script")) {
		throw new Error(`${indexPath} is not a bootable HTML document`)
	}
	return indexPath
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	const stale = clearStaleDmgWork(root)
	if (stale.removed.length > 0) console.log(`cleared leftover DMG temps: ${stale.removed.join(", ")}`)
	if (stale.ejected.length > 0) console.log(`ejected leftover DMG volumes: ${stale.ejected.join(", ")}`)
	const indexPath = assertDesktopFrontend(root)
	console.log(`desktop frontend ok: ${indexPath}`)
}
