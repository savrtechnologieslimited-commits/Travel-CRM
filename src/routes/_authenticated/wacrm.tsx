import { createFileRoute } from "@tanstack/react-router";
import { WacrmWorkspace } from "@/components/wacrm-workspace";

export const Route = createFileRoute("/_authenticated/wacrm")({
  validateSearch: (search: Record<string, unknown>) => ({
    contact: typeof search["contact"] === "string" ? search["contact"] : undefined,
  }),
  component: WacrmRoute,
});

function WacrmRoute() {
  const contact = Route.useSearch()["contact"];
  return <WacrmWorkspace contact={contact} />;
}
