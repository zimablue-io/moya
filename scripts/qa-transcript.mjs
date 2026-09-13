import assert from "node:assert/strict"
import { chromium } from "playwright"

const url = process.argv[2] ?? "http://127.0.0.1:5173/"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => {
	if (m.type() === "error") errors.push(m.text())
})

async function waitForReply() {
	const deadline = Date.now() + 4000
	while (Date.now() < deadline) {
		const text = await page.locator("main").innerText()
		if (/\bThinking\b/.test(text)) {
			await page.waitForTimeout(250)
			continue
		}
		if (/Kept\.|model is not connected|Done\./i.test(text)) return
		await page.waitForTimeout(250)
	}
}

try {
	const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
	assert.ok(resp && resp.status() < 400, `page failed to load: ${resp?.status()}`)
	await page.getByText("Idle", { exact: true }).waitFor({ timeout: 15000 })

	await page.getByRole("button", { name: "Type" }).click()
	const composer = page.getByPlaceholder("Edit, then send")
	try {
		await composer.waitFor({ state: "visible", timeout: 4000 })
	} catch {
		await page.keyboard.press("t")
		await composer.waitFor({ state: "visible", timeout: 4000 })
	}
	await composer.fill("Remember that I like morning walks.")
	await composer.press("Enter")
	await page.waitForTimeout(800)
	await waitForReply()

	const side = page.getByRole("complementary")
	await page.getByRole("button", { name: "Show conversation" }).click()
	await side.waitFor({ timeout: 5000 })
	assert.match(await side.innerText(), /Conversation/)
	await page.getByRole("button", { name: "Hide conversation" }).click()
	await side.waitFor({ state: "hidden", timeout: 5000 })
	assert.equal(await page.getByRole("button", { name: "Calendar" }).count(), 0)
	assert.equal(await page.getByPlaceholder("Search").count(), 0)

	assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`)
	console.log(JSON.stringify({ ok: true, conversation: true }, null, 2))
} finally {
	await browser.close()
}
