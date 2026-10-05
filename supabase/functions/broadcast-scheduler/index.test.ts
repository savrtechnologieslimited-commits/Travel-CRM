import { describe, expect, test } from "bun:test";
import {
  authorizeBroadcastSchedulerRequest,
  schedulerRequest,
  type BroadcastSchedulerResult,
} from "./index";

function dependencies() {
  return {
    listDueScheduledBroadcasts: async () => [{ id: "b-1", status: "scheduled", scheduled_for: "2022-01-01T00:00:00.000Z" }],
    claimDueBroadcast: async (broadcastId: string) => ({ id: broadcastId, status: "running", scheduled_for: "2022-01-01T00:00:00.000Z" }),
    executeBroadcast: async () => ({ broadcast: { status: "completed" } }),
  };
}

describe("Broadcast scheduler worker", () => {
  test("authorizes server-to-server invocation", () => {
    const request = new Request("https://example.test", { headers: { authorization: "Bearer broadcast-secret" } });
    expect(authorizeBroadcastSchedulerRequest(request, "broadcast-secret")).toBe(true);
    expect(authorizeBroadcastSchedulerRequest(request, "wrong-secret")).toBe(false);
    expect(authorizeBroadcastSchedulerRequest(new Request("https://example.test"), "broadcast-secret")).toBe(false);
  });

  test("returns a success result after processing due broadcasts", async () => {
    const response = await schedulerRequest(
      new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer broadcast-secret" }, body: JSON.stringify({ now: "2026-01-02T00:00:00.000Z" }) }),
      dependencies(),
      "broadcast-secret",
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as BroadcastSchedulerResult;
    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);
    expect(result.executed).toBe(1);
    expect(result.failed).toBe(0);
  });

  test("rejects malformed request bodies", async () => {
    const response = await schedulerRequest(
      new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer broadcast-secret" }, body: "{" }),
      dependencies(),
      "broadcast-secret",
    );
    expect(response.status).toBe(400);
  });

  test("rejects unauthorized invocation", async () => {
    const response = await schedulerRequest(new Request("https://example.test", { method: "POST" }), dependencies(), "broadcast-secret");
    expect(response.status).toBe(401);
  });
});
