import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const script = join(dirname(fileURLToPath(import.meta.url)), "vercel-ignore-build.sh")

function git(cwd, ...args) {
	execFileSync("git", args, { cwd, stdio: "ignore" })
}

/** Commits `files` on top of a repo that already has one commit, then runs the ignore step. Returns its exit code. */
function ignoreExitCode(files) {
	const dir = mkdtempSync(join(tmpdir(), "moya-vercel-ignore-"))
	git(dir, "init", "-q")
	git(dir, "config", "user.email", "test@example.com")
	git(dir, "config", "user.name", "test")
	git(dir, "config", "commit.gpgsign", "false")
	writeFileSync(join(dir, "seed.txt"), "seed")
	git(dir, "add", ".")
	git(dir, "commit", "-q", "-m", "seed", "--no-verify")
	for (const file of files) {
		mkdirSync(dirname(join(dir, file)), { recursive: true })
		writeFileSync(join(dir, file), `changed ${file}`)
	}
	git(dir, "add", ".")
	git(dir, "commit", "-q", "-m", "change", "--no-verify")
	const env = { ...process.env }
	delete env.VERCEL_GIT_PREVIOUS_SHA
	return spawnSync("bash", [script], { cwd: dir, env }).status
}

test("a docs-only push is skipped", () => {
	assert.equal(
		ignoreExitCode(["AGENTS.md", "README.md", "memory-bank/notes.txt", ".github/pull_request_template.md"]),
		0,
	)
})

test("a push that touches shipped code builds", () => {
	assert.equal(ignoreExitCode(["AGENTS.md", "src/routes/index.tsx"]), 1)
	assert.equal(ignoreExitCode(["migrations/0001.sql"]), 1)
	assert.equal(ignoreExitCode(["package.json"]), 1)
})

test("a markdown file below the root still builds, because the app may import it", () => {
	assert.equal(ignoreExitCode(["src/content/guide.md"]), 1)
})

test("a push that cannot be diffed builds", () => {
	const dir = mkdtempSync(join(tmpdir(), "moya-vercel-ignore-empty-"))
	assert.equal(spawnSync("bash", [script], { cwd: dir }).status, 1)
})
