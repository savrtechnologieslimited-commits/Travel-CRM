import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useDeleteCustomer } from "@/lib/data";
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

export function CustomerDeleteButton({ customerId, name }: { customerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();
  const deleteCustomer = useDeleteCustomer();

  async function confirmDelete() {
    setDeleteError(null);
    try {
      await deleteCustomer.mutateAsync(customerId);
      setOpen(false);
      await navigate({ to: "/customers" });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this customer.");
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
        <Button type="button" size="sm" variant="outline" className="gap-2 text-destructive">
          <Trash2 className="size-4" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the customer profile. Linked leads, bookings, and other records
            are preserved when supported by their database relationships. Customer-only WhatsApp
            notes, tags, and flow responses may also be deleted. Linked financial records can block
            deletion. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && (
          <p className="text-sm text-destructive" role="alert">
            Could not delete customer: {deleteError}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteCustomer.isPending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmDelete()}
            disabled={deleteCustomer.isPending}
          >
            {deleteCustomer.isPending ? "Deleting…" : "Delete customer"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
