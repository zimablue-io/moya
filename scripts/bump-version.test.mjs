import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
	applyVersion,
	bumpVersion,
	nextVersion,
	parseSemver,
	setBrandVersion,
	setCargoLockMoyaVersion,
	setCargoPackageVersion,
} from "./bump-version.mjs"
import { appVersions, assertVersionsMatch } from "./shipping-contract.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function workspace(version = "0.1.0") {
	const dir = mkdtempSync(join(tmpdir(), "moya-bump-"))
	mkdirSync(join(dir, "src-tauri"), { recursive: true })
	mkdirSync(join(dir, "src/lib"), { recursive: true })
	writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "moya", version }, null, "\t")}\n`)
	writeFileSync(join(dir, "src-tauri/tauri.conf.json"), `${JSON.stringify({ version }, null, "\t")}\n`)
	writeFileSync(
		join(dir, "src-tauri/Cargo.toml"),
		`[package]\nname = "moya"\nversion = "${version}"\nrust-version = "1.77"\n`,
	)
	writeFileSync(
		join(dir, "src-tauri/Cargo.lock"),
		`[[package]]\nname = "other"\nversion = "0.1.0"\n\n[[package]]\nname = "moya"\nversion = "${version}"\n`,
	)
	writeFileSync(
		join(dir, "src/lib/brand.ts"),
		`export const APP_NAME = "Moya"\nexport const APP_VERSION = "${version}"\n`,
	)
	return dir
}

test("semver increment is deterministic", () => {
	assert.deepEqual(parseSemver("0.1.0"), { major: 0, minor: 1, patch: 0 })
	assert.equal(nextVersion("0.1.0", "patch"), "0.1.1")
	assert.equal(nextVersion("0.1.9", "patch"), "0.1.10")
	assert.equal(nextVersion("0.1.0", "minor"), "0.2.0")
	assert.equal(nextVersion("1.4.3", "minor"), "1.5.0")
	assert.equal(nextVersion("0.1.0", "major"), "1.0.0")
	assert.equal(nextVersion("2.3.4", "3.0.0"), "3.0.0")
	assert.throws(() => nextVersion("0.1.0", "beta"), /patch, minor, major/)
	assert.throws(() => nextVersion("1.0.0-rc.1", "patch"), /Not a semver/)
})

test("Cargo and brand writers only touch the app version", () => {
	assert.match(
		setCargoPackageVersion('[package]\nversion = "0.1.0"\nrust-version = "1.77"\n', "0.1.1"),
		/version = "0.1.1"/,
	)
	assert.match(
		setCargoPackageVersion('[package]\nversion = "0.1.0"\nrust-version = "1.77"\n', "0.1.1"),
		/rust-version = "1.77"/,
	)
	const lock = setCargoLockMoyaVersion(
		'[[package]]\nname = "other"\nversion = "0.1.0"\n\n[[package]]\nname = "moya"\nversion = "0.1.0"\n',
		"0.2.0",
	)
	assert.match(lock, /name = "other"\nversion = "0.1.0"/)
	assert.match(lock, /name = "moya"\nversion = "0.2.0"/)
	assert.equal(setBrandVersion('export const APP_VERSION = "0.1.0"\n', "0.1.1"), 'export const APP_VERSION = "0.1.1"\n')
})

test("applyVersion writes every lockstep file in a workspace", () => {
	const dir = workspace("0.1.0")
	applyVersion(dir, "0.1.1")
	const versions = appVersions(dir)
	assert.deepEqual(versions, {
		package: "0.1.1",
		tauri: "0.1.1",
		cargo: "0.1.1",
		brand: "0.1.1",
		lock: "0.1.1",
	})
	assert.equal(assertVersionsMatch(dir), "0.1.1")
})

test("bumpVersion patch/minor/major and refuses a no-op or a drifted tree", () => {
	const dir = workspace("0.1.0")
	assert.deepEqual(bumpVersion(dir, "patch"), { previous: "0.1.0", version: "0.1.1" })
	assert.deepEqual(bumpVersion(dir, "minor"), { previous: "0.1.1", version: "0.2.0" })
	assert.deepEqual(bumpVersion(dir, "major"), { previous: "0.2.0", version: "1.0.0" })
	assert.deepEqual(bumpVersion(dir, "1.2.3"), { previous: "1.0.0", version: "1.2.3" })
	assert.throws(() => bumpVersion(dir, "1.2.3"), /Already at 1.2.3/)
	assert.deepEqual(bumpVersion(dir, "patch", { dryRun: true }), { previous: "1.2.3", version: "1.2.4" })
	assert.equal(assertVersionsMatch(dir), "1.2.3")
	writeFileSync(join(dir, "package.json"), `${JSON.stringify({ version: "9.9.9" }, null, "\t")}\n`)
	assert.throws(() => bumpVersion(dir, "patch"), /Version mismatch/)
})

test("hand increment is not a package script — package:mac does not rewrite versions", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	assert.equal(pkg.scripts.bump, undefined)
	assert.equal(bumpVersion(root, "patch", { dryRun: true }).previous, appVersions(root).package)
})
