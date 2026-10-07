import { createFileRoute } from "@tanstack/react-router";
import { WacrmWorkspace } from "@/components/wacrm-workspace";

export const Route = createFileRoute("/_authenticated/wacrm")({
  validateSearch: (search: Record<string, unknown>) => ({
    contact: typeof search["contact"] === "string" ? search["contact"] : undefined,
    conversationId:
      typeof search["conversationId"] === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        search["conversationId"],
      )
        ? search["conversationId"]
        : undefined,
    matchType:
      search["matchType"] === "lead" || search["matchType"] === "customer"
        ? search["matchType"]
        : undefined,
    matchId:
      typeof search["matchId"] === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search["matchId"])
        ? search["matchId"]
        : undefined,
  }),
  component: WacrmRoute,
});

function WacrmRoute() {
  const { contact, conversationId, matchType, matchId } = Route.useSearch();
  const workspaceKey = `${matchType ?? ""}:${matchId ?? ""}:${conversationId ?? ""}:${contact ?? ""}`;
  const matchTarget =
    matchType === "lead" && matchId
      ? { recordType: "lead" as const, recordId: matchId }
      : matchType === "customer" && matchId
        ? { recordType: "customer" as const, recordId: matchId }
        : undefined;

  return (
    <WacrmWorkspace
      key={workspaceKey}
      {...(contact !== undefined ? { contact } : {})}
      {...(conversationId !== undefined ? { conversationId } : {})}
      {...(matchTarget ? { matchTarget } : {})}
    />
  );
}
