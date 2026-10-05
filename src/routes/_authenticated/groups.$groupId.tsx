import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useDeleteTraveller, useTravelGroup, useUpsertTraveller } from "@/lib/data";
import { VISA_STATUSES, formatDate, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/groups/$groupId")({
  head: () => ({
    meta: [
      { title: "Group Travellers — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Traveller roster for a travel group with passport numbers, expiry dates, visa status and meal preferences.",
      },
      { property: "og:title", content: "Group Travellers — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Passport, visa and preference records for every traveller in the group.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupDetailPage,
});

const TRAVELLER_TYPES = ["adult", "child", "infant"] as const;

function GroupDetailPage() {
  const { groupId } = Route.useParams();
  const query = useTravelGroup(groupId);
  const remove = useDeleteTraveller(groupId);
  const group = query.data?.group;
  const travellers = query.data?.travellers ?? [];

  return (
    <div>
      <Link
        to="/groups"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All groups
      </Link>

      <PageHeader
        title={group?.name ?? "Travel group"}
        subtitle={
          group?.customers?.full_name
            ? `Primary contact: ${group.customers.full_name}${group.customers.mobile ? ` · ${group.customers.mobile}` : ""}`
            : "No primary contact linked"
        }
        actions={<TravellerDialog groupId={groupId} />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant="secondary">{travellers.length} travellers</Badge>
        <Badge variant="outline">
          {travellers.filter((t) => t.traveller_type === "adult").length} adults
        </Badge>
        <Badge variant="outline">
          {travellers.filter((t) => t.traveller_type === "child").length} children
        </Badge>
        <Badge variant="outline">
          {travellers.filter((t) => t.traveller_type === "infant").length} infants
        </Badge>
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Traveller</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Passport</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Visa</TableHead>
              <TableHead>Meal</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {travellers.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.relation ? titleize(t.relation) : "—"}
                    {t.is_primary ? " · Lead pax" : ""}
                  </p>
                </TableCell>
                <TableCell>{titleize(t.traveller_type)}</TableCell>
                <TableCell>{formatDate(t.date_of_birth)}</TableCell>
                <TableCell>{t.passport_number || "—"}</TableCell>
                <TableCell>{formatDate(t.passport_expiry)}</TableCell>
                <TableCell>
                  <StatusBadge status={t.visa_status} />
                </TableCell>
                <TableCell>{t.meal_preference || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${t.full_name}`}
                    onClick={() => remove.mutate(t.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {travellers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No travellers added yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function TravellerDialog({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertTraveller(groupId);
  const [form, setForm] = useState({
    full_name: "",
    relation: "",
    gender: "",
    date_of_birth: "",
    traveller_type: "adult",
    nationality: "Indian",
    passport_number: "",
    passport_expiry: "",
    visa_status: "not_required",
    meal_preference: "",
    special_requirements: "",
    is_primary: false,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add traveller
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add traveller</DialogTitle>
          <DialogDescription>
            Passport and visa details flow into the visa board and ticketing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Full name (as per passport)</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Relation</Label>
            <Input
              value={form.relation}
              onChange={(e) => setForm({ ...form, relation: e.target.value })}
              placeholder="Spouse / Son"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Traveller type</Label>
            <Select
              value={form.traveller_type}
              onValueChange={(v) => setForm({ ...form, traveller_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAVELLER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <Input
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Passport number</Label>
            <Input
              value={form.passport_number}
              onChange={(e) => setForm({ ...form, passport_number: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Passport expiry</Label>
            <Input
              type="date"
              value={form.passport_expiry}
              onChange={(e) => setForm({ ...form, passport_expiry: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Visa status</Label>
            <Select
              value={form.visa_status}
              onValueChange={(v) => setForm({ ...form, visa_status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISA_STATUSES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {titleize(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Meal preference</Label>
            <Input
              value={form.meal_preference}
              onChange={(e) => setForm({ ...form, meal_preference: e.target.value })}
              placeholder="Veg / Jain / Non-veg"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Special requirements</Label>
            <Textarea
              rows={2}
              value={form.special_requirements}
              onChange={(e) => setForm({ ...form, special_requirements: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={upsert.isPending || !form.full_name.trim()}
            onClick={() => {
              upsert.mutate({
                values: {
                  group_id: groupId,
                  full_name: form.full_name.trim(),
                  relation: form.relation.trim() || null,
                  gender: form.gender || null,
                  date_of_birth: form.date_of_birth || null,
                  traveller_type: form.traveller_type,
                  nationality: form.nationality.trim() || null,
                  passport_number: form.passport_number.trim() || null,
                  passport_expiry: form.passport_expiry || null,
                  visa_status: form.visa_status,
                  meal_preference: form.meal_preference.trim() || null,
                  special_requirements: form.special_requirements.trim() || null,
                  is_primary: false,
                },
              });
              setOpen(false);
              setForm({ ...form, full_name: "", relation: "", passport_number: "" });
            }}
          >
            Add traveller
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
