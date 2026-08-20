import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const mic = "Moya needs the microphone when you tap Voice or hold to talk."
const speech = "Moya turns what you say into text on this device."

function patchAndroid() {
	const path = join(root, "src-tauri/gen/android/app/src/main/AndroidManifest.xml")
	if (!existsSync(path)) return false
	let xml = readFileSync(path, "utf8")
	if (!xml.includes("android.permission.RECORD_AUDIO")) {
		xml = xml.replace(
			'<uses-permission android:name="android.permission.INTERNET" />',
			'<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
		)
		writeFileSync(path, xml)
	}
	return xml.includes("android.permission.RECORD_AUDIO")
}

function insertPlist(xml, key, value) {
	if (xml.includes(`<key>${key}</key>`)) return xml
	return xml.replace("</dict>\n</plist>", `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`)
}

function patchIos() {
	const path = join(root, "src-tauri/gen/apple/moya_iOS/Info.plist")
	if (!existsSync(path)) return false
	let xml = readFileSync(path, "utf8")
	xml = insertPlist(xml, "NSMicrophoneUsageDescription", mic)
	xml = insertPlist(xml, "NSSpeechRecognitionUsageDescription", speech)
	writeFileSync(path, xml)
	return xml.includes("NSMicrophoneUsageDescription")
}

const android = patchAndroid()
const ios = patchIos()
if (!android && !ios) {
	console.error("No generated Android or iOS project to patch. Run pnpm android:init / pnpm ios:init first.")
	process.exit(1)
}
