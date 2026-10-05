import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { useCreateTravelGroup, useCustomers, useTravelGroups } from "@/lib/data";
import { formatDate } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/groups/")({
  head: () => ({
    meta: [
      { title: "Travel Groups — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Manage family and corporate travel groups with traveller-wise passport, visa and meal preference records.",
      },
      { property: "og:title", content: "Travel Groups — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Group builder for family and corporate bookings with passport and visa tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const [search, setSearch] = useState("");
  const groups = useTravelGroups(search);

  return (
    <div>
      <PageHeader
        title="Travel Groups"
        subtitle="Family and corporate groups with traveller-wise passport and visa records."
        actions={<NewGroupDialog />}
      />

      <Input
        className="mb-4 w-64"
        placeholder="Search groups"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(groups.data ?? []).map((g) => (
          <Link key={g.id} to="/groups/$groupId" params={{ groupId: g.id }}>
            <Card className="h-full p-4 transition-colors hover:border-primary/50">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Lead pax: {g.customers?.full_name ?? "Not linked"}
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Users className="size-3" />
                  {g.travellers?.length ?? 0}
                </Badge>
              </div>
              {g.notes && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{g.notes}</p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Created {formatDate(g.created_at)}
              </p>
            </Card>
          </Link>
        ))}
      </div>
      {groups.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No groups yet. Create one to manage multi-traveller bookings.
        </p>
      )}
    </div>
  );
}

function NewGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const customers = useCustomers();
  const create = useCreateTravelGroup();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New travel group</DialogTitle>
          <DialogDescription>
            Group travellers under one primary contact for shared bookings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sharma family — Bali Jun 2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Primary customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {(customers.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={create.isPending || !name.trim()}
            onClick={() => {
              create.mutate({
                name: name.trim(),
                primary_customer_id: customerId || null,
                notes: notes.trim() || null,
              });
              setOpen(false);
              setName("");
              setNotes("");
            }}
          >
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
