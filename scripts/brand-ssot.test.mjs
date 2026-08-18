import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { APP_NAME, COLOR, FONT, TAGLINE } from "../src/lib/brand.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(rel) {
	return readFileSync(join(root, rel), "utf8")
}

function walkSrc(dir = join(root, "src"), acc = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) walkSrc(path, acc)
		else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(path)
	}
	return acc
}

test("styles.css tokens match brand.ts", () => {
	const css = read("src/styles.css")
	for (const [key, hex] of Object.entries(COLOR)) {
		const token = key === "surface2" ? "surface-2" : key
		assert.match(css, new RegExp(`--color-${token}:\\s*${hex}`), `--color-${token} must be ${hex}`)
	}
	assert.match(css, new RegExp(`--font-sans:\\s*"${FONT.sans}"`))
	assert.match(css, new RegExp(`--font-display:\\s*"${FONT.display}"`))
	assert.match(css, /@import "@fontsource\/ubuntu\/400\.css"/)
	assert.match(css, /@import "@fontsource\/bricolage-grotesque\/400\.css"/)
	assert.doesNotMatch(css, /--font-mono/)
	assert.doesNotMatch(css, /fonts\.googleapis\.com/)
	assert.doesNotMatch(css, /Source Serif|Instrument Serif|Figtree|Playfair|Fraunces|Newsreader|Times New Roman/)
	assert.doesNotMatch(css, /--font-display:[^;]*,\s*serif\s*;/)
	assert.doesNotMatch(FONT.display, /serif/i)
	assert.doesNotMatch(FONT.sans, /serif/i)
	assert.equal(Object.keys(FONT).length, 2)
})

test("root head and native chrome read brand.ts", () => {
	const rootTsx = read("src/routes/__root.tsx")
	assert.match(rootTsx, /APP_NAME/)
	assert.match(rootTsx, /TAGLINE/)
	assert.match(rootTsx, /COLOR\.bg/)
	assert.doesNotMatch(rootTsx, /FONT_HREF/)
	assert.doesNotMatch(rootTsx, /fonts\.googleapis\.com/)
	assert.doesNotMatch(rootTsx, /#0b0b0a/)

	const favicon = read("public/favicon.svg")
	assert.match(favicon, new RegExp(COLOR.bg))
	assert.match(favicon, new RegExp(COLOR.accent))

	const tauri = read("src-tauri/tauri.conf.json")
	assert.match(tauri, new RegExp(`"productName":\\s*"${APP_NAME}"`))
	assert.match(tauri, new RegExp(`"backgroundColor":\\s*"${COLOR.bg}"`))
	assert.equal(TAGLINE.length > 0, true)
})

test("src has one name, palette, and type-role source", () => {
	const brandPath = join(root, "src/lib/brand.ts")
	const hex = Object.values(COLOR)
	const banned = [
		/"Moya"|'Moya'/,
		/\bfont-display\b/,
		/\btracking-wide\b/,
		/tracking-\[/,
		/(?:^|[\s"'`])uppercase(?:[\s"'`]|$)/,
		...hex.map((h) => new RegExp(h.replace("#", "#"))),
	]
	for (const file of walkSrc()) {
		if (file === brandPath) continue
		const src = readFileSync(file, "utf8")
		for (const pattern of banned) {
			assert.doesNotMatch(src, pattern, `${file} still has ${pattern}`)
		}
	}
})
