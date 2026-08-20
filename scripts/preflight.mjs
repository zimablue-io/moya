import { spawnSync } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { inspectLocalMacBundle, isShippingPath } from "./mac-bundle.mjs"

export const PREFLIGHT_STEPS = ["format:check", "lint", "typecheck", "test"]

export function parseChangedFiles(stdout) {
	return String(stdout ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
}

export function shouldVerifyMacBundle(changedFiles, platform = process.platform) {
	const shipping = (changedFiles ?? []).some((file) => isShippingPath(file))
	if (!shipping) return { required: false }
	if (platform !== "darwin") {
		throw new Error(
			"Packaging changes must be verified on this Mac with pnpm package:mac && pnpm verify:mac. Do not push them from a machine that cannot codesign.",
		)
	}
	return { required: true }
}

export function listChangedFiles(root, run = spawnSync) {
	const staged = run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
		cwd: root,
		encoding: "utf8",
	})
	const unstaged = run("git", ["diff", "--name-only", "--diff-filter=ACMR"], { cwd: root, encoding: "utf8" })
	return [...new Set([...parseChangedFiles(staged.stdout), ...parseChangedFiles(unstaged.stdout)])]
}

export function runPreflight(
	root,
	{ run = spawnSync, platform = process.platform, verifyBundle = inspectLocalMacBundle } = {},
) {
	for (const step of PREFLIGHT_STEPS) {
		const result = run("pnpm", [step], { cwd: root, encoding: "utf8", stdio: "inherit" })
		if (result.status !== 0) {
			throw new Error(`pnpm ${step} failed — fix it locally before commit`)
		}
	}
	const changed = listChangedFiles(root, run)
	if (shouldVerifyMacBundle(changed, platform).required) {
		verifyBundle(root)
	}
	return { steps: PREFLIGHT_STEPS, verifiedBundle: shouldVerifyMacBundle(changed, platform).required }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	runPreflight(root)
	console.log("preflight ok")
}
