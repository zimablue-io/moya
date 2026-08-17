import { useEffect, useRef } from "react";
import type { Emotion, PresenceState } from "@/lib/types";

const RGB: Record<Emotion, string> = {
  calm: "228,224,216",
  focused: "220,224,228",
  alert: "232,214,200",
  warm: "232,220,206",
  concerned: "220,208,200",
};

type Props = {
  state: PresenceState;
  emotion: Emotion;
  level: number;
  bands: number[];
  gazeX?: number;
  gazeY?: number;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onTap: () => void;
};

type Live = {
  state: PresenceState;
  emotion: Emotion;
  level: number;
  bands: number[];
  gazeX: number;
  gazeY: number;
};

export function PresenceCanvas({
  state,
  emotion,
  level,
  bands,
  gazeX = 0,
  gazeY = 0,
  onHoldStart,
  onHoldEnd,
  onTap,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Live>({ state, emotion, level, bands, gazeX, gazeY });
  live.current = { state, emotion, level, bands, gazeX, gazeY };
  const hold = useRef<{ t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let running = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pointer = { x: 0, y: 0, on: false, last: 0 };
    const attn = { x: 0, y: 0 };
    const voice = { level: 0.16, bands: Array.from({ length: 24 }, () => 0.16) };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.on = true;
      pointer.last = performance.now();
    };
    const onLeave = () => {
      pointer.on = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    const start = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      const t = (now - start) / 1000;
      const { width, height } = canvas.getBoundingClientRect();
      const L = live.current;

      const stale = now - pointer.last > 2400;
      let tx = L.gazeX;
      let ty = L.gazeY;
      if (pointer.on && !stale) {
        tx = pointer.x;
        ty = pointer.y;
      } else if (!reduced && L.state === "idle") {
        tx = Math.sin(t * 0.17) * 0.22;
        ty = Math.cos(t * 0.13) * 0.16;
      } else if (L.state === "listening") {
        tx = 0;
        ty = 0.08;
      }

      const follow = reduced ? 0.16 : 0.035;
      attn.x += (tx - attn.x) * follow;
      attn.y += (ty - attn.y) * follow;
      voice.level += (L.level - voice.level) * 0.05;
      for (let i = 0; i < 24; i++) {
        voice.bands[i] += ((L.bands[i] ?? 0.16) - voice.bands[i]) * 0.06;
      }

      draw(
        ctx,
        width,
        height,
        reduced ? t * 0.06 : t,
        L,
        attn.x,
        attn.y,
        voice.level,
        voice.bands,
        reduced,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 size-full touch-none"
      aria-label="Moya"
      onPointerDown={(e) => {
        hold.current = { t: Date.now(), x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        onHoldStart();
      }}
      onPointerUp={(e) => {
        const h = hold.current;
        hold.current = null;
        onHoldEnd();
        if (h && Date.now() - h.t < 280) {
          const dx = e.clientX - h.x;
          const dy = e.clientY - h.y;
          if (dx * dx + dy * dy < 100) onTap();
        }
      }}
      onPointerCancel={() => {
        hold.current = null;
        onHoldEnd();
      }}
    />
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  live: { state: PresenceState; emotion: Emotion },
  ax: number,
  ay: number,
  level: number,
  bands: number[],
  reduced: boolean,
) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 - Math.min(h * 0.02, 16);
  const base = Math.min(w, h) * 0.168;
  const rgb = RGB[live.emotion];
  const phi = Math.atan2(ay, ax);
  const am = Math.min(1, Math.hypot(ax, ay));
  const mean = bands.reduce((a, b) => a + b, 0) / Math.max(1, bands.length);
  const spoken = live.state === "speaking" ? Math.min(1, level * 0.5 + (mean - 0.16) * 0.8) : 0;

  const tempo =
    live.state === "listening"
      ? 0.55
      : live.state === "thinking"
        ? 0.72
        : live.state === "speaking"
          ? 0.8
          : 0.46;
  const inhale =
    live.state === "listening"
      ? 0.038
      : live.state === "speaking"
        ? 0.028 + spoken * 0.03
        : live.state === "thinking"
          ? 0.022
          : 0.018;
  const breath = 0.5 + 0.5 * Math.sin(t * tempo);

  const pupil = 0.34 * am;
  const px = cx + Math.cos(phi) * base * pupil;
  const py = cy + Math.sin(phi) * base * pupil;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const glow = ctx.createRadialGradient(px, py, 0, cx, cy, base * 1.25);
  glow.addColorStop(0, `rgba(${rgb},${0.2 + breath * 0.06 + spoken * 0.08})`);
  glow.addColorStop(0.55, `rgba(${rgb},0.05)`);
  glow.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, base * 1.2, 0, Math.PI * 2);
  ctx.fill();

  const rings = 6;
  for (let i = 0; i < rings; i++) {
    const depth = i / (rings - 1);
    ctx.beginPath();
    const steps = 192;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const toward = Math.cos(a - phi);
      const open = 1 + toward * am * (0.055 + depth * 0.03);
      const wave = reduced ? 0 : Math.sin(a * 2 + t * 0.18 + i * 0.35) * 0.006;
      const speech =
        live.state === "speaking" ? (bands[s % bands.length] - 0.16) * (0.012 + depth * 0.01) : 0;
      const r = base * (0.5 + depth * 0.82) * (1 + inhale * breath + wave + speech) * open;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${rgb},${0.1 + (1 - depth) * 0.1 + breath * 0.04})`;
    ctx.lineWidth = i === 0 ? 1.2 : 0.85;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(px, py, 2.4 + breath * 0.7 + spoken * 1.4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},${0.55 + breath * 0.12})`;
  ctx.fill();
  ctx.restore();
}
