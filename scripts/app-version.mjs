import { spawnSync } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { applyVersion, parseSemver } from "./bump-version.mjs"
import { assertVersionsMatch } from "./shipping-contract.mjs"

/** Diagnostic only. package:mac and Release use the lockstep files, not this count. */
export function versionAfterTag(tagVersion, commitsAfter) {
	const { major, minor, patch } = parseSemver(tagVersion)
	const n = Number(commitsAfter)
	if (!Number.isInteger(n) || n < 0) {
		throw new Error(`Commit count after tag must be a whole number (got ${commitsAfter})`)
	}
	return n === 0 ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + n}`
}

function git(root, args, run) {
	const result = run("git", args, { cwd: root, encoding: "utf8" })
	if (result.status !== 0) {
		const err = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim()
		throw new Error(err || `git ${args.join(" ")} failed`)
	}
	return String(result.stdout ?? "").trim()
}

export function resolveGitVersion(root, run = spawnSync) {
	const tag = git(root, ["describe", "--tags", "--match", "v[0-9]*.[0-9]*.[0-9]*", "--abbrev=0"], run)
	const base = tag.replace(/^v/, "")
	parseSemver(base)
	const commits = git(root, ["rev-list", "--count", `${tag}..HEAD`], run)
	return versionAfterTag(base, commits)
}

export function applyGitVersion(root, run = spawnSync) {
	const previous = assertVersionsMatch(root)
	const version = resolveGitVersion(root, run)
	if (previous !== version) applyVersion(root, version)
	assertVersionsMatch(root)
	return { previous, version }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	if (process.argv.includes("--apply")) {
		console.error(
			"package:mac must not rewrite versions. Building a DMG is not a version event. Change the lockstep files in one commit if you need a new number.",
		)
		process.exit(1)
	} else {
		process.stdout.write(`${resolveGitVersion(root)}\n`)
	}
}
