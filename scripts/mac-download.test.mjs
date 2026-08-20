import assert from "node:assert/strict"
import { test } from "node:test"
import { MAC_APP_INSTALL_URL } from "../src/lib/brand.ts"
import { macAppInstallUrl } from "../src/lib/mac-download.ts"

test("Mac app install is the repo README, not a GitHub DMG", () => {
	assert.equal(macAppInstallUrl(), MAC_APP_INSTALL_URL)
	assert.match(MAC_APP_INSTALL_URL, /#mac-app$/)
	assert.equal(MAC_APP_INSTALL_URL.includes("/releases/"), false)
	assert.equal(MAC_APP_INSTALL_URL.includes(".dmg"), false)
})
