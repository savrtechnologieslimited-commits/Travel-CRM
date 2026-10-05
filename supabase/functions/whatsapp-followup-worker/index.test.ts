import { describe, expect, test } from "bun:test";
import {
  authorizeWorkerRequest,
  runFollowUpWorker,
  workerRequest,
  type FollowUpWorkerDependencies,
} from "./index";

function dependencies(
  taskIds: string[],
  results: Record<string, "sent" | "skipped" | "failed"> = {},
) {
  const calls: string[] = [];
  const value: FollowUpWorkerDependencies = {
    listDueFollowUpTaskIds: async () => taskIds,
    sendDueAiWhatsAppFollowUp: async ({ taskId }) => {
      calls.push(taskId);
      const result = results[taskId] ?? "sent";
      if (result === "failed") throw new Error("provider unavailable");
      return result === "sent" ? { status: "sent" } : { status: "skipped", reason: "not_pending" };
    },
  };
  return { value, calls };
}

describe("WhatsApp follow-up worker", () => {
  test("authorizes server-to-server invocation", () => {
    const request = new Request("https://example.test", { headers: { authorization: "Bearer worker-secret" } });
    expect(authorizeWorkerRequest(request, "worker-secret")).toBe(true);
    expect(authorizeWorkerRequest(request, "wrong-secret")).toBe(false);
    expect(authorizeWorkerRequest(new Request("https://example.test"), "worker-secret")).toBe(false);
  });

  test("processes due follow-ups and returns correct counts", async () => {
    const { value, calls } = dependencies(["task-1", "task-2", "task-3"], { "task-1": "sent", "task-2": "skipped", "task-3": "failed" });
    const result = await runFollowUpWorker(value, "2026-01-02T00:00:00.000Z");
    expect(result).toEqual({ success: false, processed: 3, sent: 1, skipped: 1, failed: 1 });
    expect(calls).toEqual(["task-1", "task-2", "task-3"]);
  });

  test("returns zero counts when no follow-ups are due", async () => {
    const { value } = dependencies([]);
    await expect(runFollowUpWorker(value)).resolves.toEqual({ success: true, processed: 0, sent: 0, skipped: 0, failed: 0 });
  });

  test("provider failure is counted and does not stop the batch", async () => {
    const { value, calls } = dependencies(["failed", "sent"], { failed: "failed", sent: "sent" });
    const result = await runFollowUpWorker(value);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(calls).toEqual(["failed", "sent"]);
  });

  test("undefined and null bridge results are treated as failed processing", async () => {
    const undefinedResult: FollowUpWorkerDependencies = {
      listDueFollowUpTaskIds: async () => ["task-1"],
      sendDueAiWhatsAppFollowUp: async () => undefined as never,
    };
    const nullResult: FollowUpWorkerDependencies = {
      listDueFollowUpTaskIds: async () => ["task-2"],
      sendDueAiWhatsAppFollowUp: async () => null as never,
    };

    await expect(runFollowUpWorker(undefinedResult)).resolves.toEqual({
      success: false,
      processed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
    await expect(runFollowUpWorker(nullResult)).resolves.toEqual({
      success: false,
      processed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
  });

  test("malformed bridge results are treated as failed processing", async () => {
    const malformed: FollowUpWorkerDependencies = {
      listDueFollowUpTaskIds: async () => ["task-1"],
      sendDueAiWhatsAppFollowUp: async () => ({ unexpected: true }) as never,
    };

    await expect(runFollowUpWorker(malformed)).resolves.toEqual({
      success: false,
      processed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
  });

  test("HUMAN_ACTIVE follow-up is counted as skipped", async () => {
    const { value } = dependencies(["human-task"], { "human-task": "skipped" });
    await expect(runFollowUpWorker(value)).resolves.toEqual({ success: true, processed: 1, sent: 0, skipped: 1, failed: 0 });
  });

  test("duplicate invocation remains safe through the existing due-send function", async () => {
    let calls = 0;
    const value: FollowUpWorkerDependencies = {
      listDueFollowUpTaskIds: async () => ["task-1"],
      sendDueAiWhatsAppFollowUp: async () => {
        calls += 1;
        return calls === 1 ? { status: "sent" } : { status: "skipped", reason: "not_pending" };
      },
    };
    expect(await runFollowUpWorker(value)).toEqual({ success: true, processed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(await runFollowUpWorker(value)).toEqual({ success: true, processed: 1, sent: 0, skipped: 1, failed: 0 });
  });

  test("malformed request returns 400", async () => {
    const { value } = dependencies([]);
    const response = await workerRequest(
      new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer secret" }, body: "{" }),
      value,
      "secret",
    );
    expect(response.status).toBe(400);
  });

  test("unauthorized request returns 401 without processing", async () => {
    let called = false;
    const value: FollowUpWorkerDependencies = {
      listDueFollowUpTaskIds: async () => { called = true; return ["task-1"]; },
      sendDueAiWhatsAppFollowUp: async () => ({ status: "sent" }),
    };
    const response = await workerRequest(new Request("https://example.test", { method: "POST" }), value, "secret");
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  test("rejects non-POST invocations", async () => {
    const { value } = dependencies([]);
    const response = await workerRequest(new Request("https://example.test", { method: "GET", headers: { authorization: "Bearer secret" } }), value, "secret");
    expect(response.status).toBe(405);
  });
});
