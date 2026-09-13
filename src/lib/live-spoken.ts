/** Split spoken text into follow-along lines (one sentence at a time). */
export function spokenLines(text: string): string[] {
	const raw = text.replace(/\s+/g, " ").trim()
	if (!raw) return []
	const parts = raw
		.split(/(?<=[.!?])\s+/)
		.map((p) => p.trim())
		.filter(Boolean)
	return parts.length ? parts : [raw]
}

/** Line being said at `atMs`, so the core shows the current words only. */
export function liveSpokenLine(text: string, atMs: number, msPerChar = 48): string {
	const lines = spokenLines(text)
	if (!lines.length) return ""
	const t = Math.max(0, atMs)
	let elapsed = 0
	for (const line of lines) {
		const dur = Math.max(900, line.length * msPerChar)
		if (t < elapsed + dur) return line
		elapsed += dur
	}
	return lines[lines.length - 1] ?? ""
}
