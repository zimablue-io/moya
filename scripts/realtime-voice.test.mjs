import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base64ToPcm16,
  capturePcm16Base64,
  floatToPcm16,
  pcm16ToBase64,
  pcm16ToFloat,
  resampleLinear,
} from "../src/lib/pcm.ts";
import {
  applyTranscriptBit,
  audioDeltaFromEvent,
  buildSessionUpdate,
  functionCallFromEvent,
  realtimeSocketUrl,
  resolveVoiceApiKey,
  transcriptFromEvent,
  websocketProtocols,
} from "../src/lib/realtime-protocol.ts";
import { POCKET_TTS_VOICES, speakersFor } from "../src/lib/types.ts";
import {
  listRealtimeSpeakers,
  parsePocketVoiceTree,
  parseTtsVoices,
} from "../src/lib/voice-catalog.ts";

test("http voice URLs become websocket realtime URLs", () => {
  assert.equal(
    realtimeSocketUrl("http://127.0.0.1:8765/v1", "local"),
    "ws://127.0.0.1:8765/v1/realtime?model=local",
  );
  assert.equal(
    realtimeSocketUrl("https://api.x.ai/v1", "grok-voice-latest"),
    "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
  );
  assert.equal(
    realtimeSocketUrl("ws://127.0.0.1:8765/v1/realtime", "local"),
    "ws://127.0.0.1:8765/v1/realtime?model=local",
  );
});

test("xAI reuses the chat key when the voice key is blank", () => {
  assert.equal(
    resolveVoiceApiKey(
      {
        id: "xai",
        model: "grok-voice-latest",
        baseUrl: "https://api.x.ai/v1",
        apiKey: "",
        voice: "eve",
      },
      { id: "xai", model: "grok-4.5", baseUrl: "https://api.x.ai/v1", apiKey: "sk-live" },
    ),
    "sk-live",
  );
  assert.equal(
    resolveVoiceApiKey(
      { id: "s2s", model: "local", baseUrl: "http://127.0.0.1:8765/v1", apiKey: "", voice: "" },
      { id: "xai", model: "grok-4.5", baseUrl: "https://api.x.ai/v1", apiKey: "sk-live" },
    ),
    "",
  );
});

test("xAI browser sockets use the client-secret subprotocol", () => {
  assert.deepEqual(websocketProtocols("xai", "tok_1"), ["xai-client-secret.tok_1"]);
  assert.equal(websocketProtocols("s2s", ""), undefined);
});

test("local realtime falls back to Pocket presets", () => {
  assert.deepEqual(
    speakersFor("s2s").map((v) => v.id),
    POCKET_TTS_VOICES.map((v) => v.id),
  );
  assert.ok(speakersFor("s2s").some((v) => v.id === "jean"));
  assert.deepEqual(speakersFor("custom"), []);
  assert.deepEqual(
    speakersFor("xai").map((v) => v.id),
    ["eve", "ara", "leo", "rex", "sal"],
  );
  assert.ok(speakersFor("openai").some((v) => v.id === "marin"));
  assert.ok(speakersFor("openai").some((v) => v.id === "cedar"));
});

test("GA and beta audio delta names both yield PCM", () => {
  assert.equal(audioDeltaFromEvent({ type: "response.output_audio.delta", delta: "abc" }), "abc");
  assert.equal(audioDeltaFromEvent({ type: "response.audio.delta", audio: "xyz" }), "xyz");
  assert.equal(audioDeltaFromEvent({ type: "response.done" }), null);
});

test("xAI cumulative transcripts replace, OpenAI deltas append", () => {
  assert.deepEqual(
    transcriptFromEvent({
      type: "conversation.item.input_audio_transcription.updated",
      transcript: "hello there",
    }),
    { role: "user", text: "hello there", mode: "replace" },
  );
  assert.deepEqual(
    transcriptFromEvent({
      type: "conversation.item.input_audio_transcription.delta",
      delta: "hel",
    }),
    { role: "user", text: "hel", mode: "delta" },
  );
  assert.deepEqual(
    transcriptFromEvent({
      type: "response.output_audio_transcript.done",
      transcript: "On it.",
    }),
    { role: "assistant", text: "On it.", mode: "final" },
  );
});

test("tool calls come from function_call_arguments.done", () => {
  assert.deepEqual(
    functionCallFromEvent({
      type: "response.function_call_arguments.done",
      call_id: "c1",
      name: "memory_write",
      arguments: '{"kind":"fact","text":"tea"}',
    }),
    {
      callId: "c1",
      name: "memory_write",
      arguments: '{"kind":"fact","text":"tea"}',
    },
  );
});

