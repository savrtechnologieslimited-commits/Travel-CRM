import { useState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAddLeadNoteEntry,
  useDeleteLeadNoteEntry,
  useLeadNoteEntries,
  useProfiles,
  type LeadNoteKind,
} from "@/lib/data";

function formatEntryDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const NOTE_TABS: Array<{ kind: LeadNoteKind; label: string; placeholder: string }> = [
  {
    kind: "client_requirement",
    label: "Client requirements",
    placeholder: "Add a client requirement…",
  },
  { kind: "internal", label: "Internal notes", placeholder: "Add an internal note…" },
];

export function LeadNoteDialog({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LeadNoteKind>("client_requirement");
  const [drafts, setDrafts] = useState<Record<LeadNoteKind, string>>({
    client_requirement: "",
    internal: "",
  });
  const { data: profiles = [] } = useProfiles();
  const requirements = useLeadNoteEntries(leadId, "client_requirement");
  const notes = useLeadNoteEntries(leadId, "internal");
  const addEntry = useAddLeadNoteEntry(leadId);
  const deleteEntry = useDeleteLeadNoteEntry();
  const entries = kind === "client_requirement" ? requirements.data ?? [] : notes.data ?? [];
  const isLoading = kind === "client_requirement" ? requirements.isLoading : notes.isLoading;
  const nameOf = (userId: string | null) =>
    (userId && profiles.find((profile) => profile.id === userId)?.full_name) || "Previous editor";

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = drafts[kind].trim();
    if (!content) return;
    try {
      await addEntry.mutateAsync({ kind, content });
      setDrafts((current) => ({ ...current, [kind]: "" }));
    } catch {
      // The mutation displays the save error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600 hover:text-sky-700"
          aria-label="View client requirements and internal notes"
          title="Client requirements and internal notes"
        >
          <NotebookPen className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead notes</DialogTitle>
          <DialogDescription>
            Each entry keeps its author and date. Deleted entries remain in the history with the
            person who deleted them.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(value) => setKind(value as LeadNoteKind)}>
          <TabsList className="grid w-full grid-cols-2">
            {NOTE_TABS.map((item) => (
              <TabsTrigger key={item.kind} value={item.kind}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {NOTE_TABS.map((item) => (
            <TabsContent key={item.kind} value={item.kind} className="space-y-4 pt-2">
              {kind === item.kind && (
                <>
                  <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
                    {isLoading && (
                      <p className="text-sm text-muted-foreground">Loading history…</p>
                    )}
                    {!isLoading && entries.length === 0 && (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No {item.label.toLowerCase()} recorded yet.
                      </p>
                    )}
                    {entries.map((entry, index) => (
                      <article key={entry.id} className="rounded-lg border bg-card p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex size-7 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">
                              {index + 1}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Added by <span className="font-medium text-foreground">{nameOf(entry.created_by)}</span>
                              {" · "}{formatEntryDateTime(entry.created_at)}
                            </span>
                          </div>
                          {!entry.deleted_at && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="-mr-2 -mt-2 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={`Delete ${item.label.slice(0, -1).toLowerCase()} ${index + 1}`}
                              title="Delete entry"
                              disabled={deleteEntry.isPending}
                              onClick={() => deleteEntry.mutate(entry.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                        <p className={`whitespace-pre-wrap text-sm ${entry.deleted_at ? "text-muted-foreground line-through" : ""}`}>
                          {entry.content}
                        </p>
                        {entry.deleted_at && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Deleted by <span className="font-medium">{nameOf(entry.deleted_by)}</span>
                            {" · "}{formatEntryDateTime(entry.deleted_at)}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                  <form onSubmit={addNote} className="space-y-3 border-t pt-4">
                    <div className="space-y-2">
                      <Label htmlFor={`lead-note-draft-${leadId}-${kind}`}>
                        {kind === "internal" ? "Internal note" : "Client requirement"}
                      </Label>
                      <Textarea
                        id={`lead-note-draft-${leadId}-${kind}`}
                        rows={3}
                        value={drafts[kind]}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [kind]: event.target.value }))
                        }
                        placeholder={item.placeholder}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={!drafts[kind].trim() || addEntry.isPending}>
                        {addEntry.isPending ? "Adding…" : `Add ${kind === "internal" ? "note" : "requirement"}`}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}