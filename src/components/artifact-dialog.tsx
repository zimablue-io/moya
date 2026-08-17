import { ArtifactView } from "@/components/artifact-view"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useApp } from "@/lib/store"

export function ArtifactDialog() {
	const dialog = useApp((s) => s.dialog)
	const artifact = useApp((s) => s.artifact)
	const openArtifact = useApp((s) => s.openArtifact)
	const sketch = artifact?.grounding === "sketch"

	return (
		<Dialog
			open={dialog === "artifact" && Boolean(artifact)}
			onOpenChange={(o) => {
				if (!o) openArtifact(null)
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{sketch ? "Sketch" : "Shown for you"}</DialogTitle>
					<DialogDescription>
						{sketch ? "A sketch, not live status." : "A visual, not a second mind."}
					</DialogDescription>
				</DialogHeader>
				{artifact ? <ArtifactView artifact={artifact} /> : null}
			</DialogContent>
		</Dialog>
	)
}
