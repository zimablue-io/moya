import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAuthClientConfig } from "../src/lib/auth/origin.ts";

test("tauri://localhost is not a Better Auth base URL", () => {
  const config = resolveAuthClientConfig("tauri://localhost");
  assert.equal(config.enabled, false);
  assert.match(config.baseURL ?? "", /^https?:\/\//);
});

test("http://tauri.localhost packaged webview is not a Better Auth host", () => {
  const config = resolveAuthClientConfig("http://tauri.localhost");
  assert.equal(config.enabled, false);
  assert.match(config.baseURL ?? "", /^https?:\/\//);
});

test("local vite / tauri-dev origin keeps auth on same-origin", () => {
  const config = resolveAuthClientConfig("http://127.0.0.1:8080");
  assert.equal(config.enabled, true);
  assert.equal(config.baseURL, undefined);
});

test("preview origin keeps auth on same-origin", () => {
  const config = resolveAuthClientConfig("https://demo.grok-sandbox.com");
  assert.equal(config.enabled, true);
  assert.equal(config.baseURL, undefined);
});
