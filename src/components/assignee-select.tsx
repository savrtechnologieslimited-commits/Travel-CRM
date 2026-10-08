import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles } from "@/lib/data";
import { useCurrentUser } from "@/lib/ops-data";
import { hasFullLeadVisibility } from "@/lib/lead-ownership";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const UNASSIGNED = "unassigned";

/** Roles of the signed-in user; drives who may assign or reassign work. */
export function useMyRoles() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => String(r.role));
    },
  });
}

/** Only administrators and managers may change record ownership. */
export function useCanAssign() {
  const { data: roles = [], isLoading } = useMyRoles();
  return {
    canAssign: hasFullLeadVisibility(roles),
    isLoading,
  };
}

/** Maps a profile id to a display name. */
export function useAssigneeNames() {
  const { data: profiles = [] } = useProfiles();
  return (id?: string | null) => {
    if (!id) return "Unassigned";
    return profiles.find((profile) => profile.id === id)?.full_name ?? "Unavailable team member";
  };
}

export function AssigneeSelect({
  value,
  onChange,
  disabled,
  className,
  placeholder = "Unassigned",
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { data: profiles = [] } = useProfiles();
  return (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
      disabled={disabled ?? false}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {value && value !== UNASSIGNED && !profiles.some((profile) => profile.id === value) ? (
          <SelectItem value={value} disabled>
            Existing assignee
          </SelectItem>
        ) : null}
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** All / Mine / Unassigned ownership filter shared by leads and enquiries. */
export function OwnerFilter({
  value,
  onChange,
  mineLabel,
  className = "w-44",
}: {
  value: string;
  onChange: (v: string) => void;
  mineLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="mine">{mineLabel}</SelectItem>
        <SelectItem value="unassigned">Unassigned</SelectItem>
      </SelectContent>
    </Select>
  );
}
