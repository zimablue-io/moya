import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { assertVersionsMatch, readRel } from "./shipping-contract.mjs"

export const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

export function parseSemver(version) {
	const match = String(version).trim().match(SEMVER)
	if (!match) throw new Error(`Not a semver X.Y.Z: ${version}`)
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function nextVersion(current, bump) {
	const requested = String(bump ?? "").trim()
	if (SEMVER.test(requested)) return requested
	const { major, minor, patch } = parseSemver(current)
	if (requested === "major") return `${major + 1}.0.0`
	if (requested === "minor") return `${major}.${minor + 1}.0`
	if (requested === "patch") return `${major}.${minor}.${patch + 1}`
	throw new Error(`Bump must be patch, minor, major, or X.Y.Z (got ${bump})`)
}

export function setCargoPackageVersion(toml, version) {
	let inPackage = false
	let replaced = false
	const next = String(toml)
		.split("\n")
		.map((line) => {
			if (/^\[package\]/.test(line)) inPackage = true
			else if (inPackage && /^\[/.test(line)) inPackage = false
			if (inPackage && /^version = "/.test(line)) {
				replaced = true
				return `version = "${version}"`
			}
			return line
		})
		.join("\n")
	if (!replaced) throw new Error("Cargo.toml [package] version line not found")
	return next
}

export function setCargoLockMoyaVersion(lock, version) {
	const next = String(lock).replace(/(\[\[package\]\]\nname = "moya"\nversion = ")[^"]+(")/, `$1${version}$2`)
	if (next === lock) throw new Error('Cargo.lock [[package]] name = "moya" version not found')
	return next
}

export function setBrandVersion(source, version) {
	const next = String(source).replace(/export const APP_VERSION = "[^"]+"/, `export const APP_VERSION = "${version}"`)
	if (next === source) throw new Error("src/lib/brand.ts APP_VERSION export not found")
	return next
}

function writeJsonVersion(root, rel, version) {
	const path = join(root, rel)
	const json = JSON.parse(readFileSync(path, "utf8"))
	json.version = version
	writeFileSync(path, `${JSON.stringify(json, null, "\t")}\n`)
}

export function applyVersion(root, version) {
	parseSemver(version)
	writeJsonVersion(root, "package.json", version)
	writeJsonVersion(root, "src-tauri/tauri.conf.json", version)
	writeFileSync(
		join(root, "src-tauri/Cargo.toml"),
		setCargoPackageVersion(readRel(root, "src-tauri/Cargo.toml"), version),
	)
	writeFileSync(
		join(root, "src-tauri/Cargo.lock"),
		setCargoLockMoyaVersion(readRel(root, "src-tauri/Cargo.lock"), version),
	)
	writeFileSync(join(root, "src/lib/brand.ts"), setBrandVersion(readRel(root, "src/lib/brand.ts"), version))
	return version
}

export function bumpVersion(root, bump, { dryRun = false } = {}) {
	const previous = assertVersionsMatch(root)
	const version = nextVersion(previous, bump)
	if (version === previous) throw new Error(`Already at ${previous}`)
	if (!dryRun) {
		applyVersion(root, version)
		assertVersionsMatch(root)
	}
	return { previous, version }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	console.error(
		"Version is the last vX.Y.Z tag plus commits after it. pnpm package:mac applies that number. Do not increment by hand.",
	)
	process.exit(1)
}
