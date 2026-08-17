import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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
	const indexPath = assertDesktopFrontend(root)
	console.log(`desktop frontend ok: ${indexPath}`)
}
