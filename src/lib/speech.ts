import { micBlockedInSettings } from "./brand"
import { systemSettingsLabel } from "./host"
import { captureDenied, ensureMediaAccess, type MicFix } from "./media-permission"
import { friendlySpeechError, getRecognizerCtor, livingBands, padBands, type Recog } from "./speech-helpers"
import { clamp } from "./utils"
import { stopSpokenReply } from "./voice-speak"

export type SpeechHandlers = {
	onInterim?: (text: string) => void
	onFinal?: (text: string) => void
	onLevel?: (level: number, bands: number[]) => void
	onSpeakBoundary?: (charIndex: number, text: string) => void
	onSpeakEnd?: () => void
	onError?: (message: string) => void
	onListenEnd?: () => void
}

export { envelopeFromText } from "./speech-helpers"

export class SpeechEngine {
	private rec: Recog | null = null
	private recDesired = false
	private alive = false
	private fatalRec = false
	private audioCtx: AudioContext | null = null
	private analyser: AnalyserNode | null = null
	private micStream: MediaStream | null = null
	private raf = 0
	private handlers: SpeechHandlers = {}
	private listenStarted = 0
	micFix: MicFix = null

	configure(handlers: SpeechHandlers) {
		this.handlers = handlers
	}

	get supported() {
		return Boolean(getRecognizerCtor())
	}

	async startListen(opts: { continuous?: boolean } = {}) {
		this.stopRecognition()
		this.alive = true
		this.recDesired = true
		this.fatalRec = false
		this.listenStarted = performance.now()
		this.loopLevels()

		const access = await ensureMediaAccess()
		if (!access.ok) {
			this.micFix = access.fix
			this.recDesired = false
			this.alive = false
			this.handlers.onError?.(access.message)
			return
		}
		this.micFix = null
		try {
			await this.attachMic()
		} catch {
			const fail = captureDenied()
			this.micFix = fail.fix
			this.recDesired = false
			this.alive = false
			this.handlers.onError?.(fail.message)
			return
		}

		const Ctor = getRecognizerCtor()
		if (!Ctor) {
			this.micFix = null
			this.recDesired = false
			this.alive = false
			this.detachMic()
			this.handlers.onError?.("This window cannot transcribe speech. Type instead.")
			return
		}

		const rec = new Ctor()
		rec.continuous = opts.continuous ?? false
		rec.interimResults = true
		rec.lang = "en-US"
		rec.onresult = (ev) => {
			let interim = ""
			let fin = ""
			for (let i = ev.resultIndex; i < ev.results.length; i++) {
				const piece = ev.results[i][0]?.transcript ?? ""
				if (ev.results[i].isFinal) fin += piece
				else interim += piece
			}
			if (interim) this.handlers.onInterim?.(interim)
			if (fin.trim()) this.handlers.onFinal?.(fin.trim())
		}
		rec.onerror = (ev) => {
			const err = ev.error ?? "recognition-error"
			if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
				this.fatalRec = true
				this.recDesired = false
				this.micFix = err === "audio-capture" ? null : "settings"
			}
			const friendly = friendlySpeechError(err)
			if (friendly) this.handlers.onError?.(friendly)
		}
		rec.onend = () => {
			if (this.recDesired && rec.continuous && !this.fatalRec) {
				try {
					rec.start()
				} catch {
					this.recDesired = false
					this.handlers.onListenEnd?.()
				}
			} else if (!this.alive) {
				this.handlers.onListenEnd?.()
			}
		}
		this.rec = rec
		try {
			rec.start()
		} catch {
			this.fatalRec = true
			this.recDesired = false
			this.micFix = "settings"
			this.handlers.onError?.(micBlockedInSettings(systemSettingsLabel()))
		}
	}

	stopListen() {
		this.alive = false
		this.recDesired = false
		this.stopRecognition()
		this.detachMic()
	}

	stopSpeak() {
		stopSpokenReply()
	}

	dispose() {
		this.stopListen()
		this.stopSpeak()
		if (this.raf) cancelAnimationFrame(this.raf)
	}

	private stopRecognition() {
		try {
			this.rec?.abort()
		} catch {
			/* ignore */
		}
		this.rec = null
	}

	private async attachMic() {
		if (this.micStream) return
		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error("no-media-devices")
		}
		try {
			this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
			const Ctx =
				window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
			this.audioCtx = new Ctx()
			if (this.audioCtx.state === "suspended") await this.audioCtx.resume()
			const src = this.audioCtx.createMediaStreamSource(this.micStream)
			this.analyser = this.audioCtx.createAnalyser()
			this.analyser.fftSize = 64
			src.connect(this.analyser)
		} catch (err) {
			this.micStream?.getTracks().forEach((t) => t.stop())
			this.micStream = null
			void this.audioCtx?.close()
			this.audioCtx = null
			this.analyser = null
			throw err
		}
	}

	private detachMic() {
		if (this.raf) cancelAnimationFrame(this.raf)
		this.raf = 0
		this.micStream?.getTracks().forEach((t) => t.stop())
		this.micStream = null
		void this.audioCtx?.close()
		this.audioCtx = null
		this.analyser = null
	}

	private loopLevels() {
		if (this.raf) cancelAnimationFrame(this.raf)
		const tick = () => {
			if (!this.alive) return
			const elapsed = (performance.now() - this.listenStarted) / 1000
			if (this.analyser) {
				const buf = new Uint8Array(this.analyser.frequencyBinCount)
				this.analyser.getByteFrequencyData(buf)
				const bands = Array.from(buf).map((n) => n / 255)
				const level = bands.reduce((a, b) => a + b, 0) / Math.max(1, bands.length)
				this.handlers.onLevel?.(clamp(level * 1.8, 0, 1), padBands(bands))
			} else {
				const bands = livingBands(elapsed)
				const level = 0.28 + 0.12 * Math.sin(elapsed * 1.6)
				this.handlers.onLevel?.(level, bands)
			}
			this.raf = requestAnimationFrame(tick)
		}
		this.raf = requestAnimationFrame(tick)
	}
}

export const speech = new SpeechEngine()
