const repo = "zimablue-io/moya"
const url = `https://api.github.com/repos/${repo}/releases/latest`
const headers = {
	Accept: "application/vnd.github+json",
	"User-Agent": "moya-ci",
}
if (process.env.GITHUB_TOKEN) {
	headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
}

const response = await fetch(url, { headers })
if (response.status === 404) {
	throw new Error(
		`No GitHub Release on ${repo}. Tag vX.Y.Z so Release can upload the Mac DMG that Download and README point at.`,
	)
}
if (!response.ok) {
	throw new Error(`GitHub latest release: HTTP ${response.status}`)
}

const release = await response.json()
const names = (release.assets ?? []).map((asset) => String(asset.name))
if (!names.includes("Moya_aarch64.dmg")) {
	throw new Error(
		`Latest release ${release.tag_name} has no Moya_aarch64.dmg — Download uses releases/latest/download/Moya_aarch64.dmg (assets: ${names.join(", ") || "none"})`,
	)
}

console.log(`latest release ${release.tag_name}: ${names.join(", ")}`)
