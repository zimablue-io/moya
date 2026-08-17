import { captureDenied, ensureMediaAccess, type MicFix } from "./media-permission";
import { clamp } from "./utils";
import { VOICE_PREVIEW_TEXT } from "./voice-preview";
import { systemSettingsLabel } from "./host";

export type SpeechHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onLevel?: (level: number, bands: number[]) => void;
  onSpeakBoundary?: (charIndex: number, text: string) => void;
  onSpeakEnd?: () => void;
  onError?: (message: string) => void;
  onListenEnd?: () => void;
};

type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: RecogEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type RecogEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getRecognizerCtor(): (new () => Recog) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function envelopeFromText(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    if (/[aeiouáéíóúy]/i.test(ch)) out.push(0.85 + Math.random() * 0.15);
    else if (/[mnlrw]/i.test(ch)) out.push(0.55);
    else if (/\s/.test(ch)) out.push(0.08);
    else if (/[.,!?;:]/.test(ch)) out.push(0.02);
    else out.push(0.32 + Math.random() * 0.15);
  }
  return out.length ? out : [0.2];
}

function friendlySpeechError(code: string): string | null {
  if (code === "aborted" || code === "no-speech") return null;
  if (code === "not-allowed" || code === "service-not-allowed") {
    return `Mic is blocked. Allow Moya in ${systemSettingsLabel()}, then tap Voice again.`;
  }
  if (code === "network" || code === "service-not-connected") {
    return "Speech service is offline. Type instead.";
  }
  if (code === "audio-capture") return "No microphone found. Type instead.";
  return null;
}

export class SpeechEngine {
  private rec: Recog | null = null;
  private recDesired = false;
  private alive = false;
  private fatalRec = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private raf = 0;
  private handlers: SpeechHandlers = {};
  private speaking = false;
  private speakGen = 0;
  private listenStarted = 0;
  micFix: MicFix = null;

  configure(handlers: SpeechHandlers) {
    this.handlers = handlers;
  }

  get supported() {
    return Boolean(getRecognizerCtor());
  }

  get ttsSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  listVoices(): SpeechSynthesisVoice[] {
    if (!this.ttsSupported) return [];
    return window.speechSynthesis.getVoices();
  }

