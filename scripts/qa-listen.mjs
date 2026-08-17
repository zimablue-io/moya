import { chromium } from "playwright"

const page = await (await chromium.launch({ headless: true })).newPage()
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => {
	if (m.type() === "error") errors.push(m.text())
})
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" })
await page.waitForTimeout(600)
await page.getByRole("button", { name: "Voice" }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: "/workspace/screenshots/moya-listen-a.png" })
await page.waitForTimeout(700)
await page.screenshot({ path: "/workspace/screenshots/moya-listen-b.png" })
const text = await page.locator("main").innerText()
console.log(JSON.stringify({ errors, text: text.slice(0, 400) }, null, 2))
await page.context().browser()?.close()
