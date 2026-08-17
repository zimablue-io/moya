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

function box(handle) {
	return handle.evaluate((el) => {
		const r = el.getBoundingClientRect()
		return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
	})
}

async function stableBox(handle) {
	let last = await box(handle)
	for (let i = 0; i < 12; i += 1) {
		await page.waitForTimeout(80)
		const next = await box(handle)
		if (next.w === last.w && next.h === last.h && next.x === last.x && next.y === last.y) return next
		last = next
	}
	return last
}

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

	const showTools = page.getByRole("button", { name: "Show tools" })
	for (let i = 0; i < 6; i += 1) {
		if ((await page.locator("header button[aria-label='Hide tools']").count()) > 0) break
		await showTools.evaluate((el) => el.click())
		await page.waitForTimeout(120)
	}
	await page.locator("header button[aria-label='Hide tools']").waitFor({ timeout: 5000 })
	await page.getByRole("button", { name: "Transcript Every word" }).evaluate((el) => el.click())
	const dialog = page.getByRole("dialog")
	await dialog.getByRole("heading", { name: "Transcript" }).waitFor()

	const listBox = await stableBox(dialog)
	const seeded = (await dialog.getByText("Remember that I like morning walks.").count()) > 0
	if (seeded) {
		assert.ok(await dialog.getByText(/turn/).count())
		assert.ok(await dialog.getByRole("slider", { name: "Transcript position" }).count())
	}

	await dialog.getByRole("button", { name: "Calendar" }).click()
	await dialog.getByRole("button", { name: "Next month" }).waitFor()
	const calendarBox = await stableBox(dialog)
	assert.deepEqual(calendarBox, listBox, "dialog size shifted between List and Calendar")

	const prev = dialog.getByRole("button", { name: "Previous month" })
	const next = dialog.getByRole("button", { name: "Next month" })
	assert.equal(await prev.count(), 1, "missing previous-month control")
	assert.equal(await next.count(), 1, "missing next-month control")
	const prevBox = await box(prev)
	const nextBox = await box(next)
	assert.ok(nextBox.x > prevBox.x + 200, `next month is not to the right of previous (${prevBox.x} vs ${nextBox.x})`)
	assert.ok(Math.abs(nextBox.y - prevBox.y) <= 4, `month arrows are not aligned (${prevBox.y} vs ${nextBox.y})`)
	assert.equal(prevBox.w, nextBox.w)

	const today = dialog.getByRole("button", { name: /Today,/ })
	await today.waitFor()
	if (seeded) assert.match(await today.innerText(), /turn/)

	const emptyDay = dialog.getByRole("button", { name: /August 15th/ })
	assert.equal(await emptyDay.getAttribute("data-hover"), "false")
	const dayBox = await emptyDay.boundingBox()
	assert.ok(dayBox, "calendar day has no box")
	await page.mouse.move(dayBox.x + dayBox.width / 2, dayBox.y + dayBox.height / 2)
	if ((await emptyDay.getAttribute("data-hover")) !== "true") {
		await emptyDay.dispatchEvent("pointerenter")
	}
	assert.equal(await emptyDay.getAttribute("data-hover"), "true", "day hover did not engage")
	await emptyDay.evaluate(async (el) => {
		for (let i = 0; i < 30; i += 1) {
			if (getComputedStyle(el).backgroundColor === "rgb(28, 28, 26)") return
			await new Promise((r) => requestAnimationFrame(r))
		}
	})
	const hoverBg = await emptyDay.evaluate((el) => getComputedStyle(el).backgroundColor)
	assert.equal(hoverBg, "rgb(28, 28, 26)", `day hover fill was ${hoverBg}`)

	await next.click()
	await dialog.locator("p.type-display").filter({ hasText: "September 2026" }).waitFor()
	const afterMonthBox = await stableBox(dialog)
	assert.deepEqual(afterMonthBox, listBox, "dialog size shifted after changing month")
	await prev.click()
	await dialog.locator("p.type-display").filter({ hasText: "August 2026" }).waitFor()

	await today.click()
	await dialog.getByPlaceholder("Search").waitFor()
	assert.ok(await dialog.getByRole("button", { name: /All days/ }).count())
	if (seeded) assert.ok(await dialog.getByText("Remember that I like morning walks.").count())
	const afterPickBox = await stableBox(dialog)
	assert.deepEqual(afterPickBox, listBox, "dialog size shifted after picking a day")

	assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`)
	console.log(
		JSON.stringify(
			{
				ok: true,
				dialog: listBox,
				prev: prevBox,
				next: nextBox,
				hover: { hoverBg },
				seeded,
			},
			null,
			2,
		),
	)
} finally {
	await browser.close()
}
