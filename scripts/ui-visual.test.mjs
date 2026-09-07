import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { FONT } from "../src/lib/brand.ts"
import {
	auditFocusable,
	completeOnboarding,
	computedDisplayFont,
	launchPage,
	openSettings,
	SETTINGS_TABS,
	startApp,
	visibleCopy,
} from "./ui-visual.mjs"

describe("visual UI audit", { concurrency: 1 }, () => {
	/** @type {{ url: string, close: () => Promise<void> } | undefined} */
	let app
	/** @type {{ page: import("playwright").Page, close: () => Promise<void> } | undefined} */
	let session

	before(async () => {
		app = await startApp()
		session = await launchPage(app.url)
	})

	after(async () => {
		await session?.close()
		await app?.close()
	})

	test("the running app paints Moya type, not Times", async () => {
		assert.ok(session, "browser did not start")
		const { page } = session
		assert.equal(await page.title(), "Moya")
		assert.equal(await visibleCopy(page.locator(".type-display").first()), true)
		const family = await computedDisplayFont(page)
		assert.match(family, new RegExp(FONT.display))
		assert.doesNotMatch(family, /Times/)
		assert.doesNotMatch(family, /(?:^|,\s*)serif(?:\s*,|$)/)
	})

	test("first open is the onboarding dialog, not Settings", async () => {
		assert.ok(session)
		const { page } = session
		const onboard = page.getByRole("heading", { name: /Where should I think\?|How should I sound\?|How should I be\?/ })
		await onboard.first().waitFor({ state: "visible" })
		assert.equal(await visibleCopy(onboard.first()), true)
		assert.equal(await page.getByRole("heading", { name: "Settings" }).count(), 0)
		assert.equal(await page.getByRole("option", { name: /Bahh/ }).count(), 0)
	})

	test("home chrome controls paint a complete focus state", async () => {
		assert.ok(session)
		const { page } = session
		await completeOnboarding(page)
		const { audited, failures } = await auditFocusable(page, page.locator("body"), "home")
		assert.ok(audited.length >= 3, `home audit saw too few controls: ${audited.join(", ")}`)
		assert.deepEqual(failures, [])
	})

	test("each Settings surface paints every visible control's focus on all four sides", async () => {
		assert.ok(session)
		const { page } = session
		await openSettings(page)
		const dialog = page.locator("[data-slot=dialog-content]")
		assert.equal(await visibleCopy(page.getByRole("heading", { name: "Settings" })), true)

		const failures = []
		const audited = []
		for (const tab of SETTINGS_TABS) {
			await page.getByRole("tab", { name: tab }).click()
			await page.waitForTimeout(80)
			const result = await auditFocusable(page, dialog, `settings:${tab}`)
			audited.push(...result.audited)
			failures.push(...result.failures)
		}
		assert.ok(audited.length >= 8, `settings audit saw too few controls: ${audited.join(", ")}`)
		assert.deepEqual(failures, [])
	})

	test("Hear this voice sits on the same row as the Voice picker", async () => {
		assert.ok(session)
		const { page } = session
		const settingsHeading = page.getByRole("heading", { name: "Settings" })
		if (!(await settingsHeading.isVisible())) await openSettings(page)
		await page.getByRole("tab", { name: "Voice" }).click()
		const hear = page.getByRole("button", { name: "Hear this voice" })
		assert.equal(await hear.isVisible(), true)
		const picker = hear.locator("xpath=..").locator("[data-slot=select-trigger], input").first()
		assert.equal(await picker.isVisible(), true)
		const hearBox = await hear.boundingBox()
		const pickerBox = await picker.boundingBox()
		assert.ok(hearBox && pickerBox, "voice row did not paint")
		const overlapY =
			Math.min(hearBox.y + hearBox.height, pickerBox.y + pickerBox.height) - Math.max(hearBox.y, pickerBox.y)
		assert.ok(overlapY > hearBox.height * 0.5, `preview sat on another row (overlap ${overlapY})`)
		assert.ok(hearBox.x > pickerBox.x + pickerBox.width - 8, "preview is not to the right of the voice")
	})

	test("a typed turn is heard on Realtime, or shows an error", async () => {
		assert.ok(session)
		const { page } = session
		await completeOnboarding(page)
		const settingsHeading = page.getByRole("heading", { name: "Settings" })
		if (await settingsHeading.isVisible()) {
			await page.keyboard.press("Escape")
			await settingsHeading.waitFor({ state: "hidden" })
		}
		const typeBtn = page.getByRole("button", { name: "Type" })
		await typeBtn.waitFor({ state: "visible" })
		await typeBtn.click()
		const box = page.getByPlaceholder("Edit, then send")
		await box.waitFor({ state: "visible" })
		await box.fill("hello")
		const sockets = []
		page.on("websocket", (ws) => sockets.push(ws.url()))
		await page.getByRole("button", { name: "Send" }).click()
		const reply = page.locator("p.mt-3.max-w-md")
		const err = page.locator("p.text-xs.text-subtle")
		await reply.or(err).first().waitFor({ state: "visible", timeout: 45_000 })
		assert.equal(await page.getByText("Tap the core for voice").isVisible(), false)
		if (await reply.isVisible()) {
			const deadline = Date.now() + 5_000
			while (Date.now() < deadline && !sockets.some((url) => /\/realtime/.test(url))) {
				await page.waitForTimeout(50)
			}
			assert.ok(
				sockets.some((url) => /\/realtime/.test(url)),
				`typed reply was silent; sockets=${sockets.join(",") || "(none)"}`,
			)
		}
	})
})
