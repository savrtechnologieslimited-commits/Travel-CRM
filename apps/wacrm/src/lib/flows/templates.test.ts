import { describe, expect, it } from "vitest";
import { getFlowTemplate } from "./templates";
import { validateFlowForActivation } from "./validate";

describe("WhatsApp travel enquiry template", () => {
  const template = getFlowTemplate("travel_enquiry");

  it("is a complete, activatable enquiry flow with scoped destination branches", () => {
    expect(template).not.toBeNull();
    if (!template) return;

    const issues = validateFlowForActivation(
      {
        name: template.name,
        trigger_type: template.trigger_type,
        trigger_config: { ...template.trigger_config },
        entry_node_id: template.entry_node_id,
      },
      template.nodes.map((node) => ({
        ...node,
        config: { ...node.config },
      })),
    );
    expect(issues).toEqual([]);
    expect(template.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_key: "welcome",
          node_type: "send_buttons",
          config: expect.objectContaining({
            text: "Welcome to SAVR Travels! How can we help you?",
            buttons: expect.arrayContaining([
              expect.objectContaining({ reply_id: "domestic", next_node_key: "destination_domestic" }),
              expect.objectContaining({
                reply_id: "international",
                next_node_key: "destination_international",
              }),
              expect.objectContaining({ reply_id: "speak_to_agent", next_node_key: "agent_handoff" }),
            ]),
          }),
        }),
      ]),
    );
    expect(template.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_key: "destination_domestic",
          node_type: "crm_destination",
          config: expect.objectContaining({ scope: "domestic" }),
        }),
        expect.objectContaining({
          node_key: "destination_international",
          node_type: "crm_destination",
          config: expect.objectContaining({ scope: "international" }),
        }),
        expect.objectContaining({
          node_key: "ask_customer_name",
          node_type: "collect_input",
          config: expect.objectContaining({ var_key: "customer_name" }),
        }),
        expect.objectContaining({
          node_key: "ask_special_requirements",
          node_type: "collect_input",
          config: expect.objectContaining({ var_key: "special_requirements" }),
        }),
      ]),
    );
  });
});
