# Voice is the product

Moya is a spoken household assistant. A turn that only paints a caption is unfinished.

- Talk, Type, and Hear this voice all speak through the configured Realtime voice.
- Typed send: `prepareSpokenReply` on the click, then `speakReply` after the model. Do not wait on `AudioContext.resume()` to open the socket.
- Do not claim done, fixed, or working until the reply is heard, or a real speak error is shown.
- `scripts/voice-system.test.mjs` and the typed-turn ui-visual `/realtime` websocket must stay red if this regresses.
