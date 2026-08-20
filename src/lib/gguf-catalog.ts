export type GgufSuggestion = {
	id: string
	label: string
	filename: string
	url: string
	sizeLabel: string
	ramHintMb: number
	note: string
}

/** Suggested files only. Any GGUF the user downloads or copies in still works. */
export const GGUF_SUGGESTIONS: GgufSuggestion[] = [
	{
		id: "qwen3-1.7b-q4",
		label: "Qwen 3 1.7B Q4",
		filename: "Qwen_Qwen3-1.7B-Q4_K_M.gguf",
		url: "https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf",
		sizeLabel: "~1.3 GB",
		ramHintMb: 3072,
		note: "Small default for phones.",
	},
	{
		id: "gemma4-e2b-q4",
		label: "Gemma 4 E2B Q4",
		filename: "gemma-4-E2B-it-Q4_K_M.gguf",
		url: "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
		sizeLabel: "~3.5 GB",
		ramHintMb: 6144,
		note: "Better on tablets and 8 GB+ phones.",
	},
]

export function suggestedGgufs(ramHintMb: number): GgufSuggestion[] {
	if (ramHintMb >= 6144) return GGUF_SUGGESTIONS
	return GGUF_SUGGESTIONS.filter((item) => item.ramHintMb <= 4096)
}

export function ggufSuggestionFor(filename: string): GgufSuggestion | undefined {
	return GGUF_SUGGESTIONS.find((item) => item.filename === filename || item.id === filename)
}
