import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DOWNLOAD_APP_ASSET, DOWNLOAD_APP_URL } from "../src/lib/brand.ts"

export const EXPECTED_DOWNLOAD_ASSET = "Moya_aarch64.dmg"
export const EXPECTED_DOWNLOAD_URL = `https://github.com/zimablue-io/moya/releases/latest/download/${EXPECTED_DOWNLOAD_ASSET}`
export const CI_WORKFLOW = ".github/workflows/ci.yml"
export const RELEASE_WORKFLOW = ".github/workflows/release.yml"
export const BUMP_WORKFLOW = ".github/workflows/bump.yml"
export const PR_TEMPLATE = ".github/pull_request_template.md"

export function readRel(root, rel) {
	return readFileSync(join(root, rel), "utf8")
}

export function appVersions(root) {
	const pkg = JSON.parse(readRel(root, "package.json"))
	const tauri = JSON.parse(readRel(root, "src-tauri/tauri.conf.json"))
	const cargo = readRel(root, "src-tauri/Cargo.toml").match(/^\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1]
	const brand = readRel(root, "src/lib/brand.ts").match(/export const APP_VERSION = "([^"]+)"/)?.[1]
	const lock = readRel(root, "src-tauri/Cargo.lock").match(/\[\[package\]\]\nname = "moya"\nversion = "([^"]+)"/)?.[1]
	return { package: pkg.version, tauri: tauri.version, cargo, brand, lock }
}

export function assertVersionsMatch(root, tag) {
	const versions = appVersions(root)
	const values = Object.values(versions)
	if (!versions.package || values.some((value) => value !== versions.package)) {
		throw new Error(
			`Version mismatch: package.json=${versions.package} tauri.conf.json=${versions.tauri} Cargo.toml=${versions.cargo} brand.ts=${versions.brand} Cargo.lock=${versions.lock}`,
		)
	}
	if (tag) {
		const expected = String(tag).replace(/^v/, "")
		if (versions.package !== expected) {
			throw new Error(`Tag ${tag} does not match package version ${versions.package}`)
		}
	}
	return versions.package
}

