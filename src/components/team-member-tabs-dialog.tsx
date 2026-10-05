import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSetTeamMemberTabs } from "@/lib/admin-data";
import { TEAM_TAB_PATHS, type TeamTabPath } from "@/lib/team-members";
import { TeamTabsPicker } from "./team-tabs-picker";

export function TeamMemberTabsDialog({
  userId,
  name,
  assignedTabs,
  disabled,
}: {
  userId: string;
  name: string;
  assignedTabs: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedTabs, setSelectedTabs] = useState<TeamTabPath[]>(
    assignedTabs.filter((path): path is TeamTabPath =>
      (TEAM_TAB_PATHS as readonly string[]).includes(path),
    ),
  );
  const setTabs = useSetTeamMemberTabs();

  async function save() {
    try {
      await setTabs.mutateAsync({ userId, allowedTabs: selectedTabs });
      setOpen(false);
    } catch {
      // The mutation displays the server validation or update error.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setSelectedTabs(
            assignedTabs.filter((path): path is TeamTabPath =>
              (TEAM_TAB_PATHS as readonly string[]).includes(path),
            ),
          );
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          Edit tabs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tab access for {name}</DialogTitle>
          <DialogDescription>
            This team member will only see the tabs selected here after signing in.
          </DialogDescription>
        </DialogHeader>
        <TeamTabsPicker selectedTabs={selectedTabs} onChange={setSelectedTabs} />
        <DialogFooter>
          <Button
            onClick={() => void save()}
            disabled={setTabs.isPending || selectedTabs.length === 0}
          >
            {setTabs.isPending ? "Saving…" : "Save tab access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
