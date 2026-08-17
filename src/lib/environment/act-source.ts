import type { Source } from "../types.ts"
import { nowIso, uid } from "../utils.ts"
import { type ActCtx, type ActResult, fail, ok, str } from "./act-result.ts"
import { parseIcsEvents } from "./ics.ts"

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, { method: "GET" })
	if (!res.ok) throw new Error(`Could not read ${url} (${res.status})`)
	return res.text()
}

async function fetchWork(src: Source): Promise<{ work: Source["work"]; error?: string }> {
	const origin = src.origin.toLowerCase()
	if (origin.includes("mcp.linear.app") || origin.includes("/mcp")) {
		return {
			work: [],
			error: "That URL is an MCP endpoint. Add it under Settings → Tools, or use a Linear API key as a work source.",
		}
	}
	try {
		if (origin.includes("linear.app") || origin.includes("api.linear.app")) {
			const res = await fetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: src.authHeader || "",
				},
				body: JSON.stringify({
					query: "{ viewer { assignedIssues(first: 50) { nodes { id title url state { name } } } } }",
				}),
			})
			if (!res.ok) return { work: [], error: `Linear read failed (${res.status}).` }
			const json = (await res.json()) as {
				data?: {
					viewer?: {
						assignedIssues?: { nodes?: { id: string; title: string; url?: string; state?: { name: string } }[] }
					}
				}
			}
			const nodes = json.data?.viewer?.assignedIssues?.nodes ?? []
			return {
				work: nodes.map((n) => ({
					id: n.id,
					title: n.title,
					state: n.state?.name ?? "open",
					url: n.url,
				})),
			}
		}
		if (origin.includes("github")) {
			const url = src.origin.includes("api.github.com")
				? src.origin
				: "https://api.github.com/issues?filter=assigned&state=open"
			const headers: Record<string, string> = { Accept: "application/vnd.github+json" }
			if (src.authHeader)
				headers.Authorization =
					src.authHeader.startsWith("Bearer") || src.authHeader.startsWith("token")
						? src.authHeader
						: `Bearer ${src.authHeader}`
			const res = await fetch(url, { headers })
			if (!res.ok) return { work: [], error: `GitHub read failed (${res.status}).` }
			const json = (await res.json()) as { id?: number; title?: string; state?: string; html_url?: string }[]
			if (!Array.isArray(json)) return { work: [], error: "GitHub did not return a list." }
			return {
				work: json.map((n) => ({
					id: String(n.id ?? n.title ?? "issue"),
					title: String(n.title ?? "Issue"),
					state: String(n.state ?? "open"),
					url: n.html_url,
				})),
			}
		}
		return { work: [], error: "Unknown work origin. Use a Linear API or GitHub issues URL." }
	} catch (err) {
		return { work: [], error: err instanceof Error ? err.message : "Work read failed." }
	}
}

async function syncSource(src: Source): Promise<{ source: Source; error?: string }> {
	const next = { ...src, files: [...src.files], events: [...src.events], work: [...src.work] }
	if (src.kind === "brought") {
		next.lastSyncAt = nowIso()
		return { source: next }
	}
	if (src.kind === "calendar") {
		const icsText =
			src.files.map((f) => f.text).join("\n") || (src.origin.startsWith("http") ? await fetchText(src.origin) : "")
		if (!icsText) return { source: next, error: "No ICS text to read." }
		next.events = parseIcsEvents(icsText)
		next.lastSyncAt = nowIso()
		return { source: next }
	}
	if (src.kind === "work") {
		const fetched = await fetchWork(src)
		if (fetched.error) return { source: next, error: fetched.error }
		next.work = fetched.work
		next.lastSyncAt = nowIso()
		return { source: next }
	}
	return { source: next, error: "Unknown source kind." }
}

export async function actSource(ctx: ActCtx): Promise<ActResult | null> {
	const { command, env, next, args } = ctx
	const snap = next.snapshot

	if (command === "source.attach") {
		const files = Array.isArray(args.files)
			? (args.files as Array<Record<string, unknown>>).flatMap((f) => {
					const name = String(f.name ?? "file")
					const text = String(f.text ?? "")
					return [{ name, text }]
				})
			: []
		if (!files.length) return fail(command, "No files to copy.", env)
		const src: Source = {
			id: uid("src"),
			kind: "brought",
			name: str(args, "name", files[0]?.name ?? "Attached"),
			mode: "read",
			origin: "attach",
			authHeader: "",
			files,
			events: files.some((f) => /BEGIN:VEVENT/i.test(f.text))
				? parseIcsEvents(files.map((f) => f.text).join("\n"))
				: [],
			work: [],
			lastSyncAt: nowIso(),
			createdAt: nowIso(),
		}
		snap.sources = [src, ...snap.sources]
		return ok(command, `Attached ${src.name} (${files.length} file${files.length === 1 ? "" : "s"}).`, next, {
			id: src.id,
		})
	}

	if (command === "source.connect") {
		const kind = str(args, "kind")
		if (kind !== "calendar" && kind !== "work") return fail(command, "Kind must be calendar or work.", env)
		const src: Source = {
			id: uid("src"),
			kind,
			name: str(args, "name", kind),
			mode: "read",
			origin: str(args, "origin"),
			authHeader: str(args, "authHeader"),
			files: [],
			events: [],
			work: [],
			lastSyncAt: null,
			createdAt: nowIso(),
		}
		if (!src.origin) return fail(command, "Origin required.", env)
		try {
			const synced = await syncSource(src)
			snap.sources = [synced.source, ...snap.sources]
			if (synced.error) {
				return ok(command, `Connected ${src.name} (read pending: ${synced.error})`, next, { id: synced.source.id })
			}
			return ok(command, `Connected ${src.name}.`, next, { id: synced.source.id })
		} catch (err) {
			snap.sources = [src, ...snap.sources]
			return ok(
				command,
				`Connected ${src.name} (read pending: ${err instanceof Error ? err.message : "failed"}).`,
				next,
				{ id: src.id },
			)
		}
	}

	if (command === "source.remove") {
		const id = str(args, "id")
		if (!id) return fail(command, "Source id required.", env)
		if (!snap.sources.some((s) => s.id === id)) return fail(command, "Source not found.", env)
		snap.sources = snap.sources.filter((s) => s.id !== id)
		return ok(command, "Removed Moya's copy of that source. Nothing on disk was deleted.", next, { id })
	}

	if (command === "source.sync") {
		const id = str(args, "id")
		const src = snap.sources.find((s) => s.id === id)
		if (!src) return fail(command, "Source not found.", env)
		try {
			const synced = await syncSource(src)
			snap.sources = snap.sources.map((s) => (s.id === id ? synced.source : s))
			if (synced.error) return fail(command, synced.error, next)
			return ok(command, `Synced ${src.name}.`, next, { id })
		} catch (err) {
			return fail(command, err instanceof Error ? err.message : "Sync failed.", next)
		}
	}

	return null
}
