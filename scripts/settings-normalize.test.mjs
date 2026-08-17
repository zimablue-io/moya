import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpenAiModelIds } from "../src/lib/provider-models.ts";
import { llamaCppBaseUrl, normalizeSettings, PROVIDER_PRESETS } from "../src/lib/types.ts";

test("defaults when given empty input", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.provider.id, "xai");
  assert.equal(settings.provider.baseUrl, PROVIDER_PRESETS.xai.baseUrl);
  assert.equal("engine" in settings, false);
});

test("llama.cpp defaults to llama-server's own port", () => {
  assert.equal(PROVIDER_PRESETS.llamacpp.baseUrl, "http://127.0.0.1:8080/v1");
});

test("llama.cpp uses the stored base URL, including its port", () => {
  const settings = normalizeSettings({
    provider: { id: "llamacpp", model: "qwen3", baseUrl: "http://127.0.0.1:7777/v1", apiKey: "" },
  });
  assert.equal(settings.provider.id, "llamacpp");
  assert.equal(settings.provider.baseUrl, "http://127.0.0.1:7777/v1");
  assert.equal(settings.provider.model, "qwen3");
  assert.equal("engine" in settings, false);
});

test("a leftover engine port becomes the llama.cpp base URL once", () => {
  const settings = normalizeSettings({
    provider: { id: "llamacpp", model: "", baseUrl: "", apiKey: "" },
    engine: { port: 7777 },
  });
  assert.equal(settings.provider.baseUrl, llamaCppBaseUrl(7777));
  assert.equal("engine" in settings, false);
});

test("a leftover Hugging Face repo is not copied from engine into the provider", () => {
  const settings = normalizeSettings({
    provider: { id: "llamacpp", model: "", baseUrl: "", apiKey: "" },
    engine: { source: "huggingface", model: "Qwen/Qwen2.5-1.5B-Instruct-GGUF" },
  });
  assert.equal(settings.provider.model, "");
  assert.equal("engine" in settings, false);
});

test("a leftover engine port does not rewrite a cloud provider URL", () => {
  const settings = normalizeSettings({
    provider: { id: "openai", model: "gpt-4.1", baseUrl: "https://api.openai.com/v1", apiKey: "k" },
    engine: { autoStart: true, port: 9090 },
  });
  assert.equal(settings.provider.id, "openai");
  assert.equal(settings.provider.baseUrl, "https://api.openai.com/v1");
  assert.equal("engine" in settings, false);
});

test("empty OpenAI URL does not become the xAI URL", () => {
  const settings = normalizeSettings({
    provider: { id: "openai", model: "", baseUrl: "", apiKey: "" },
  });
  assert.equal(settings.provider.id, "openai");
  assert.equal(settings.provider.baseUrl, PROVIDER_PRESETS.openai.baseUrl);
  assert.equal(settings.provider.model, PROVIDER_PRESETS.openai.model);
});

test("unknown keys are not kept on settings", () => {
  const settings = normalizeSettings({
    agentName: "Moya",
    extra: true,
    engine: { extra: true },
  });
  assert.equal("extra" in settings, false);
  assert.equal("engine" in settings, false);
});

test("OpenAI-style /models payloads become a flat id list", () => {
  assert.deepEqual(
    parseOpenAiModelIds({
      data: [{ id: "grok-4.5" }, { id: "grok-3" }, { name: "ignored-if-id-present", id: "grok-2" }],
    }),
    ["grok-4.5", "grok-3", "grok-2"],
  );
});

test("Ollama-style /models payloads use name", () => {
  assert.deepEqual(
    parseOpenAiModelIds({
      models: [{ name: "qwen3:8b" }, { name: "llama3.2" }],
    }),
    ["qwen3:8b", "llama3.2"],
  );
});
