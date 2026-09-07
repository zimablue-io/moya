import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { nativeInvokeError } from "../src/lib/llm-native.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("native invoke errors keep the engine message instead of blaming Settings", () => {
	assert.equal(nativeInvokeError(new Error("Insufficient Space of 512")), "Insufficient Space of 512")
	assert.equal(nativeInvokeError({ message: "Insufficient Space of 512" }), "Insufficient Space of 512")
	assert.equal(nativeInvokeError("Load a GGUF first."), "Load a GGUF first.")
	assert.equal(nativeInvokeError({}), "On-device model failed.")
	const catchPath = readFileSync(join(root, "src/lib/llm-native.ts"), "utf8")
	const completeFn = catchPath.slice(catchPath.indexOf("export async function completeNativeTurn"))
	assert.match(completeFn, /nativeInvokeError\(err\)/)
	assert.equal(
		/catch \(err\) \{[\s\S]*Pick a GGUF/.test(completeFn),
		false,
		"Tauri throws must not append Pick a GGUF — that hid Insufficient Space of 512",
	)
})

test("on-device decode sizes the batch to the context, not 512 tokens", () => {
	const llama = readFileSync(join(root, "src-tauri/src/llm/engine/llama.rs"), "utf8")
	assert.match(llama, /LlamaBatch::new\(n_batch as usize, 1\)/)
	assert.match(llama, /with_n_batch\(n_batch\)/)
	assert.equal(
		/LlamaBatch::new\(\s*512\s*,/.test(llama),
		false,
		"LlamaBatch::new(512) cannot hold toolsFor(); Talk died with Insufficient Space of 512",
	)
})

test("on-device GGUF is dropped on hide, quit, idle, and leaving ondevice", async () => {
	const llama = readFileSync(join(root, "src-tauri/src/llm/engine/llama.rs"), "utf8")
	const loaded = llama.slice(llama.indexOf("struct Loaded"), llama.indexOf("static LOADED"))
	const modelAt = loaded.indexOf("model: LlamaModel")
	const backendAt = loaded.indexOf("backend: LlamaBackend")
	assert.ok(
		modelAt >= 0 && backendAt > modelAt,
		"Drop order is field order; llama_free_model must run before llama_backend_free",
	)
	assert.match(llama, /IDLE_UNLOAD: Duration = Duration::from_secs\(5 \* 60\)/)
	assert.match(llama, /loaded\.last_used = Instant::now\(\)/)
	const loadFn = llama.slice(llama.indexOf("pub fn load"), llama.indexOf("pub fn unload"))
	const dropAt = loadFn.indexOf("*slot = None")
	const initAt = loadFn.indexOf("LlamaBackend::init")
	assert.ok(
		dropAt >= 0 && dropAt < initAt,
		"llama-cpp-2 init is a process AtomicBool; a second init without Drop is BackendAlreadyInitialized",
	)

	const lib = readFileSync(join(root, "src-tauri/src/lib.rs"), "utf8")
	assert.match(lib, /llm::unload_engine\(\)/)
	assert.match(lib, /llm::schedule_unload_engine\(\)/)
	assert.match(lib, /RunEvent::Exit/)
	assert.match(lib, /CloseRequested/)
	const close = lib.slice(lib.indexOf("CloseRequested"), lib.indexOf("prevent_close"))
	assert.match(close, /schedule_unload_engine/)

	const picker = readFileSync(join(root, "src/components/settings-ondevice.tsx"), "utf8")
	assert.equal(/llmLoad\(/.test(picker), false, "picking a GGUF must not mmap Metal until a turn")

	const store = readFileSync(join(root, "src/lib/store.ts"), "utf8")
	assert.match(store, /releaseOnDeviceEngineIfUnused/)
	assert.match(store, /watchOnDeviceEngineLifetime/)

	const native = readFileSync(join(root, "src/lib/llm-native.ts"), "utf8")
	assert.match(native, /pagehide/)
	assert.equal(/visibilitychange/.test(native), false, "cmd-tab must not dump the GGUF")
	const { releaseOnDeviceEngineIfUnused } = await import("../src/lib/llm-native.ts")
	await releaseOnDeviceEngineIfUnused("ondevice")
})
