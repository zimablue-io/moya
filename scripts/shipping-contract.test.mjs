import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { DOWNLOAD_APP_URL } from "../src/lib/brand.ts"
import {
	appVersions,
	assertCiWorkflow,
	assertReleaseWorkflow,
	assertShippingContract,
	assertVersionsMatch,
	CI_WORKFLOW,
	EXPECTED_DOWNLOAD_URL,
	PR_TEMPLATE,
	RELEASE_WORKFLOW,
} from "./shipping-contract.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("app, crate, and Tauri versions stay in lockstep", () => {
	const versions = appVersions(root)
	assert.equal(versions.package, versions.tauri)
	assert.equal(versions.package, versions.cargo)
	assert.equal(versions.package, versions.brand)
	assert.equal(versions.package, versions.lock)
	assert.equal(assertVersionsMatch(root), versions.package)
	assert.throws(() => assertVersionsMatch(root, "v9.9.9"), /does not match/)
})

test("Release may publish a DMG, but install is build-from-source", () => {
	assert.equal(DOWNLOAD_APP_URL, EXPECTED_DOWNLOAD_URL)
	assert.equal(
		existsSync(join(root, RELEASE_WORKFLOW)),
		true,
		`${RELEASE_WORKFLOW} may publish ${EXPECTED_DOWNLOAD_URL}; the menu must not use that as install`,
	)
	assert.equal(
		existsSync(join(root, CI_WORKFLOW)),
		true,
		`${CI_WORKFLOW} must exist so pull requests cannot merge untested`,
	)
	assert.equal(existsSync(join(root, PR_TEMPLATE)), true, `${PR_TEMPLATE} must exist`)
	const shipped = assertShippingContract(root)
	assert.equal(shipped.downloadUrl, EXPECTED_DOWNLOAD_URL)
	assert.ok(shipped.workflows.includes("ci.yml"))
	assert.ok(shipped.workflows.includes("release.yml"))
	assert.equal(shipped.workflows.includes("bump.yml"), false)
	assert.equal(shipped.workflows.includes("tag.yml"), false)
})

test("a URL-shaped Download link is not enough without CI and a Mac release job", () => {
	assert.throws(() => assertCiWorkflow("name: ci\non: push\n"), /pull_request/)
	assert.throws(() => assertCiWorkflow("on: pull_request\n"), /pnpm test/)
	assert.throws(
		() => assertCiWorkflow("on: pull_request\npnpm lint\npnpm typecheck\npnpm test\n"),
		/Playwright Chromium/,
	)
	assert.throws(() => assertReleaseWorkflow("on:\n  push:\n    tags:\n      - v*\n"), /main/)
	assert.throws(
		() => assertReleaseWorkflow("on:\n  push:\n    tags:\n      - v*\n    branches: [main]\n"),
		/macOS runner/,
	)
	assert.throws(
		() => assertReleaseWorkflow("on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\n"),
		/package:mac/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				"on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\n",
			),
		/gh release create/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				"on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\ngh release create\ncontents: write\n*.dmg\n",
			),
		/Moya_aarch64\.dmg/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				"on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\ngh release create\ncontents: write\n*.dmg\nMoya_aarch64.dmg\n",
			),
		/unset APPLE_CERTIFICATE/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				"on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\ngh release create\ncontents: write\n*.dmg\nMoya_aarch64.dmg\nunset APPLE_CERTIFICATE\n",
			),
		/APPLE_SIGNING_IDENTITY/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				'on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\ngh release create\ncontents: write\n*.dmg\nMoya_aarch64.dmg\nunset APPLE_CERTIFICATE\nAPPLE_SIGNING_IDENTITY="-"\n',
			),
		/codesign --verify/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				'on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\ngh release create\ncontents: write\n*.dmg\nMoya_aarch64.dmg\nunset APPLE_CERTIFICATE\nAPPLE_SIGNING_IDENTITY="-"\ncodesign --verify\n',
			),
		/CI=true/,
	)
	assert.throws(
		() =>
			assertReleaseWorkflow(
				'on:\n  push:\n    tags:\n      - v*\n    branches: [main]\nruns-on: macos-latest\nrun: pnpm package:mac\ngh release create\ncontents: write\n*.dmg\nMoya_aarch64.dmg\nunset APPLE_CERTIFICATE\nAPPLE_SIGNING_IDENTITY="-"\ncodesign --verify\nCI: "true"\n',
			),
		/fetch-depth/,
	)
})
