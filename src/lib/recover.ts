import { emptyUiState } from "./environment/state.ts"

export function recoverFromRenderError() {
	return {
		...emptyUiState(),
		error: null,
	} as const
}

export function reloadApp(assign: (url: string) => void = (url) => window.location.assign(url)) {
	assign("/")
}
