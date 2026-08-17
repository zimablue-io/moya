import { ArtifactView } from "@/components/artifact-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";

export function ArtifactDialog() {
  const dialog = useApp((s) => s.dialog);
  const artifact = useApp((s) => s.artifact);
  const openDialog = useApp((s) => s.openDialog);

  return (
    <Dialog
      open={dialog === "artifact" && Boolean(artifact)}
      onOpenChange={(o) => {
        if (!o) openDialog(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shown for you</DialogTitle>
          <DialogDescription>A visual, not a second mind.</DialogDescription>
        </DialogHeader>
        {artifact ? <ArtifactView artifact={artifact} /> : null}
      </DialogContent>
    </Dialog>
  );
}
