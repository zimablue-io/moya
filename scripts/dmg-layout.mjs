import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { DMG_APP, DMG_APPLICATIONS, DMG_BG, DMG_ICON_SIZE, DMG_WINDOW } from "./write-dmg-background.mjs"

export { DMG_ICON_SIZE } from "./write-dmg-background.mjs"

const require = createRequire(import.meta.url)
const vendor = join(dirname(fileURLToPath(import.meta.url)), "vendor/ds-store")
const DSStore = require(join(vendor, "lib/ds-store.cjs"))
const Entry = require(join(vendor, "lib/entry.cjs"))

export function volumeHasInstallerLayout(names) {
	return (
		names.includes(".DS_Store") &&
		names.includes(".background") &&
		names.includes("Applications") &&
		names.includes("Moya.app")
	)
}

export function writeInstallerDsStore(dest, cb) {
	const file = new DSStore()
	file.push(
		Entry.construct(".", "bwsp", {
			x: 200,
			y: 120,
			width: DMG_WINDOW.width,
			height: DMG_WINDOW.height,
		}),
	)
	file.push(
		Entry.construct(".", "icvp", {
			iconSize: DMG_ICON_SIZE,
			colorComponents: [DMG_BG[0] / 255, DMG_BG[1] / 255, DMG_BG[2] / 255],
		}),
	)
	file.push(Entry.construct(".", "vSrn", { value: 1 }))
	file.push(Entry.construct("Moya.app", "Iloc", { x: DMG_APP.x, y: DMG_APP.y }))
	file.push(Entry.construct("Applications", "Iloc", { x: DMG_APPLICATIONS.x, y: DMG_APPLICATIONS.y }))
	file.write(dest, cb)
}

const writeInstallerDsStoreAsync = promisify(writeInstallerDsStore)

function runChecked(run, cmd, args, opts = {}) {
	const result = run(cmd, args, { encoding: "utf8", ...opts })
	if ((result.status ?? 1) !== 0) {
		const err = result.stderr?.toString().trim() || result.stdout?.toString().trim() || `${cmd} failed`
		throw new Error(err)
	}
	return result
}

export async function applyDmgInstallerLayout(
	dmgPath,
	{ run = spawnSync, writeStore = writeInstallerDsStoreAsync } = {},
) {
	if (!existsSync(dmgPath)) {
		return { ok: false, reason: `DMG missing: ${dmgPath}` }
	}
	const work = mkdtempSync(join(tmpdir(), "moya-dmg-layout-"))
	const rw = join(work, "rw.dmg")
	const mount = join(work, "mount")
	const udzo = join(work, "out.dmg")
	try {
		runChecked(run, "hdiutil", ["convert", dmgPath, "-format", "UDRW", "-ov", "-o", rw], { stdio: "pipe" })
		runChecked(run, "mkdir", ["-p", mount])
		runChecked(run, "hdiutil", ["attach", rw, "-readwrite", "-nobrowse", "-mountpoint", mount], { stdio: "pipe" })
		await writeStore(join(mount, ".DS_Store"))
		const names = readdirSync(mount)
		if (!volumeHasInstallerLayout(names)) {
			throw new Error(`layout write left ${names.join(", ")}`)
		}
		runChecked(run, "hdiutil", ["detach", mount], { stdio: "pipe" })
		runChecked(run, "hdiutil", ["convert", rw, "-format", "UDZO", "-imagekey", "zlib-level=9", "-ov", "-o", udzo], {
			stdio: "pipe",
		})
		renameSync(udzo, dmgPath)
		return { ok: true, dest: dmgPath }
	} catch (err) {
		try {
			run("hdiutil", ["detach", mount], { stdio: "pipe" })
		} catch {
			/* already detached */
		}
		return { ok: false, reason: err instanceof Error ? err.message : String(err) }
	} finally {
		rmSync(work, { recursive: true, force: true })
	}
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const dmg = process.argv[2]
	if (!dmg) {
		console.error("usage: node scripts/dmg-layout.mjs <path-to.dmg>")
		process.exit(1)
	}
	const result = await applyDmgInstallerLayout(dmg)
	if (!result.ok) {
		console.error(result.reason)
		process.exit(1)
	}
	console.log(`installer layout: ${result.dest}`)
}
