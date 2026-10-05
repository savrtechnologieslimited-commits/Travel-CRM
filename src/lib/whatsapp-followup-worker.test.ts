import { describe, expect, test } from "bun:test";
import {
  authorizeFollowUpWorkerRequest,
  runWhatsAppFollowUpWorker,
  type FollowUpWorkerDependencies,
} from "./whatsapp-followup-worker";

function createDependencies(taskIds: string[], failingTaskId?: string) {
  const calls: string[] = [];
  const dependencies: FollowUpWorkerDependencies = {
    listDueFollowUpTaskIds: async () => taskIds,
    sendDueAiWhatsAppFollowUp: async ({ taskId }) => {
      calls.push(taskId);
      if (taskId === failingTaskId) throw new Error("provider failure");
      return taskId.startsWith("skip")
        ? { status: "skipped", reason: "HUMAN_ACTIVE" }
        : { status: "sent" };
    },
  };
  return { dependencies, calls };
}

describe("WhatsApp follow-up worker", () => {
  test("authorized worker execution invokes the existing engine once per unique task", async () => {
    const { dependencies, calls } = createDependencies(["task-1", "task-1", "task-2"]);
    const result = await runWhatsAppFollowUpWorker(dependencies, "2026-01-01T00:00:00.000Z");

    expect(result).toEqual({ success: true, processed: 2, sent: 2, skipped: 0, failed: 0 });
    expect(calls).toEqual(["task-1", "task-2"]);
  });

  test("unauthorized invocation is rejected", () => {
    expect(
      authorizeFollowUpWorkerRequest(new Request("https://example.test"), undefined),
    ).toBe(false);
    expect(
      authorizeFollowUpWorkerRequest(
        new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }),
        "worker-secret",
      ),
    ).toBe(false);
  });

  test("authorized invocation accepts the dedicated server secret", () => {
    expect(
      authorizeFollowUpWorkerRequest(
        new Request("https://example.test", { headers: { authorization: "Bearer worker-secret" } }),
        "worker-secret",
      ),
    ).toBe(true);
  });

  test("successful result is returned when all tasks send", async () => {
    const { dependencies } = createDependencies(["task-1"]);
    await expect(runWhatsAppFollowUpWorker(dependencies)).resolves.toMatchObject({
      success: true,
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test("engine failures are counted safely", async () => {
    const { dependencies } = createDependencies(["task-1", "task-2"], "task-1");
    await expect(runWhatsAppFollowUpWorker(dependencies)).resolves.toMatchObject({
      success: false,
      processed: 2,
      sent: 1,
      skipped: 0,
      failed: 1,
    });
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

    await expect(runWhatsAppFollowUpWorker(undefinedResult)).resolves.toEqual({
      success: false,
      processed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
    await expect(runWhatsAppFollowUpWorker(nullResult)).resolves.toEqual({
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

    await expect(runWhatsAppFollowUpWorker(malformed)).resolves.toEqual({
      success: false,
      processed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
  });

  test("skipped follow-ups are counted without failing the worker", async () => {
    const { dependencies } = createDependencies(["skip-human"]);
    await expect(runWhatsAppFollowUpWorker(dependencies)).resolves.toEqual({
      success: true,
      processed: 1,
      sent: 0,
      skipped: 1,
      failed: 0,
    });
  });
});
