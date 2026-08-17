import crypto from "node:crypto"
import http from "node:http"

export const SIDECAR_USER = "Okay, this is just a test."
export const SIDECAR_ASSISTANT = "Got it. I am here."

export function sidecarConversationEvents() {
	return [
		{ type: "session.updated" },
		{ type: "input_audio_buffer.speech_started" },
		{
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "item_u1",
			delta: "Okay",
		},
		{
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "item_u1",
			delta: "Okay, this is",
		},
		{ type: "input_audio_buffer.speech_stopped" },
		{
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "item_u1",
			delta: "Okay, this is just a test.",
		},
		{
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "item_u1",
			transcript: SIDECAR_USER,
		},
		{ type: "response.created", response: { id: "resp_1" } },
		{
			type: "response.output_audio_transcript.delta",
			response_id: "resp_1",
			item_id: "item_a1",
			delta: "Got",
		},
		{
			type: "response.output_audio_transcript.delta",
			response_id: "resp_1",
			item_id: "item_a1",
			delta: " it.",
		},
		{
			type: "response.output_audio_transcript.delta",
			response_id: "resp_1",
			item_id: "item_a1",
			delta: " I am here.",
		},
		{
			type: "response.output_audio_transcript.done",
			response_id: "resp_1",
			item_id: "item_a1",
			transcript: SIDECAR_ASSISTANT,
		},
		{ type: "response.done", response: { id: "resp_1" } },
	]
}

export function startMockRealtimeSidecar(port = 0) {
	const sockets = new Set()
	const inbound = []
	const server = http.createServer((_req, res) => {
		res.writeHead(200, { "Content-Type": "text/plain" })
		res.end("ok")
	})
	server.on("upgrade", (req, socket) => {
		if (!/websocket/i.test(String(req.headers.upgrade ?? ""))) {
			socket.destroy()
			return
		}
		const key = req.headers["sec-websocket-key"]
		if (typeof key !== "string") {
			socket.destroy()
			return
		}
		const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
		socket.write(
			[
				"HTTP/1.1 101 Switching Protocols",
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Accept: ${accept}`,
				"",
				"",
			].join("\r\n"),
		)
		sockets.add(socket)
		let leftover = Buffer.alloc(0)
		let started = false
		const send = (event) => {
			if (socket.destroyed) return
			socket.write(encodeText(JSON.stringify(event)))
		}
		const playTurn = () => {
			if (started) return
			started = true
			let delay = 40
			for (const event of sidecarConversationEvents()) {
				setTimeout(() => send(event), delay)
				delay += 80
			}
		}
		socket.on("data", (chunk) => {
			leftover = Buffer.concat([leftover, chunk])
			const decoded = decodeFrames(leftover)
			leftover = decoded.rest
			for (const message of decoded.messages) {
				if (message.type === "close") {
					socket.end()
					return
				}
				if (message.type !== "text") continue
				let event
				try {
					event = JSON.parse(message.data)
				} catch {
					continue
				}
				inbound.push(event)
				if (event?.type === "session.update") playTurn()
			}
		})
		socket.on("close", () => sockets.delete(socket))
		socket.on("error", () => sockets.delete(socket))
	})

	return new Promise((resolve) => {
		server.listen(port, "127.0.0.1", () => {
			const address = server.address()
			const bound = typeof address === "object" && address ? address.port : port
			resolve({
				port: bound,
				url: `http://127.0.0.1:${bound}/v1`,
				received: inbound,
				close: () => {
					for (const socket of sockets) socket.destroy()
					return new Promise((done) => server.close(() => done()))
				},
			})
		})
	})
}

function encodeText(data) {
	const payload = Buffer.from(data)
	const len = payload.length
	let header
	if (len < 126) header = Buffer.from([0x81, len])
	else if (len < 65536) {
		header = Buffer.alloc(4)
		header[0] = 0x81
		header[1] = 126
		header.writeUInt16BE(len, 2)
	} else {
		header = Buffer.alloc(10)
		header[0] = 0x81
		header[1] = 127
		header.writeBigUInt64BE(BigInt(len), 2)
	}
	return Buffer.concat([header, payload])
}

function decodeFrames(buffer) {
	const messages = []
	let offset = 0
	while (offset + 2 <= buffer.length) {
		const opcode = buffer[offset] & 0x0f
		const second = buffer[offset + 1]
		const masked = Boolean(second & 0x80)
		let len = second & 0x7f
		let i = offset + 2
		if (len === 126) {
			if (i + 2 > buffer.length) break
			len = buffer.readUInt16BE(i)
			i += 2
		} else if (len === 127) {
			if (i + 8 > buffer.length) break
			len = Number(buffer.readBigUInt64BE(i))
			i += 8
		}
		let mask
		if (masked) {
			if (i + 4 > buffer.length) break
			mask = buffer.subarray(i, i + 4)
			i += 4
		}
		if (i + len > buffer.length) break
		let payload = buffer.subarray(i, i + len)
		if (mask) {
			payload = Buffer.from(payload)
			for (let j = 0; j < payload.length; j++) payload[j] ^= mask[j % 4]
		}
		offset = i + len
		if (opcode === 0x8) messages.push({ type: "close" })
		else if (opcode === 0x1) messages.push({ type: "text", data: payload.toString("utf8") })
	}
	return { messages, rest: buffer.subarray(offset) }
}

const entry = process.argv[1] ?? ""
if (entry.endsWith("mock-realtime-sidecar.mjs")) {
	const port = Number(process.env.PORT ?? 8765)
	const sidecar = await startMockRealtimeSidecar(port)
	console.log(`mock realtime sidecar ${sidecar.url}`)
}
