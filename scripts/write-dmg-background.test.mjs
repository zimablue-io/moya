import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
	DMG_APP,
	DMG_APPLICATIONS,
	DMG_BACKGROUND,
	DMG_BG,
	DMG_WINDOW,
	renderDmgBackground,
} from "./write-dmg-background.mjs"

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "write-dmg-background.mjs"), "utf8")

test("DMG background is a PNG that matches the Finder window", () => {
	const png = renderDmgBackground()
	assert.equal(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true)
	assert.equal(DMG_WINDOW.width, 660)
	assert.equal(DMG_WINDOW.height, 400)
	assert.ok(DMG_APP.x < DMG_APPLICATIONS.x)
	assert.equal(DMG_BACKGROUND, "dmg/background.png")
})

test("DMG background stays light so Finder’s dark icon labels remain readable", () => {
	assert.ok(DMG_BG[0] > 0xc0 && DMG_BG[1] > 0xc0 && DMG_BG[2] > 0xc0)
})

test("DMG background is one full-bleed fill, not an inset card on Finder’s window", () => {
	assert.equal(src.includes("width - 36"), false)
	assert.equal(src.includes("DMG_CARD"), false)
})
