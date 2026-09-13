export type ReasoningMessage = {
	content?: string | null
	reasoning_content?: string | null
	reasoning_details?: { text?: string | null }[] | null
}

export function splitThinkTags(content: string): { speech: string; thinking?: string } {
	const chunks: string[] = []
	const speech = content
		.replace(/<think>([\s\S]*?)<\/think>/gi, (_full, inner: string) => {
			const text = String(inner).trim()
			if (text) chunks.push(text)
			return ""
		})
		.trim()
	const thinking = chunks.join("\n\n").trim()
	return thinking ? { speech, thinking } : { speech }
}

export function speechFromMessage(message: ReasoningMessage): { content: string; thinking?: string } {
	const split = splitThinkTags(message.content ?? "")
	const reasoning = typeof message.reasoning_content === "string" ? message.reasoning_content.trim() : ""
	const details = Array.isArray(message.reasoning_details)
		? message.reasoning_details
				.map((d) => (d && typeof d.text === "string" ? d.text.trim() : ""))
				.filter(Boolean)
				.join("\n\n")
		: ""
	const thinking = reasoning || split.thinking || details
	if (thinking) return { content: split.speech, thinking }
	return { content: split.speech }
}

export function isMinimaxApiHost(baseUrl: string): boolean {
	try {
		const host = new URL(baseUrl).hostname.toLowerCase()
		return host === "api.minimax.io" || host === "api.minimax.cn"
	} catch {
		return false
	}
}
