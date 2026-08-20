import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveGitVersion } from "./app-version.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const tagFlag = process.argv.indexOf("--tag")
const tag = tagFlag >= 0 ? process.argv[tagFlag + 1] : undefined
const version = resolveGitVersion(root)
if (tag) {
	const expected = String(tag).replace(/^v/, "")
	if (version !== expected) {
		throw new Error(`Tag ${tag} does not match git version ${version}`)
	}
}
process.stdout.write(`${version}\n`)
