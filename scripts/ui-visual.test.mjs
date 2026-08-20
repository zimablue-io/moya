import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { FONT } from "../src/lib/brand.ts"
import {
	auditFocusable,
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

	test("home chrome controls paint a complete focus state", async () => {
		assert.ok(session)
		const { page } = session
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
})
