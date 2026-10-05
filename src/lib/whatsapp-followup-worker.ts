export type FollowUpWorkerItemResult =
  | { status: "sent" }
  | { status: "skipped"; reason?: string };

export type FollowUpWorkerResult = {
  success: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
};

export type FollowUpWorkerDependencies = {
  listDueFollowUpTaskIds: (now: string) => Promise<string[]>;
  sendDueAiWhatsAppFollowUp: (input: { taskId: string; now: string }) => Promise<FollowUpWorkerItemResult>;
};

function isValidFollowUpWorkerItemResult(value: unknown): value is FollowUpWorkerItemResult {
  return (
    !!value &&
    typeof value === "object" &&
    "status" in value &&
    (value.status === "sent" || value.status === "skipped")
  );
}

export function authorizeFollowUpWorkerRequest(
  request: Request,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) return false;
  return request.headers.get("authorization") === `Bearer ${expectedSecret}`;
}

export async function runWhatsAppFollowUpWorker(
  dependencies: FollowUpWorkerDependencies,
  now = new Date().toISOString(),
): Promise<FollowUpWorkerResult> {
  const taskIds = [...new Set(await dependencies.listDueFollowUpTaskIds(now))];
  const result: FollowUpWorkerResult = {
    success: true,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const taskId of taskIds) {
    result.processed += 1;
    try {
      const item = await dependencies.sendDueAiWhatsAppFollowUp({ taskId, now });
      if (!isValidFollowUpWorkerItemResult(item)) {
        result.failed += 1;
        continue;
      }
      if (item.status === "sent") result.sent += 1;
      else result.skipped += 1;
    } catch {
      result.failed += 1;
    }
  }

  if (result.failed > 0) result.success = false;
  return result;
}
