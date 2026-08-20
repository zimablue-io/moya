import { MAC_APP_INSTALL_URL } from "./brand.ts"

/** Web menu "Mac app" goes here — not the DMG. A GitHub-downloaded .app hits Gatekeeper until Apple notarizes it. */
export function macAppInstallUrl(): string {
	return MAC_APP_INSTALL_URL
}
