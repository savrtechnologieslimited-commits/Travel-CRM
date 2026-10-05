import { createFileRoute } from "@tanstack/react-router";
import { WacrmWorkspace } from "@/components/wacrm-workspace";

export const Route = createFileRoute("/_authenticated/messaging")({
  component: () => <WacrmWorkspace />,
  head: () => ({
    meta: [
      { title: "WhatsApp — SAVR Travels CRM" },
      {
        name: "description",
        content: "WACRM workspace inside SAVR Travels CRM.",
      },
      { property: "og:title", content: "WhatsApp — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "WACRM workspace inside SAVR Travels CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
