import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(rel) {
	return readFileSync(join(root, rel), "utf8")
}

test("package identity is Moya under MIT, not the app-builder scaffold name", () => {
	const pkg = JSON.parse(read("package.json"))
	assert.equal(pkg.name, "moya")
	assert.equal(pkg.license, "MIT")
	assert.equal(pkg.private, true)
	assert.match(pkg.repository?.url ?? "", /zimablue-io\/moya/)
})

test("LICENSE is MIT in Lefa Moffat’s name", () => {
	const license = read("LICENSE")
	assert.match(license, /MIT License/)
	assert.match(license, /Copyright \(c\) 2026 Lefa Moffat/)
})

test("public docs name the license and do not convert on login", () => {
	const readme = read("README.md")
	assert.match(readme, /\[MIT\]\(LICENSE\)/)
	assert.match(readme, /Local first/)
	assert.doesNotMatch(readme, /app-builder-workspace/)
	assert.match(read("CONTRIBUTING.md"), /MIT/)
	assert.match(read("SECURITY.md"), /security\/advisories/)
	assert.match(read("NOTICE"), /Ubuntu\s+Font Licence/)
	assert.doesNotMatch(read("AGENTS.md"), /\.grok\/skills\/ is platform/)
	assert.doesNotMatch(read("scripts/brand-check.mjs"), /\.grok\/skills/)
})
