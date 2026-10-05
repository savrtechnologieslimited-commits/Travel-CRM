import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDestinations, useProfiles } from "@/lib/data";
import { useCurrentUser } from "@/lib/ops-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UNASSIGNED = "__unassigned__";
const SELECT_EMPLOYEE = "__select_employee__";

type DestinationEdit = {
  id: string;
  name: string;
  scope: "domestic" | "international";
  employeeId: string | null;
};

export function WacrmDestinationAssignments() {
  const queryClient = useQueryClient();
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDestinationName, setNewDestinationName] = useState("");
  const [newDestinationScope, setNewDestinationScope] = useState<"domestic" | "international">(
    "domestic",
  );
  const [newDestinationEmployeeId, setNewDestinationEmployeeId] = useState(SELECT_EMPLOYEE);
  const [newDestinationPdf, setNewDestinationPdf] = useState<File | null>(null);
  const [editingDestination, setEditingDestination] = useState<DestinationEdit | null>(null);
  const [editDestinationPdf, setEditDestinationPdf] = useState<File | null>(null);
  const [deleteDestination, setDeleteDestination] = useState<{ id: string; name: string } | null>(
    null,
  );
  const { data: user } = useCurrentUser();
  const {
    data: destinations = [],
    isLoading: destinationsLoading,
    error: destinationsError,
  } = useDestinations();
  const { data: profiles = [], isLoading: profilesLoading, error: profilesError } = useProfiles();
  const {
    data: itineraries = [],
    isLoading: itinerariesLoading,
    error: itinerariesError,
  } = useQuery({
    queryKey: ["wacrm-destination-pdfs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select(
          "id,name,destination_id,document_path,document_name,document_mime_type,is_active,created_at",
        )
        .eq("is_active", true)
        .not("document_path", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["wacrm-destination-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destination_employee_assignments")
        .select("destination_id,employee_id")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user),
  });
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["wacrm-destination-assignment-role", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user),
  });
  const isManager = roles.some(
    ({ role }) => role === "admin" || role === "developer" || role === "manager",
  );

  const assignmentByDestination = useMemo(() => {
    return new Map(
      assignments.map((assignment) => [assignment.destination_id, assignment.employee_id]),
    );
  }, [assignments]);
  const latestPdfByDestination = useMemo(() => {
    const pdfs = itineraries
      .filter(
        (itinerary) =>
          itinerary.is_active &&
          itinerary.destination_id &&
          itinerary.document_path &&
          (itinerary.document_mime_type === "application/pdf" ||
            /\.pdf$/i.test(itinerary.document_name ?? itinerary.document_path ?? "")),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = new Map<string, (typeof pdfs)[number]>();
    for (const itinerary of pdfs) {
      if (itinerary.destination_id && !latest.has(itinerary.destination_id)) {
        latest.set(itinerary.destination_id, itinerary);
      }
    }
    return latest;
  }, [itineraries]);

  const setAssignment = useMutation({
    mutationFn: async ({
      destinationId,
      employeeId,
    }: {
      destinationId: string;
      employeeId: string | null;
    }) => {
      const { error } = await supabase.rpc("set_destination_employee_assignment", {
        p_destination_id: destinationId,
        p_employee_id: employeeId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["wacrm-destination-assignments"],
      });
      toast.success("Destination assignment saved");
    },
    onError: (error: Error) => toast.error(`Could not save assignment: ${error.message}`),
  });

  const addDestination = useMutation({
    mutationFn: async () => {
      const name = newDestinationName.trim();
      if (!name) throw new Error("Enter a destination name.");
      if (!newDestinationPdf) throw new Error("Choose a destination PDF.");
      if (
        !newDestinationPdf.name.toLowerCase().endsWith(".pdf") ||
        (newDestinationPdf.type && newDestinationPdf.type !== "application/pdf")
      ) {
        throw new Error("The destination document must be a PDF.");
      }
      if (newDestinationEmployeeId === SELECT_EMPLOYEE) {
        throw new Error("Select an employee or choose Unassigned.");
      }

      let destinationId: string | null = null;
      let uploadedPath: string | null = null;
      let itineraryId: string | null = null;
      try {
        const { data: destination, error: destinationError } = await supabase
          .from("destinations")
          .insert({ name, scope: newDestinationScope, is_active: true })
          .select("id,name,country,scope,region")
          .single();
        if (destinationError) throw destinationError;
        destinationId = destination.id;

        const safeFileName = newDestinationPdf.name.replace(/[^\w.-]+/g, "_");
        const documentPath = `${destinationId}/${crypto.randomUUID()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from("itineraries")
          .upload(documentPath, newDestinationPdf, {
            cacheControl: "3600",
            upsert: false,
            contentType: "application/pdf",
          });
        if (uploadError) throw uploadError;
        uploadedPath = documentPath;

        const { data: itinerary, error: itineraryError } = await supabase
          .from("itineraries")
          .insert({
            name,
            title: name,
            destination_id: destinationId,
            document_path: documentPath,
            document_name: newDestinationPdf.name,
            document_mime_type: "application/pdf",
            document_size: newDestinationPdf.size,
            is_active: true,
          })
          .select(
            "id,name,destination_id,document_path,document_name,document_mime_type,is_active,created_at",
          )
          .single();
        if (itineraryError) throw itineraryError;
        itineraryId = itinerary.id;

        const employeeId =
          newDestinationEmployeeId === UNASSIGNED ? null : newDestinationEmployeeId;
        const { error: assignmentError } = await supabase.rpc(
          "set_destination_employee_assignment",
          {
            p_destination_id: destinationId,
            p_employee_id: employeeId,
          },
        );
        if (assignmentError) throw assignmentError;
        return { destination, employeeId };
      } catch (error) {
        const originalError = error instanceof Error ? error.message : String(error);
        const cleanupErrors: string[] = [];
        if (itineraryId) {
          const { error: itineraryCleanupError } = await supabase
            .from("itineraries")
            .delete()
            .eq("id", itineraryId);
          if (itineraryCleanupError)
            cleanupErrors.push(`Itinerary cleanup failed: ${itineraryCleanupError.message}`);
        }
        if (uploadedPath) {
          const { error: storageError } = await supabase.storage
            .from("itineraries")
            .remove([uploadedPath]);
          if (storageError) cleanupErrors.push(`PDF cleanup failed: ${storageError.message}`);
        }
        if (destinationId) {
          const { error: cleanupError } = await supabase
            .from("destinations")
            .delete()
            .eq("id", destinationId);
          if (cleanupError)
            cleanupErrors.push(`Destination cleanup failed: ${cleanupError.message}`);
        }
        if (cleanupErrors.length > 0) {
          console.error("Could not fully roll back destination creation:", cleanupErrors);
          throw new Error(`${originalError}. ${cleanupErrors.join(". ")}`);
        }
        throw error;
      }
    },
    onSuccess: ({ destination, employeeId }) => {
      queryClient.setQueryData<typeof destinations>(["destinations"], (current = []) => {
        if (current.some(({ id }) => id === destination.id)) return current;
        return [...current, destination].sort((left, right) => left.name.localeCompare(right.name));
      });
      queryClient.setQueryData<typeof assignments>(
        ["wacrm-destination-assignments"],
        (current = []) => {
          const withoutDestination = current.filter(
            ({ destination_id }) => destination_id !== destination.id,
          );
          return employeeId
            ? [...withoutDestination, { destination_id: destination.id, employee_id: employeeId }]
            : withoutDestination;
        },
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["destinations"] }),
        queryClient.invalidateQueries({ queryKey: ["itineraries"] }),
        queryClient.invalidateQueries({ queryKey: ["wacrm-destination-pdfs"] }),
        queryClient.invalidateQueries({ queryKey: ["wacrm-destination-assignments"] }),
      ]);
      setNewDestinationName("");
      setNewDestinationScope("domestic");
      setNewDestinationEmployeeId(SELECT_EMPLOYEE);
      setNewDestinationPdf(null);
      setShowAddForm(false);
      toast.success("Destination added");
    },
    onError: (error: Error) => toast.error(`Could not add destination: ${error.message}`),
  });

  const editDestination = useMutation({
    mutationFn: async (edit: DestinationEdit & { pdf: File | null }) => {
      const name = edit.name.trim();
      if (!name) throw new Error("Enter a destination name.");
      if (
        edit.pdf &&
        (!edit.pdf.name.toLowerCase().endsWith(".pdf") ||
          (edit.pdf.type && edit.pdf.type !== "application/pdf"))
      ) {
        throw new Error("The destination document must be a PDF.");
      }

      const previousEmployeeId = assignmentByDestination.get(edit.id) ?? null;
      let uploadedPath: string | null = null;
      let itineraryId: string | null = null;
      let assignmentChanged = false;
      try {
        if (edit.pdf) {
          const safeFileName = edit.pdf.name.replace(/[^\w.-]+/g, "_");
          const documentPath = `${edit.id}/${crypto.randomUUID()}-${safeFileName}`;
          const { error: uploadError } = await supabase.storage
            .from("itineraries")
            .upload(documentPath, edit.pdf, {
              cacheControl: "3600",
              upsert: false,
              contentType: "application/pdf",
            });
          if (uploadError) throw uploadError;
          uploadedPath = documentPath;

          const { data: itinerary, error: itineraryError } = await supabase
            .from("itineraries")
            .insert({
              name,
              title: name,
              destination_id: edit.id,
              document_path: documentPath,
              document_name: edit.pdf.name,
              document_mime_type: "application/pdf",
              document_size: edit.pdf.size,
              is_active: true,
            })
            .select("id")
            .single();
          if (itineraryError) throw itineraryError;
          itineraryId = itinerary.id;
        }

        if (edit.employeeId !== previousEmployeeId) {
          const { error: assignmentError } = await supabase.rpc(
            "set_destination_employee_assignment",
            {
              p_destination_id: edit.id,
              p_employee_id: edit.employeeId,
            },
          );
          if (assignmentError) throw assignmentError;
          assignmentChanged = true;
        }

        const { data: updatedDestination, error: destinationError } = await supabase
          .from("destinations")
          .update({ name, scope: edit.scope })
          .eq("id", edit.id)
          .select("id")
          .maybeSingle();
        if (destinationError) throw destinationError;
        if (!updatedDestination) throw new Error("The destination could not be found.");
      } catch (error) {
        const originalError = error instanceof Error ? error.message : String(error);
        const cleanupErrors: string[] = [];
        if (assignmentChanged) {
          const { error: rollbackError } = await supabase.rpc(
            "set_destination_employee_assignment",
            {
              p_destination_id: edit.id,
              p_employee_id: previousEmployeeId,
            },
          );
          if (rollbackError)
            cleanupErrors.push(`Assignment rollback failed: ${rollbackError.message}`);
        }
        if (itineraryId) {
          const { error: itineraryCleanupError } = await supabase
            .from("itineraries")
            .delete()
            .eq("id", itineraryId);
          if (itineraryCleanupError)
            cleanupErrors.push(`PDF record cleanup failed: ${itineraryCleanupError.message}`);
        }
        if (uploadedPath) {
          const { error: storageError } = await supabase.storage
            .from("itineraries")
            .remove([uploadedPath]);
          if (storageError) cleanupErrors.push(`PDF cleanup failed: ${storageError.message}`);
        }
        if (cleanupErrors.length > 0) {
          console.error("Could not fully roll back destination edit:", cleanupErrors);
          throw new Error(`${originalError}. ${cleanupErrors.join(". ")}`);
        }
        throw error;
      }

      return { id: edit.id };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["destinations"] }),
        queryClient.invalidateQueries({ queryKey: ["itineraries"] }),
        queryClient.invalidateQueries({ queryKey: ["wacrm-destination-pdfs"] }),
        queryClient.invalidateQueries({ queryKey: ["wacrm-destination-assignments"] }),
      ]);
      setEditingDestination(null);
      setEditDestinationPdf(null);
      toast.success("Destination updated");
    },
    onError: (error: Error) => toast.error(`Could not update destination: ${error.message}`),
  });

  const removeDestination = useMutation({
    mutationFn: async (destination: { id: string; name: string }) => {
      const { data: linkedItineraries, error: itineraryLookupError } = await supabase
        .from("itineraries")
        .select("id")
        .eq("destination_id", destination.id);
      if (itineraryLookupError) throw itineraryLookupError;

      if (linkedItineraries?.length) {
        const { error: detachError } = await supabase
          .from("itineraries")
          .update({ destination_id: null })
          .eq("destination_id", destination.id);
        if (detachError) throw detachError;
      }

      const { data: deletedDestination, error: deleteError } = await supabase
        .from("destinations")
        .delete()
        .eq("id", destination.id)
        .select("id")
        .maybeSingle();
      if (deleteError || !deletedDestination) {
        if (linkedItineraries?.length) {
          const { error: relinkError } = await supabase
            .from("itineraries")
            .update({ destination_id: destination.id })
            .in(
              "id",
              linkedItineraries.map(({ id }) => id),
            );
          if (relinkError) {
            console.error(
              "Could not relink destination documents after delete failed:",
              relinkError,
            );
            throw new Error(
              `${deleteError?.message ?? "The destination could not be deleted."} PDF links could not be restored: ${relinkError.message}`,
            );
          }
        }
        if (deleteError) throw deleteError;
        throw new Error("The destination could not be found.");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["destinations"] }),
        queryClient.invalidateQueries({ queryKey: ["itineraries"] }),
        queryClient.invalidateQueries({ queryKey: ["wacrm-destination-pdfs"] }),
        queryClient.invalidateQueries({ queryKey: ["wacrm-destination-assignments"] }),
      ]);
      setDeleteDestination(null);
      toast.success("Destination deleted");
    },
    onError: (error: Error) => toast.error(`Could not delete destination: ${error.message}`),
  });

  const openPdf = async (destinationId: string, path: string) => {
    setOpeningPdfId(destinationId);
    try {
      const { data, error } = await supabase.storage.from("itineraries").createSignedUrl(path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        `Could not open destination PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setOpeningPdfId(null);
    }
  };

  if (rolesLoading || (user && assignmentsLoading)) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading destination assignments…
      </div>
    );
  }

  if (!isManager) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Destination assignments</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only a Travel CRM administrator or manager can change destination assignments.
        </p>
      </section>
    );
  }

  const loading = destinationsLoading || profilesLoading || itinerariesLoading;
  const loadError = destinationsError ?? profilesError ?? itinerariesError;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Destination assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign one active employee to each destination. The latest active destination PDF is
            used by the WhatsApp enquiry flow.
          </p>
        </div>
        <Button
          type="button"
          variant={showAddForm ? "outline" : "default"}
          size="sm"
          onClick={() => setShowAddForm((visible) => !visible)}
        >
          {showAddForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showAddForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {showAddForm ? (
        <form
          className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            addDestination.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="wacrm-new-destination-name">Destination</Label>
            <input
              id="wacrm-new-destination-name"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={newDestinationName}
              onChange={(event) => setNewDestinationName(event.target.value)}
              placeholder="e.g. Goa"
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wacrm-new-destination-scope">Destination type</Label>
            <Select
              value={newDestinationScope}
              onValueChange={(value) => {
                if (value === "domestic" || value === "international") {
                  setNewDestinationScope(value);
                }
              }}
            >
              <SelectTrigger id="wacrm-new-destination-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wacrm-new-destination-pdf">Destination PDF</Label>
            <input
              id="wacrm-new-destination-pdf"
              className="block w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              type="file"
              accept=".pdf,application/pdf"
              required
              onChange={(event) => setNewDestinationPdf(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wacrm-new-destination-employee">Employee assigned</Label>
            <Select value={newDestinationEmployeeId} onValueChange={setNewDestinationEmployeeId}>
              <SelectTrigger id="wacrm-new-destination-employee">
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {profiles
                  .filter((profile) => profile.is_active)
                  .map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email || "Employee"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" size="sm" disabled={addDestination.isPending}>
              {addDestination.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add destination
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Destination</th>
              <th className="px-4 py-3 font-medium">Destination type</th>
              <th className="px-4 py-3 font-medium">Destination PDF</th>
              <th className="px-4 py-3 font-medium">Employee assigned</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loadError ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-destructive">
                  Destination data could not be loaded: {loadError.message}
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading destinations, employees, and PDFs…
                </td>
              </tr>
            ) : destinations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No active destinations are configured in Travel CRM.
                </td>
              </tr>
            ) : (
              destinations.map((destination) => {
                const pdf = latestPdfByDestination.get(destination.id);
                const currentEmployeeId = assignmentByDestination.get(destination.id);
                return (
                  <tr key={destination.id}>
                    <td className="px-4 py-3 font-medium">{destination.name}</td>
                    <td className="px-4 py-3 capitalize">{destination.scope}</td>
                    <td className="px-4 py-3">
                      {pdf?.document_path ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={openingPdfId === destination.id}
                          onClick={() => void openPdf(destination.id, pdf.document_path!)}
                        >
                          {openingPdfId === destination.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <ExternalLink className="size-4" />
                          )}
                          <span className="max-w-48 truncate">
                            {pdf.document_name || pdf.name || "Open latest PDF"}
                          </span>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">No active PDF</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={currentEmployeeId ?? UNASSIGNED}
                        disabled={setAssignment.isPending}
                        onValueChange={(value) => {
                          if (!value) return;
                          setAssignment.mutate({
                            destinationId: destination.id,
                            employeeId: value === UNASSIGNED ? null : value,
                          });
                        }}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Select an employee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {currentEmployeeId &&
                          !profiles.some((profile) => profile.id === currentEmployeeId) ? (
                            <SelectItem value={currentEmployeeId} disabled>
                              Existing assignee
                            </SelectItem>
                          ) : null}
                          {profiles
                            .filter((profile) => profile.is_active)
                            .map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.full_name || profile.email || "Employee"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingDestination({
                              id: destination.id,
                              name: destination.name,
                              scope: destination.scope,
                              employeeId: currentEmployeeId ?? null,
                            });
                            setEditDestinationPdf(null);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            setDeleteDestination({ id: destination.id, name: destination.name })
                          }
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={editingDestination !== null}
        onOpenChange={(open) => {
          if (!open && !editDestination.isPending) {
            setEditingDestination(null);
            setEditDestinationPdf(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit destination</DialogTitle>
            <DialogDescription>
              Update its CRM details, employee assignment, or destination PDF.
            </DialogDescription>
          </DialogHeader>
          {editingDestination ? (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                editDestination.mutate({ ...editingDestination, pdf: editDestinationPdf });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="wacrm-edit-destination-name">Destination</Label>
                <input
                  id="wacrm-edit-destination-name"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={editingDestination.name}
                  onChange={(event) =>
                    setEditingDestination({ ...editingDestination, name: event.target.value })
                  }
                  required
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wacrm-edit-destination-scope">Destination type</Label>
                <Select
                  value={editingDestination.scope}
                  onValueChange={(value) => {
                    if (value === "domestic" || value === "international") {
                      setEditingDestination({ ...editingDestination, scope: value });
                    }
                  }}
                >
                  <SelectTrigger id="wacrm-edit-destination-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domestic">Domestic</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wacrm-edit-destination-employee">Employee assigned</Label>
                <Select
                  value={editingDestination.employeeId ?? UNASSIGNED}
                  onValueChange={(value) =>
                    setEditingDestination({
                      ...editingDestination,
                      employeeId: value === UNASSIGNED ? null : value,
                    })
                  }
                >
                  <SelectTrigger id="wacrm-edit-destination-employee">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {editingDestination.employeeId &&
                    !profiles.some((profile) => profile.id === editingDestination.employeeId) ? (
                      <SelectItem value={editingDestination.employeeId} disabled>
                        Existing assignee
                      </SelectItem>
                    ) : null}
                    {profiles
                      .filter((profile) => profile.is_active)
                      .map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || profile.email || "Employee"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wacrm-edit-destination-pdf">
                  Replace destination PDF (optional)
                </Label>
                <input
                  id="wacrm-edit-destination-pdf"
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(event) => setEditDestinationPdf(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  {editDestinationPdf?.name ??
                    (latestPdfByDestination.get(editingDestination.id)?.document_name
                      ? `Current: ${latestPdfByDestination.get(editingDestination.id)?.document_name}`
                      : "No active PDF")}
                </p>
              </div>
              <DialogFooter className="sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingDestination(null);
                    setEditDestinationPdf(null);
                  }}
                  disabled={editDestination.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editDestination.isPending}>
                  {editDestination.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDestination !== null}
        onOpenChange={(open) => {
          if (!open && !removeDestination.isPending) setDeleteDestination(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDestination?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the destination and its employee assignment. Existing leads
              and enquiries are kept, but their destination link is removed. Destination PDFs are
              kept in the itinerary library without a destination link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeDestination.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={removeDestination.isPending || !deleteDestination}
              onClick={() => {
                if (deleteDestination) removeDestination.mutate(deleteDestination);
              }}
            >
              {removeDestination.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete destination
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
