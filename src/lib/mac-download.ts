import { DOWNLOAD_APP_ASSET, DOWNLOAD_APP_URL } from "./brand.ts"

export const GITHUB_LATEST_RELEASE_API = "https://api.github.com/repos/zimablue-io/moya/releases/latest"

type GithubReleaseAsset = {
	name?: string
	browser_download_url?: string
}

type GithubRelease = {
	assets?: GithubReleaseAsset[]
}

/** Live GitHub asset URL, or null when latest has no `Moya_aarch64.dmg` (the latest/download shortcut 404s). */
export async function resolveMacDownloadUrl(fetcher: typeof fetch = fetch): Promise<string | null> {
	try {
		const response = await fetcher(GITHUB_LATEST_RELEASE_API, {
			headers: { Accept: "application/vnd.github+json" },
		})
		if (!response.ok) return null
		const body = (await response.json()) as GithubRelease
		const asset = body.assets?.find((item) => item.name === DOWNLOAD_APP_ASSET)
		if (!asset?.browser_download_url?.includes(DOWNLOAD_APP_ASSET)) return null
		return DOWNLOAD_APP_URL
	} catch {
		return null
	}
}
