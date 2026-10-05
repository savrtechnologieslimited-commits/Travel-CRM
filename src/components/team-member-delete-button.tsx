import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteTeamMember } from "@/lib/admin-data";

export function TeamMemberDeleteButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const removeMember = useDeleteTeamMember();

  async function confirmDelete() {
    setDeleteError(null);
    try {
      await removeMember.mutateAsync(userId);
      setOpen(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete the team member account.",
      );
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setDeleteError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Delete ${name}`} title={`Delete ${name}`}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes their staff account and removes their CRM access. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && (
          <p className="text-sm text-destructive" role="alert">
            Could not delete account: {deleteError}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMember.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => void confirmDelete()}
            disabled={removeMember.isPending}
          >
            {removeMember.isPending ? "Deleting…" : "Delete account"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
