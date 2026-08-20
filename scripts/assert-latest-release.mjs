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
const dmgs = (release.assets ?? []).filter((asset) => String(asset.name).endsWith(".dmg"))
if (dmgs.length === 0) {
	throw new Error(`Latest release ${release.tag_name} has no .dmg asset`)
}

console.log(`latest release ${release.tag_name}: ${dmgs.map((asset) => asset.name).join(", ")}`)