export function workflowFiles(root) {
	const dir = join(root, ".github/workflows")
	if (!existsSync(dir)) return []
	return readdirSync(dir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
}

export function assertCiWorkflow(yaml) {
	if (!/\bpull_request\b/.test(yaml)) {
		throw new Error("CI must run on pull_request so unfinished work cannot land on main untested")
	}
	if (!/pnpm test/.test(yaml)) {
		throw new Error("CI must run pnpm test")
	}
	if (!/pnpm lint/.test(yaml)) {
		throw new Error("CI must run pnpm lint")
	}
	if (!/pnpm typecheck/.test(yaml)) {
		throw new Error("CI must run pnpm typecheck")
	}
}

export function assertReleaseWorkflow(yaml) {
	if (!/tags:/.test(yaml) || !/v\*/.test(yaml)) {
		throw new Error("Release must trigger on version tags (v*)")
	}
	if (!/branches:/.test(yaml) || !/\bmain\b/.test(yaml)) {
		throw new Error("Release must run on main — a GITHUB_TOKEN tag push cannot start a second workflow")
	}
	if (!/macos/.test(yaml)) {
		throw new Error("Release must build the Mac app on a macOS runner")
	}
	if (!/package:mac/.test(yaml)) {
		throw new Error("Release must run package:mac, the same command documented for local builds")
	}
	if (!/gh release create/.test(yaml)) {
		throw new Error("Release must publish a GitHub Release (gh release create)")
	}
	if (!/\.dmg/.test(yaml)) {
		throw new Error("Release must upload a .dmg — that is what Download and README point at")
	}
	if (!yaml.includes(EXPECTED_DOWNLOAD_ASSET)) {
		throw new Error(
			`Release must upload the stable ${EXPECTED_DOWNLOAD_ASSET} so Download can use releases/latest/download`,
		)
	}
	if (!/contents:\s*write/.test(yaml)) {
		throw new Error("Release needs contents: write to publish the GitHub Release")
	}
	if (!/unset APPLE_CERTIFICATE/.test(yaml)) {
		throw new Error(
			"Release must unset APPLE_CERTIFICATE when it is empty — a blank secret still triggers codesign and never publishes a DMG",
		)
	}
	if (!/APPLE_SIGNING_IDENTITY="-/.test(yaml)) {
		throw new Error(
			'Release must ad-hoc sign with APPLE_SIGNING_IDENTITY="-" when no Developer ID cert exists — linker-signed bundles are reported as damaged',
		)
	}
	if (!/codesign --verify/.test(yaml)) {
		throw new Error("Release must codesign --verify the .app so a linker-signed-only bundle cannot publish")
	}
}

export function assertBumpWorkflow(yaml) {
	if (!/\bworkflow_dispatch\b/.test(yaml)) {
		throw new Error("Bump must be runnable from Actions (workflow_dispatch)")
	}
	if (!/bump-version\.mjs/.test(yaml)) {
		throw new Error("Bump must run scripts/bump-version.mjs")
	}
	if (!/pull.request|create-pull-request|gh pr create/i.test(yaml)) {
		throw new Error("Bump must open a pull request — main is not a direct push")
	}
}

export function assertShippingContract(root) {
	if (DOWNLOAD_APP_ASSET !== EXPECTED_DOWNLOAD_ASSET) {
		throw new Error(`DOWNLOAD_APP_ASSET must stay ${EXPECTED_DOWNLOAD_ASSET} (got ${DOWNLOAD_APP_ASSET})`)
	}
	if (DOWNLOAD_APP_URL !== EXPECTED_DOWNLOAD_URL) {
		throw new Error(`DOWNLOAD_APP_URL must stay ${EXPECTED_DOWNLOAD_URL} (got ${DOWNLOAD_APP_URL})`)
	}
	const readme = readRel(root, "README.md")
	if (readme.includes(EXPECTED_DOWNLOAD_URL)) {
		throw new Error(
			"README must not hard-link releases/latest/download — that URL 404s until a DMG exists. Link /releases instead.",
		)
	}
	if (!readme.includes("https://github.com/zimablue-io/moya/releases")) {
		throw new Error("README must link GitHub Releases for Mac builds")
	}
	const menu = readRel(root, "src/components/assistant-menu.tsx")
	if (!/resolveMacDownloadUrl/.test(menu)) {
		throw new Error(
			"Download must resolve a live GitHub asset — a hardcoded latest/download URL 404s when no Release exists",
		)
	}
	if (/href=\{DOWNLOAD_APP_URL\}/.test(menu)) {
		throw new Error("Download must not use DOWNLOAD_APP_URL as a static href")
	}
	const tauri = JSON.parse(readRel(root, "src-tauri/tauri.conf.json"))
	if (tauri.bundle?.macOS?.signingIdentity !== "-") {
		throw new Error(
			'tauri.conf.json bundle.macOS.signingIdentity must be "-" so the .app is sealed; a linker-signed binary is reported as damaged after download',
		)
	}
	assertVersionsMatch(root)
	if (!existsSync(join(root, CI_WORKFLOW))) {
		throw new Error(`${CI_WORKFLOW} is missing — pull requests are not gated`)
	}
	if (!existsSync(join(root, RELEASE_WORKFLOW))) {
		throw new Error(
			`${RELEASE_WORKFLOW} is missing — Download and README point at releases/latest, which is empty until a tag publishes a DMG`,
		)
	}
	assertCiWorkflow(readRel(root, CI_WORKFLOW))
	assertReleaseWorkflow(readRel(root, RELEASE_WORKFLOW))
	if (!existsSync(join(root, BUMP_WORKFLOW))) {
		throw new Error(`${BUMP_WORKFLOW} is missing — version bumps must be a dispatch that opens a PR`)
	}
	assertBumpWorkflow(readRel(root, BUMP_WORKFLOW))
	const pkg = JSON.parse(readRel(root, "package.json"))
	if (!/bump-version\.mjs/.test(pkg.scripts?.bump ?? "")) {
		throw new Error("package.json scripts.bump must run scripts/bump-version.mjs")
	}
	if (
		!/APP_VERSION/.test(readRel(root, "src/lib/mcp.ts")) ||
		!/from "\.\/brand\.ts"/.test(readRel(root, "src/lib/mcp.ts"))
	) {
		throw new Error("mcp.ts must send APP_VERSION from brand.ts, not a hardcoded semver")
	}
	if (!existsSync(join(root, PR_TEMPLATE))) {
		throw new Error(`${PR_TEMPLATE} is missing`)
	}
	const template = readRel(root, PR_TEMPLATE)
	if (!/shipping|Download|release workflow/i.test(template)) {
		throw new Error("PR template must ask whether advertised user paths have a shipping workflow")
	}
	return {
		downloadUrl: DOWNLOAD_APP_URL,
		workflows: workflowFiles(root),
		version: appVersions(root).package,
	}
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	const result = assertShippingContract(root)
	console.log(`shipping contract ok: v${result.version} → ${result.downloadUrl}`)
}
