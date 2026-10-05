import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NAVIGATION_GROUPS } from "@/components/app-shell";
import { TEAM_TAB_PATHS, type TeamTabPath } from "@/lib/team-members";

export function TeamTabsPicker({
  selectedTabs,
  onChange,
}: {
  selectedTabs: TeamTabPath[];
  onChange: (tabs: TeamTabPath[]) => void;
}) {
  const allowedPaths = new Set<string>(TEAM_TAB_PATHS);

  function toggleTab(path: TeamTabPath, checked: boolean) {
    onChange(
      checked ? [...new Set([...selectedTabs, path])] : selectedTabs.filter((tab) => tab !== path),
    );
  }

  return (
    <div className="max-h-64 space-y-4 overflow-y-auto rounded-md border p-3">
      {NAVIGATION_GROUPS.map((group) => {
        const tabs = group.items.filter((item) => allowedPaths.has(item.to));
        if (tabs.length === 0) return null;

        return (
          <fieldset key={group.id} className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">{group.label}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {tabs.map((tab) => {
                const path = tab.to as TeamTabPath;
                const id = `team-tab-${path.slice(1).replaceAll("/", "-")}`;

                return (
                  <div key={path} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={selectedTabs.includes(path)}
                      onCheckedChange={(checked) => toggleTab(path, checked === true)}
                    />
                    <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                      {tab.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
