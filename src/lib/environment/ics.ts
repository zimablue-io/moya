import type { CalendarEvent } from "../types.ts"

function unfold(ics: string): string[] {
	const raw = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
	const lines: string[] = []
	for (const line of raw.split("\n")) {
		if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
			lines[lines.length - 1] += line.slice(1)
		} else {
			lines.push(line)
		}
	}
	return lines
}

function unescapeIcs(value: string): string {
	return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")
}

export function icsToIso(value: string): string {
	const v = value.trim()
	if (/^\d{8}T\d{6}Z$/.test(v)) {
		return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}.000Z`
	}
	if (/^\d{8}T\d{6}$/.test(v)) {
		return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}.000`
	}
	if (/^\d{8}$/.test(v)) {
		return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00.000`
	}
	return v
}

export function parseIcsEvents(ics: string): CalendarEvent[] {
	const events: CalendarEvent[] = []
	let current: Record<string, string> | null = null
	for (const line of unfold(ics)) {
		if (line === "BEGIN:VEVENT") {
			current = {}
			continue
		}
		if (line === "END:VEVENT") {
			if (current) {
				const title = unescapeIcs(current.SUMMARY ?? current.summary ?? "(untitled)")
				const start = icsToIso(current.DTSTART ?? current.dtstart ?? "")
				const end = icsToIso(current.DTEND ?? current.dtend ?? start)
				const id = current.UID ?? current.uid ?? `${title}-${start}`
				if (start) events.push({ id, title, start, end })
			}
			current = null
			continue
		}
		if (!current || !line.includes(":")) continue
		const split = line.indexOf(":")
		const key = line.slice(0, split).split(";")[0]?.toUpperCase() ?? ""
		current[key] = line.slice(split + 1)
	}
	return events
}
