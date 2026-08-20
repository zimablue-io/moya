import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { assertVersionsMatch } from "./shipping-contract.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const tagFlag = process.argv.indexOf("--tag")
const tag = tagFlag >= 0 ? process.argv[tagFlag + 1] : undefined
const version = assertVersionsMatch(root, tag)
process.stdout.write(`${version}\n`)
