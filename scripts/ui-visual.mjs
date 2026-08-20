import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const PAD = 10
const BAND = 4
const FOCUS_DELTA = 5
const SIDES = ["top", "right", "bottom", "left"]

export const SETTINGS_TABS = ["General", "Voice", "Model", "Tools", "Sources", "Data"]

export async function freePort() {
	return new Promise((resolve, reject) => {
		const server = createServer()
		server.listen(0, "127.0.0.1", () => {
			const address = server.address()
			const port = typeof address === "object" && address ? address.port : 0
			server.close((error) => (error ? reject(error) : resolve(port)))
		})
		server.on("error", reject)
	})
}

export async function startApp() {
	const port = await freePort()
	const child = spawn("pnpm", ["exec", "vite", "dev", "--host", "127.0.0.1", "--port", String(port)], {
		cwd: root,
		stdio: ["ignore", "pipe", "pipe"],
	})
	const url = `http://127.0.0.1:${port}/`
	await waitForHttp(url, child)
	return {
		url,
		async close() {
			child.kill("SIGTERM")
			await new Promise((resolve) => child.once("exit", resolve))
		},
	}
}

async function waitForHttp(url, child) {
	const deadline = Date.now() + 45_000
	let stderr = ""
	child.stderr.on("data", (chunk) => {
		stderr += String(chunk)
	})
	child.on("exit", (code) => {
		if (code && Date.now() < deadline) {
			throw new Error(`vite exited ${code}: ${stderr.slice(-800)}`)
		}
	})
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
			if (response.ok) return
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250))
		}
	}
	throw new Error(`vite did not become ready at ${url}\n${stderr.slice(-800)}`)
}

export async function launchPage(url) {
	const browser = await chromium.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-dev-shm-usage"],
	})
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
	await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 })
	await page.evaluate(() => document.fonts.ready)
	await page.waitForTimeout(200)
	return {
		browser,
		page,
		async close() {
			await browser.close()
		},
	}
}

export async function openSettings(page) {
	await page.getByRole("button", { name: "Show tools" }).click()
	await page.getByRole("button", { name: /Settings/ }).click({ force: true })
	await page.getByRole("heading", { name: "Settings" }).waitFor({ state: "visible" })
}

export async function computedDisplayFont(page) {
	return page
		.locator(".type-display")
		.first()
		.evaluate((node) => getComputedStyle(node).fontFamily)
}

export async function visibleCopy(locator) {
	const box = await locator.boundingBox()
	if (!box || box.width < 2 || box.height < 2) return false
	return locator.isVisible()
}

/**
 * Compare rest vs keyboard-focus screenshots of a control, including a few
 * pixels of the parent. A cropped halo lights top/bottom and leaves the sides
 * dark. Class names are not consulted.
 */
export async function focusPaint(page, locator) {
	const box = await locator.boundingBox()
	if (!box) return { error: "no box", sides: {} }
	const clip = {
		x: Math.max(0, box.x - PAD),
		y: Math.max(0, box.y - PAD),
		width: box.width + PAD * 2,
		height: box.height + PAD * 2,
	}
	const rest = await page.screenshot({ clip, type: "png" })
	await locator.evaluate((node) => {
		if (node instanceof HTMLElement) node.focus({ focusVisible: true })
	})
	if (!(await locator.evaluate((node) => node === document.activeElement && node.matches(":focus-visible")))) {
		await page.keyboard.press("Tab")
		await locator.evaluate((node) => {
			if (node instanceof HTMLElement) node.focus({ focusVisible: true })
		})
	}
	if (!(await locator.evaluate((node) => node === document.activeElement && node.matches(":focus-visible")))) {
		return { error: "could not keyboard-focus", sides: {} }
	}
	await page.waitForTimeout(40)
	const next = await page.screenshot({ clip, type: "png" })
	const sides = await edgeDeltas(page, rest, next)
	return { sides, clip }
}

