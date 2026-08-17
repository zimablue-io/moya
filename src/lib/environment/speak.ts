import type { Receipt } from "./types.ts"

const DONE = /^(done\.?|ok\.?|okay\.?)$/i

const CLAIMS: { re: RegExp; commands: string[] }[] = [
	{ re: /\b(resolved|cleared the inbox|marked .+ (?:done|resolved))\b/i, commands: ["inbox.resolve"] },
	{ re: /\b(remembered|kept|wrote a memory|stored)\b/i, commands: ["memory.write"] },
	{ re: /\b(forgot|deleted a memory)\b/i, commands: ["memory.forget"] },
	{ re: /\b(wiped|erased (?:your|the) (?:mind|data|device))\b/i, commands: ["data.wipe"] },
	{ re: /\b(closed|dismissed)\b/i, commands: ["ui.close"] },
	{ re: /\b(opened|put up|showed)\b/i, commands: ["ui.open", "ui.sketch", "ui.focus", "lived.analyze"] },
	{ re: /\b(logged)\b/i, commands: ["time.log"] },
	{ re: /\b(ran|executed) (?:the |a )?routine\b/i, commands: ["routine.run"] },
	{ re: /\b(created|started) (?:a )?board\b/i, commands: ["board.upsert"] },
	{ re: /\b(attached|connected) (?:a )?source\b/i, commands: ["source.attach", "source.connect"] },
]

function okCommands(receipts: Receipt[]): Set<string> {
	return new Set(receipts.filter((r) => r.ok && r.command !== "query").map((r) => r.command))
}

export function receiptsClaimAct(receipts: Receipt[]): boolean {
	return receipts.some((r) => r.ok && r.command !== "query")
}

export function summarizeReceipts(receipts: Receipt[]): string {
	const lines = receipts.filter((r) => r.command !== "query").map((r) => r.summary)
	if (lines.length) return lines.join(" ")
	const q = receipts.find((r) => r.command === "query")
	return q?.summary ?? "I have nothing to add."
}

export function honestyFromWorld(text: string, receipts: Receipt[], spoken: string): string {
	const q = receipts.find((r) => r.command === "query")
	const data = q?.data as Record<string, unknown> | undefined
	if (!data) return spoken
	const lower = text.toLowerCase()
	if (/project|what am i working/.test(lower)) {
		const work = data.work as { empty?: boolean; hint?: string } | undefined
		if (work?.empty && work.hint) return work.hint
	}
	if (/what.?s on|today|calendar|this week/.test(lower)) {
		const cal = data.calendar as { empty?: boolean; hint?: string; today?: unknown[] } | undefined
		if (cal?.empty && cal.hint) return cal.hint
		if (cal && Array.isArray(cal.today) && cal.today.length === 0 && cal.hint) return cal.hint
	}
	return spoken
}

export function compileSpeech(receipts: Receipt[], modelText: string): string {
	const raw = modelText.trim()
	if (!raw || DONE.test(raw)) return summarizeReceipts(receipts)

	const ok = okCommands(receipts)
	for (const claim of CLAIMS) {
		if (!claim.re.test(raw)) continue
		if (claim.commands.some((c) => ok.has(c))) continue
		return summarizeReceipts(receipts)
	}

	return raw
}

export function needsWorldFacts(text: string): boolean {
	return /project|overview|what.?s on|today|this week|calendar|what do you (?:remember|know)|memories|inbox|board|my (?:projects|schedule|work)|open loops|how am i spending/i.test(
		text,
	)
}
