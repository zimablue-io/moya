import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { DOWNLOAD_APP_URL } from "../src/lib/brand.ts"
import {
	appVersions,
	assertBumpWorkflow,
	assertCiWorkflow,
	assertReleaseWorkflow,
	assertShippingContract,
	assertTagWorkflow,
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

test("Download and README advertise GitHub latest, which requires a publish workflow", () => {
	assert.equal(DOWNLOAD_APP_URL, EXPECTED_DOWNLOAD_URL)
	assert.equal(
		existsSync(join(root, RELEASE_WORKFLOW)),
		true,
		`${RELEASE_WORKFLOW} must exist because the product Download button points at ${EXPECTED_DOWNLOAD_URL}`,
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
	assert.ok(shipped.workflows.includes("bump.yml"))
	assert.ok(shipped.workflows.includes("tag.yml"))
})

test("a URL-shaped Download link is not enough without CI and a Mac release job", () => {
	assert.throws(() => assertCiWorkflow("name: ci\non: push\n"), /pull_request/)
	assert.throws(() => assertCiWorkflow("on: pull_request\n"), /pnpm test/)
	assert.throws(() => assertReleaseWorkflow("on:\n  push:\n    tags:\n      - v*\n"), /macOS runner/)
	assert.throws(
		() => assertReleaseWorkflow("on:\n  push:\n    tags:\n      - v*\nruns-on: macos-latest\n"),
		/package:mac/,
	)
	assert.throws(
		() => assertReleaseWorkflow("on:\n  push:\n    tags:\n      - v*\nruns-on: macos-latest\nrun: pnpm package:mac\n"),
		/gh release create/,
	)
	assert.throws(() => assertBumpWorkflow("on: push\n"), /workflow_dispatch/)
	assert.throws(() => assertTagWorkflow("on: push\n"), /main/)
})
