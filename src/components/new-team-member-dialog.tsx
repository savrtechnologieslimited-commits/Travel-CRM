import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useCreateTeamMember } from "@/lib/admin-data";
import {
  TEAM_ROLES,
  type NewTeamMemberInput,
  type TeamRole,
  type TeamTabPath,
} from "@/lib/team-members";
import { TeamTabsPicker } from "@/components/team-tabs-picker";
import { teamRoleLabel } from "@/lib/team-role-label";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";

const EMPTY_FORM: NewTeamMemberInput = {
  fullName: "",
  mobile: "",
  email: "",
  loginId: "",
  password: "",
  role: "operations",
  allowedTabs: [],
};

export function NewTeamMemberDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewTeamMemberInput>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const createMember = useCreateTeamMember();

  function set<K extends keyof NewTeamMemberInput>(key: K, value: NewTeamMemberInput[K]) {
    setCreateError(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    const mobile = parseValidPhoneNumber(form.mobile);
    if (!mobile) {
      setCreateError("Enter a valid mobile number for the selected country.");
      return;
    }
    try {
      await createMember.mutateAsync({ ...form, mobile });
      setOpen(false);
      setForm(EMPTY_FORM);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create the team member account.",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setCreateError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> Add team member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            Create their staff account. They can sign in with their login ID or email and this
            password. They will only see the tabs you select below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="team-member-name">Full name</Label>
            <Input
              id="team-member-name"
              required
              maxLength={120}
              autoComplete="name"
              value={form.fullName}
              onChange={(event) => set("fullName", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-mobile">Mobile number</Label>
            <PhoneNumberInput
              id="team-member-mobile"
              required
              autoComplete="tel"
              value={form.mobile}
              onChange={(value) => set("mobile", value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-email">Email</Label>
            <Input
              id="team-member-email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-login-id">Login ID</Label>
            <Input
              id="team-member-login-id"
              required
              minLength={3}
              maxLength={32}
              pattern={"[A-Za-z0-9][A-Za-z0-9._\\x2d]{2,31}"}
              autoComplete="username"
              value={form.loginId}
              onChange={(event) => set("loginId", event.target.value)}
              placeholder="e.g. priya.sharma"
            />
            <p className="text-xs text-muted-foreground">
              3–32 letters, numbers, dots, underscores, or hyphens.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-password">Initial password</Label>
            <Input
              id="team-member-password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="team-member-role">Role</Label>
            <Select value={form.role} onValueChange={(value) => set("role", value as TeamRole)}>
              <SelectTrigger id="team-member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {teamRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Tabs this team member can access</Label>
            <TeamTabsPicker
              selectedTabs={form.allowedTabs}
              onChange={(allowedTabs: TeamTabPath[]) => set("allowedTabs", allowedTabs)}
            />
            <p className="text-xs text-muted-foreground">
              Select at least one tab. These are the only CRM tabs visible after sign-in.
            </p>
          </div>
          {createError && (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              Could not add team member: {createError}
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button
              type="submit"
              disabled={createMember.isPending || form.allowedTabs.length === 0}
            >
              {createMember.isPending ? "Adding…" : "Add team member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
