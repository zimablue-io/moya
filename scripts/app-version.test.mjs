import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { applyGitVersion, resolveGitVersion, versionAfterTag } from "./app-version.mjs"
import { assertVersionsMatch } from "./shipping-contract.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function gitRun(describe, count) {
	return (cmd, args) => {
		assert.equal(cmd, "git")
		if (args[0] === "describe") return { status: 0, stdout: `${describe}\n`, stderr: "" }
		if (args[0] === "rev-list") return { status: 0, stdout: `${count}\n`, stderr: "" }
		throw new Error(`unexpected git ${args.join(" ")}`)
	}
}

test("patch is the number of commits after the last vX.Y.Z tag", () => {
	assert.equal(versionAfterTag("0.1.0", 0), "0.1.0")
	assert.equal(versionAfterTag("0.1.0", 4), "0.1.4")
	assert.equal(versionAfterTag("0.1.9", 1), "0.1.10")
	assert.throws(() => versionAfterTag("0.1.0", -1), /whole number/)
})

test("resolveGitVersion is the last tag plus commits after it", () => {
	assert.equal(resolveGitVersion("/repo", gitRun("v0.1.0", 0)), "0.1.0")
	assert.equal(resolveGitVersion("/repo", gitRun("v0.1.0", 4)), "0.1.4")
	assert.throws(
		() => resolveGitVersion("/repo", () => ({ status: 1, stdout: "", stderr: "fatal: no tags" })),
		/no tags/,
	)
})

function workspace(version) {
	const dir = mkdtempSync(join(tmpdir(), "moya-app-version-"))
	mkdirSync(join(dir, "src-tauri"), { recursive: true })
	mkdirSync(join(dir, "src/lib"), { recursive: true })
	writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "moya", version }, null, "\t")}\n`)
	writeFileSync(join(dir, "src-tauri/tauri.conf.json"), `${JSON.stringify({ version }, null, "\t")}\n`)
	writeFileSync(join(dir, "src-tauri/Cargo.toml"), `[package]\nname = "moya"\nversion = "${version}"\n`)
	writeFileSync(join(dir, "src-tauri/Cargo.lock"), `[[package]]\nname = "moya"\nversion = "${version}"\n`)
	writeFileSync(join(dir, "src/lib/brand.ts"), `export const APP_VERSION = "${version}"\n`)
	return dir
}

test("applyGitVersion writes lockstep files when git is ahead of the tree", () => {
	const dir = workspace("0.1.0")
	const result = applyGitVersion(dir, gitRun("v0.1.0", 4))
	assert.deepEqual(result, { previous: "0.1.0", version: "0.1.4" })
	assert.equal(assertVersionsMatch(dir), "0.1.4")
})

test("package:mac applies the git version — there is no second bump command", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	assert.match(pkg.scripts["package:mac"] ?? "", /app-version\.mjs/)
	assert.match(pkg.scripts["package:mac"] ?? "", /--apply/)
	assert.equal(pkg.scripts.bump, undefined)
})
