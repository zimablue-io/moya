import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "src")

function walk(dir = src, acc = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) walk(path, acc)
		else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(path)
	}
	return acc
}

function classLiterals(source) {
	return [
		...source.matchAll(/className=\{?cn\(([\s\S]*?)\)\}?|className="([^"]+)"|className=\{`([\s\S]*?)`\}/g),
	].flatMap((match) => [match[1], match[2], match[3]].filter(Boolean))
}

test("focus and invalid rings are inset so overflow parents cannot crop them", () => {
	const ring = /(?:focus-visible|aria-invalid):ring-(?:\d|ring)/
	for (const file of walk()) {
		const source = readFileSync(file, "utf8")
		for (const chunk of classLiterals(source)) {
			if (!ring.test(chunk)) continue
			assert.match(
				chunk,
				/\bring-inset\b/,
				`${file} paints a ring without ring-inset. Outset box-shadow rings clip inside Dialog, ScrollArea, and the app shell.`,
			)
		}
	}
})
