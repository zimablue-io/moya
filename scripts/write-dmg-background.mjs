import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

/** Matches the Finder window exactly — one full-bleed fill. An inset card shows as a second background. */
export const DMG_WINDOW = { width: 660, height: 400 }
export const DMG_APP = { x: 160, y: 190 }
export const DMG_APPLICATIONS = { x: 500, y: 190 }
export const DMG_BACKGROUND = "dmg/background.png"

/** Finder icon labels are dark. The fill must stay light or “Moya” / “Applications” vanish. */
export const DMG_BG = [0xf7, 0xf5, 0xf0, 0xff]
export const DMG_ARROW = [0x5c, 0x5a, 0x55, 0xff]

function crc32(buf) {
	let crc = ~0
	for (const byte of buf) {
		crc ^= byte
		for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
	}
	return ~crc >>> 0
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type)
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length)
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
	return Buffer.concat([len, typeBuf, data, crc])
}

function writePng(width, height, pixels) {
	const raw = Buffer.alloc((width * 4 + 1) * height)
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0
		pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(width, 0)
	ihdr.writeUInt32BE(height, 4)
	ihdr[8] = 8
	ihdr[9] = 6
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	])
}

function setPixel(pixels, width, x, y, rgba) {
	if (x < 0 || y < 0 || x >= width || y >= DMG_WINDOW.height) return
	const i = (y * width + x) * 4
	pixels[i] = rgba[0]
	pixels[i + 1] = rgba[1]
	pixels[i + 2] = rgba[2]
	pixels[i + 3] = rgba[3]
}

function fillRect(pixels, width, x0, y0, x1, y1, rgba) {
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) setPixel(pixels, width, x, y, rgba)
	}
}

export function renderDmgBackground() {
	const { width, height } = DMG_WINDOW
	const pixels = Buffer.alloc(width * height * 4)
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = DMG_BG[0]
		pixels[i + 1] = DMG_BG[1]
		pixels[i + 2] = DMG_BG[2]
		pixels[i + 3] = DMG_BG[3]
	}
	const shaftY0 = 186
	const shaftY1 = 198
	fillRect(pixels, width, 292, shaftY0, 352, shaftY1, DMG_ARROW)
	for (let i = 0; i < 22; i++) {
		const x = 348 + i
		const inset = Math.floor(i * 0.7)
		fillRect(pixels, width, x, 176 + inset, x + 1, 208 - inset, DMG_ARROW)
	}
	return writePng(width, height, pixels)
}

export function writeDmgBackground(root) {
	const rel = join("src-tauri", DMG_BACKGROUND)
	const dest = join(root, rel)
	mkdirSync(dirname(dest), { recursive: true })
	writeFileSync(dest, renderDmgBackground())
	return rel
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)))
	console.log(`dmg background: ${writeDmgBackground(root)}`)
}
