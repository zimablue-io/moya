const B64_CHUNK = 0x8000;

export function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (input.length === 0) return input;
  if (!inRate || !outRate || inRate === outRate) return input;
  const ratio = inRate / outRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  const last = input.length - 1;
  for (let i = 0; i < length; i++) {
    const src = i * ratio;
    const i0 = Math.min(Math.floor(src), last);
    const i1 = Math.min(i0 + 1, last);
    const frac = src - i0;
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac;
  }
  return out;
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = (input[i] ?? 0) / 0x8000;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    const slice = bytes.subarray(i, i + B64_CHUNK);
    bin += String.fromCharCode(...slice);
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

export function base64ToPcm16(b64: string): Int16Array {
  const bytes = base64ToBytes(b64);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(bytes.subarray(0, even));
  return new Int16Array(copy.buffer);
}

export function capturePcm16Base64(
  input: Float32Array,
  inRate: number,
  outRate: number,
): string | null {
  const resampled = resampleLinear(input, inRate, outRate);
  if (resampled.length === 0) return null;
  return pcm16ToBase64(floatToPcm16(resampled));
}

export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
