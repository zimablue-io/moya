import assert from "node:assert/strict"
import { test } from "node:test"
import { DOWNLOAD_APP_URL } from "../src/lib/brand.ts"
import { GITHUB_LATEST_RELEASE_API, resolveMacDownloadUrl } from "../src/lib/mac-download.ts"
import { EXPECTED_DOWNLOAD_URL } from "./shipping-contract.mjs"

function jsonResponse(status, body) {
	return {
		ok: status >= 200 && status < 300,
		json: async () => body,
	}
}

test("resolveMacDownloadUrl stays off a 404 latest/download shortcut", () => {
	assert.equal(DOWNLOAD_APP_URL, EXPECTED_DOWNLOAD_URL)
})

test("no latest release means no Download href", async () => {
	const url = await resolveMacDownloadUrl(async (input) => {
		assert.equal(String(input), GITHUB_LATEST_RELEASE_API)
		return jsonResponse(404, { message: "Not Found" })
	})
	assert.equal(url, null)
})

test("a latest release without the stable DMG means no Download href", async () => {
	const url = await resolveMacDownloadUrl(async () =>
		jsonResponse(200, { assets: [{ name: "Moya_0.1.0_aarch64.dmg", browser_download_url: "https://example/wrong" }] }),
	)
	assert.equal(url, null)
})

test("the stable DMG on latest unlocks the advertised download URL", async () => {
	const url = await resolveMacDownloadUrl(async () =>
		jsonResponse(200, {
			assets: [
				{
					name: "Moya_aarch64.dmg",
					browser_download_url: "https://github.com/zimablue-io/moya/releases/download/v0.1.0/Moya_aarch64.dmg",
				},
			],
		}),
	)
	assert.equal(url, EXPECTED_DOWNLOAD_URL)
})

test("a thrown fetch does not invent a download href", async () => {
	const url = await resolveMacDownloadUrl(async () => {
		throw new Error("offline")
	})
	assert.equal(url, null)
})