  async startListen(opts: { continuous?: boolean } = {}) {
    this.stopRecognition();
    this.alive = true;
    this.recDesired = true;
    this.fatalRec = false;
    this.listenStarted = performance.now();
    this.loopLevels();

    const access = await ensureMediaAccess();
    if (!access.ok) {
      this.micFix = access.fix;
      this.recDesired = false;
      this.alive = false;
      this.handlers.onError?.(access.message);
      return;
    }
    this.micFix = null;
    try {
      await this.attachMic();
    } catch {
      const fail = captureDenied();
      this.micFix = fail.fix;
      this.recDesired = false;
      this.alive = false;
      this.handlers.onError?.(fail.message);
      return;
    }

    const Ctor = getRecognizerCtor();
    if (!Ctor) {
      this.micFix = null;
      this.recDesired = false;
      this.alive = false;
      this.detachMic();
      this.handlers.onError?.("This window cannot transcribe speech. Type instead.");
      return;
    }

    const rec = new Ctor();
    rec.continuous = opts.continuous ?? false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      let interim = "";
      let fin = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) fin += piece;
        else interim += piece;
      }
      if (interim) this.handlers.onInterim?.(interim);
      if (fin.trim()) this.handlers.onFinal?.(fin.trim());
    };
    rec.onerror = (ev) => {
      const err = ev.error ?? "recognition-error";
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
        this.fatalRec = true;
        this.recDesired = false;
        this.micFix = err === "audio-capture" ? null : "settings";
      }
      const friendly = friendlySpeechError(err);
      if (friendly) this.handlers.onError?.(friendly);
    };
    rec.onend = () => {
      if (this.recDesired && rec.continuous && !this.fatalRec) {
        try {
          rec.start();
        } catch {
          this.recDesired = false;
          this.handlers.onListenEnd?.();
        }
      } else if (!this.alive) {
        this.handlers.onListenEnd?.();
      }
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.fatalRec = true;
      this.recDesired = false;
      this.micFix = "settings";
      this.handlers.onError?.(
        `Mic is blocked. Allow Moya in ${systemSettingsLabel()}, then tap Voice again.`,
      );
    }
  }

  stopListen() {
    this.alive = false;
    this.recDesired = false;
    this.stopRecognition();
    this.detachMic();
  }

  previewVoice(opts: { voiceURI?: string; rate?: number; pitch?: number; onEnd?: () => void }) {
    this.speak(VOICE_PREVIEW_TEXT, opts);
  }

  speak(
    text: string,
    opts: { voiceURI?: string; rate?: number; pitch?: number; onEnd?: () => void },
  ) {
    if (!this.ttsSupported) {
      this.handlers.onSpeakEnd?.();
      return;
    }
    this.stopSpeak();
    const gen = ++this.speakGen;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    const voices = window.speechSynthesis.getVoices();
    const chosen =
      voices.find((v) => v.voiceURI === opts.voiceURI) ??
      voices.find(
        (v) => /en[-_]/i.test(v.lang) && /female|samantha|victoria|karen|moira|zira/i.test(v.name),
      ) ??
      voices.find((v) => /en[-_]/i.test(v.lang)) ??
      voices[0];
    if (chosen) u.voice = chosen;
    this.speaking = true;
    const env = envelopeFromText(text);
    u.onboundary = (e) => {
      const idx = "charIndex" in e ? Number((e as { charIndex: number }).charIndex) : 0;
      const local = env[Math.min(idx, env.length - 1)] ?? 0.3;
      const bands = env.slice(idx, idx + 16);
      this.handlers.onLevel?.(local, padBands(bands));
      this.handlers.onSpeakBoundary?.(idx, text);
    };
    const finish = () => {
      if (this.speakGen !== gen) return;
      this.speaking = false;
      opts.onEnd?.();
      this.handlers.onSpeakEnd?.();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
    this.simulateSpeechIfNoBoundary(env);
  }

  stopSpeak() {
    if (!this.ttsSupported) return;
    this.speakGen += 1;
    this.speaking = false;
    window.speechSynthesis.cancel();
  }

  dispose() {
    this.stopListen();
    this.stopSpeak();
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  private stopRecognition() {
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    this.rec = null;
  }

  private simulateSpeechIfNoBoundary(env: number[]) {
    let i = 0;
    const tick = () => {
      if (!this.speaking) return;
      const v = env[i % env.length] ?? 0.2;
      this.handlers.onLevel?.(v, padBands(env.slice(i, i + 16)));
      i += 1;
      window.setTimeout(tick, 70);
    };
    window.setTimeout(tick, 80);
  }

  private async attachMic() {
    if (this.micStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("no-media-devices");
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
      const src = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      src.connect(this.analyser);
    } catch (err) {
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      void this.audioCtx?.close();
      this.audioCtx = null;
      this.analyser = null;
      throw err;
    }
  }

  private detachMic() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    void this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
  }

  private loopLevels() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.alive) return;
      const elapsed = (performance.now() - this.listenStarted) / 1000;
      if (this.analyser) {
        const buf = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(buf);
        const bands = Array.from(buf).map((n) => n / 255);
        const level = bands.reduce((a, b) => a + b, 0) / Math.max(1, bands.length);
        this.handlers.onLevel?.(clamp(level * 1.8, 0, 1), padBands(bands));
      } else {
        const bands = livingBands(elapsed);
        const level = 0.28 + 0.12 * Math.sin(elapsed * 1.6);
        this.handlers.onLevel?.(level, bands);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}

function livingBands(t: number): number[] {
  const swell = 0.16 + 0.04 * Math.sin(t * 0.62);
  return Array.from({ length: 24 }, (_, i) => swell + 0.015 * Math.sin(t * 0.3 + i * 0.2));
}

function padBands(bands: number[]): number[] {
  const out = bands.slice(0, 24);
  while (out.length < 24) out.push(out[out.length - 1] ?? 0.18);
  return out;
}

export const speech = new SpeechEngine();