test("session.update is Realtime GA shaped", () => {
  const event = buildSessionUpdate({
    instructions: "You are Moya.",
    voice: "eve",
    tools: [
      {
        type: "function",
        name: "memory_write",
        description: "Remember",
        parameters: { type: "object" },
      },
    ],
  });
  const session = event.session;
  assert.equal(event.type, "session.update");
  assert.equal(session.type, "realtime");
  assert.equal(session.audio.input.format.rate, 24_000);
  assert.equal(session.audio.output.voice, "eve");
  assert.equal(session.tools[0].name, "memory_write");
});

test("48 kHz capture downsamples to 24 kHz PCM16", () => {
  const input = Float32Array.from({ length: 48 }, (_, i) => Math.sin(i / 8));
  const resampled = resampleLinear(input, 48_000, 24_000);
  assert.equal(resampled.length, 24);
  const b64 = capturePcm16Base64(input, 48_000, 24_000);
  assert.equal(typeof b64, "string");
  assert.ok((b64 ?? "").length > 0);
  const pcm = floatToPcm16(input);
  const roundtrip = pcm16ToFloat(base64ToPcm16(pcm16ToBase64(pcm)));
  assert.equal(roundtrip.length, input.length);
  assert.ok(Math.abs((roundtrip[3] ?? 0) - (input[3] ?? 0)) < 0.01);
});

test("sidecar cumulative STT deltas replace instead of concatenating", () => {
  const parts = [
    "Okay.",
    "Okay.",
    "Okay, this is just",
    "Okay, this is just a test.",
    "Okay, this is just a test, test, test.",
  ];
  let text = "";
  for (const part of parts) text = applyTranscriptBit(text, part, "delta");
  assert.equal(text, "Okay, this is just a test, test, test.");
});

test("OpenAI incremental STT deltas still append", () => {
  let text = applyTranscriptBit("", "Hel", "delta");
  text = applyTranscriptBit(text, "lo", "delta");
  text = applyTranscriptBit(text, " there", "delta");
  assert.equal(text, "Hello there");
});

test("final transcripts replace the live buffer", () => {
  const live = applyTranscriptBit("Okay.Okay.", "Okay, this is just a test.", "final");
  assert.equal(live, "Okay, this is just a test.");
});

test("xAI voice JSON becomes speaker options", () => {
  assert.deepEqual(
    parseTtsVoices({
      voices: [
        { voice_id: "eve", name: "Eve" },
        { voice_id: "carina", name: "Carina" },
        { voice_id: "eve", name: "Eve" },
      ],
    }),
    [
      { id: "eve", label: "Eve" },
      { id: "carina", label: "Carina" },
    ],
  );
});

test("Pocket embedding filenames become speaker ids", () => {
  assert.deepEqual(
    parsePocketVoiceTree([
      { type: "file", path: "alba.safetensors" },
      { type: "file", path: "embeddings/jean.safetensors" },
      { type: "directory", path: "other" },
    ]),
    [
      { id: "alba", label: "Alba" },
      { id: "jean", label: "Jean" },
    ],
  );
});

test("Grok speakers prefer the live /v1/tts/voices list", async () => {
  const listed = await listRealtimeSpeakers(
    { id: "xai", baseUrl: "https://api.x.ai/v1", apiKey: "sk" },
    {
      fetch: async (url) => {
        assert.equal(String(url), "https://api.x.ai/v1/tts/voices");
        return {
          ok: true,
          json: async () => ({
            voices: [
              { voice_id: "carina", name: "Carina" },
              { voice_id: "eve", name: "Eve" },
            ],
          }),
        };
      },
    },
  );
  assert.deepEqual(
    listed.map((v) => v.id),
    ["carina", "eve"],
  );
});

test("Local speakers prefer sidecar /v1/voices, then Pocket presets", async () => {
  const fromSidecar = await listRealtimeSpeakers(
    { id: "s2s", baseUrl: "http://127.0.0.1:8765/v1", apiKey: "" },
    {
      fetch: async (url) => {
        assert.equal(String(url), "http://127.0.0.1:8765/v1/voices");
        return {
          ok: true,
          json: async () => ({ voices: ["Ryan", "Vivian"] }),
        };
      },
    },
  );
  assert.deepEqual(
    fromSidecar.map((v) => v.id),
    ["Ryan", "Vivian"],
  );

  const fromPocket = await listRealtimeSpeakers(
    { id: "s2s", baseUrl: "http://127.0.0.1:8765/v1", apiKey: "" },
    {
      fetch: async (url) => {
        if (String(url).endsWith("/voices")) return { ok: false, json: async () => ({}) };
        return {
          ok: true,
          json: async () => [{ type: "file", path: "fantine.safetensors" }],
        };
      },
    },
  );
  assert.deepEqual(
    fromPocket.map((v) => v.id),
    ["fantine"],
  );
});
