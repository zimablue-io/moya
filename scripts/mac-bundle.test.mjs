import assert from "node:assert/strict"
import { test } from "node:test"
import {
	DEFAULT_APP,
	assessCodesignInfo,
	assertMacBundle,
	inspectLocalMacBundle,
	isShippingPath,
} from "./mac-bundle.mjs"

const LINKER_SIGNED = `Identifier=moya-6b36f263cd9b7465
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=75672 flags=0x20002(adhoc,linker-signed)
Signature=adhoc
Sealed Resources=none
TeamIdentifier=not set`

const SEALED_ADHOC = `Identifier=africa.moya
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=19244 flags=0x10002(adhoc,runtime)
Signature=adhoc
Sealed Resources version=2 rules=13 files=1
TeamIdentifier=not set`

test("the first published DMG's codesign info is rejected as damaged", () => {
	assert.throws(() => assessCodesignInfo(LINKER_SIGNED), /damaged/)
})

test("a sealed ad-hoc bundle is accepted", () => {
	assert.deepEqual(assessCodesignInfo(SEALED_ADHOC), { sealed: true })
})

test("a missing local .app fails before any GitHub upload", () => {
	assert.throws(() => assertMacBundle(DEFAULT_APP, { exists: false }), /package:mac/)
})

test("codesign --verify failure is not a pass", () => {
	assert.throws(
		() => assertMacBundle(DEFAULT_APP, { exists: true, verifyOk: false, codesignInfo: SEALED_ADHOC }),
		/codesign --verify/,
	)
})

test("inspectLocalMacBundle uses the local .app, not Actions", () => {
	const result = inspectLocalMacBundle(
		"/repo",
		DEFAULT_APP,
		(cmd, args) => {
			assert.equal(cmd, "codesign")
			assert.ok(args.includes("/repo/src-tauri/target/release/bundle/macos/Moya.app"))
			if (args.includes("--verify")) return { status: 0, stdout: "", stderr: "" }
			return { status: 0, stdout: "", stderr: SEALED_ADHOC }
		},
		() => true,
	)
	assert.equal(result.appPath, "/repo/src-tauri/target/release/bundle/macos/Moya.app")
})

test("packaging paths are the ones that require a local sealed bundle", () => {
	assert.equal(isShippingPath("src-tauri/tauri.conf.json"), true)
	assert.equal(isShippingPath(".github/workflows/release.yml"), true)
	assert.equal(isShippingPath("src/lib/brand.ts"), false)
})
