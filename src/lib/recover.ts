export function recoverFromRenderError() {
	return {
		dialog: null,
		artifact: null,
		error: null,
		composerOpen: false,
	} as const
}

export function reloadApp(assign: (url: string) => void = (url) => window.location.assign(url)) {
	assign("/")
}
