import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { NewTeamMemberDialog } from "@/components/new-team-member-dialog";
import { TeamMemberTabsDialog } from "@/components/team-member-tabs-dialog";
import { TeamMemberDeleteButton } from "@/components/team-member-delete-button";
import {
  useProfilesFull,
  useSetUserRole,
  useUserTabPermissions,
  useToggleProfileActive,
  useUserRoles,
} from "@/lib/admin-data";
import { formatDate } from "@/lib/crm";
import { TEAM_ROLES, type TeamRole } from "@/lib/team-members";
import { teamRoleLabel } from "@/lib/team-role-label";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const ROLE_ACCESS: Record<TeamRole, string> = {
  admin: "Manage staff, settings and all CRM features",
  manager: "Manage day-to-day operations across assigned tabs",
  operations: "Access the CRM tabs assigned to this team member",
  read_only: "View-only access to assigned CRM tabs",
};

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & Permissions — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Manage staff accounts, assign CRM roles and control who can access sales, operations and finance modules.",
      },
      { property: "og:title", content: "Team & Permissions — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Staff directory with role-based access control for the travel agency CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const [search, setSearch] = useState("");
  const { data: profiles = [], isLoading, isError: profilesError } = useProfilesFull();
  const { data: roles = [] } = useUserRoles();
  const {
    data: tabPermissions = [],
    isLoading: tabsLoading,
    isError: tabsError,
  } = useUserTabPermissions();
  const setRole = useSetUserRole();
  const toggleActive = useToggleProfileActive();

  const roleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) m.set(r.user_id, r.role);
    return m;
  }, [roles]);

  const rows = profiles.filter((p) =>
    search ? `${p.full_name} ${p.email ?? ""}`.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <div>
      <PageHeader
        title="Team & Permissions"
        subtitle="Add staff accounts, assign roles, and manage team access."
        actions={<NewTeamMemberDialog />}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {TEAM_ROLES.map((r) => (
          <Card key={r} className="p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <p className="text-sm font-medium">{teamRoleLabel(r)}</p>
              <Badge variant="secondary" className="ml-auto">
                {roles.filter((x) => x.role === r).length}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE_ACCESS[r]}</p>
          </Card>
        ))}
      </div>

      <Input
        className="mb-4 max-w-sm"
        placeholder="Search team member…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Card className="overflow-x-auto p-0">
        {tabsError && (
          <p className="px-4 py-3 text-sm text-destructive">
            Unable to load team tab access. Please refresh or contact an administrator.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Login ID</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tab access</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Loading team…</TableCell>
              </TableRow>
            )}
            {!isLoading && profilesError && (
              <TableRow>
                <TableCell colSpan={8} className="text-destructive">
                  Unable to load team members. Refresh or contact an administrator.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !profilesError && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>No team members found.</TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name || "Unnamed"}</TableCell>
                <TableCell className="text-sm">{p.login_id ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.email ?? "—"}
                  {p.phone ? <span className="block">{p.phone}</span> : null}
                </TableCell>
                <TableCell className="text-sm">{p.job_title ?? "—"}</TableCell>
                <TableCell className="text-sm">{formatDate(p.created_at)}</TableCell>
                <TableCell>
                  <Select
                    value={roleMap.get(p.id) ?? "operations"}
                    onValueChange={(role) =>
                      setRole.mutate({ userId: p.id, role: role as TeamRole })
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEAM_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {teamRoleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <TeamMemberTabsDialog
                    key={`${p.id}-${tabPermissions
                      .filter((permission) => permission.user_id === p.id)
                      .map((permission) => permission.tab_path)
                      .sort()
                      .join(",")}`}
                    userId={p.id}
                    name={p.full_name || "this team member"}
                    assignedTabs={tabPermissions
                      .filter((permission) => permission.user_id === p.id)
                      .map((permission) => permission.tab_path)}
                    disabled={tabsLoading || tabsError}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant={p.is_active ? "outline" : "default"}
                      onClick={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })}
                    >
                      {p.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <TeamMemberDeleteButton userId={p.id} name={p.full_name || "this member"} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