async function edgeDeltas(page, before, after) {
	return page.evaluate(
		async ({ beforeB64, afterB64, pad, band }) => {
			async function decode(b64) {
				const img = new Image()
				img.src = `data:image/png;base64,${b64}`
				await img.decode()
				const canvas = document.createElement("canvas")
				canvas.width = img.width
				canvas.height = img.height
				const ctx = canvas.getContext("2d")
				if (!ctx) throw new Error("no 2d context")
				ctx.drawImage(img, 0, 0)
				return ctx.getImageData(0, 0, img.width, img.height)
			}
			function peak(a, b, x0, y0, x1, y1) {
				let max = 0
				const left = Math.max(0, Math.floor(x0))
				const top = Math.max(0, Math.floor(y0))
				const right = Math.min(a.width, Math.ceil(x1))
				const bottom = Math.min(a.height, Math.ceil(y1))
				for (let y = top; y < bottom; y += 1) {
					for (let x = left; x < right; x += 1) {
						const i = (y * a.width + x) * 4
						const d =
							Math.abs(a.data[i] - b.data[i]) +
							Math.abs(a.data[i + 1] - b.data[i + 1]) +
							Math.abs(a.data[i + 2] - b.data[i + 2])
						if (d > max) max = d
					}
				}
				return max
			}
			const rest = await decode(beforeB64)
			const live = await decode(afterB64)
			const { width, height } = rest
			const inset = pad + 2
			const insetEndX = width - pad - 2
			const insetEndY = height - pad - 2
			const inner = {
				top: peak(rest, live, inset, pad, insetEndX, pad + band),
				bottom: peak(rest, live, inset, height - pad - band, insetEndX, height - pad),
				left: peak(rest, live, pad, inset, pad + band, insetEndY),
				right: peak(rest, live, width - pad - band, inset, width - pad, insetEndY),
			}
			const outer = {
				top: peak(rest, live, inset, pad - band, insetEndX, pad),
				bottom: peak(rest, live, inset, height - pad, insetEndX, height - pad + band),
				left: peak(rest, live, pad - band, inset, pad, insetEndY),
				right: peak(rest, live, width - pad, inset, width - pad + band, insetEndY),
			}
			return Object.fromEntries(
				["top", "right", "bottom", "left"].map((side) => [side, Math.max(inner[side], outer[side])]),
			)
		},
		{
			beforeB64: before.toString("base64"),
			afterB64: after.toString("base64"),
			pad: PAD,
			band: BAND,
		},
	)
}

export function missingFocusSides(sides) {
	return SIDES.filter((side) => (sides[side] ?? 0) < FOCUS_DELTA)
}

export function describeSides(sides) {
	return SIDES.map((side) => `${side}=${(sides[side] ?? 0).toFixed(1)}`).join(" ")
}

export async function auditFocusable(page, rootLocator, label) {
	const items = rootLocator.locator(
		'[data-slot="input"], [data-slot="textarea"], [data-slot="select-trigger"], [data-slot="switch"], [data-slot="tabs-trigger"], [data-slot="button"], [data-slot="slider-thumb"], button:not([data-slot]), [role="combobox"]',
	)
	const count = await items.count()
	const failures = []
	const audited = []
	for (let index = 0; index < count; index += 1) {
		const locator = items.nth(index)
		if (!(await locator.isVisible().catch(() => false))) continue
		if (await locator.isDisabled().catch(() => false)) continue
		const shown = await locator.evaluate((node) => {
			let current = node
			while (current instanceof HTMLElement) {
				const style = getComputedStyle(current)
				if (Number(style.opacity) < 0.5 || style.visibility === "hidden" || style.display === "none") return false
				current = current.parentElement
			}
			return true
		})
		if (!shown) continue
		const box = await locator.boundingBox()
		if (!box || box.width < 8 || box.height < 8) continue
		const name = await locator.evaluate((node) => {
			const slot = node.getAttribute("data-slot") ?? node.tagName.toLowerCase()
			const text = (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)
			return text ? `${slot}:${text}` : slot
		})
		const id = `${label} ${name}`
		audited.push(id)
		const paint = await focusPaint(page, locator)
		if (paint.error) {
			failures.push(`${id}: ${paint.error}`)
			continue
		}
		const missing = missingFocusSides(paint.sides)
		if (missing.length) {
			failures.push(`${id}: focus paint missing on ${missing.join(" and ")} (${describeSides(paint.sides)})`)
		}
	}
	return { audited, failures }
}
