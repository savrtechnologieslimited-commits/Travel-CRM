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

export function authorizeWorkerRequest(request: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expectedSecret}`;
}

export async function runFollowUpWorker(
  dependencies: FollowUpWorkerDependencies,
  now = new Date().toISOString(),
): Promise<FollowUpWorkerResult> {
  const taskIds = await dependencies.listDueFollowUpTaskIds(now);
  const result: FollowUpWorkerResult = { success: true, processed: 0, sent: 0, skipped: 0, failed: 0 };

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

export async function workerRequest(
  request: Request,
  dependencies: FollowUpWorkerDependencies,
  expectedSecret: string | undefined,
): Promise<Response> {
  if (!authorizeWorkerRequest(request, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: unknown = {};
  try {
    if (request.headers.get("content-length") !== "0") body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Malformed JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const requestedNow =
    body && typeof body === "object" && typeof (body as { now?: unknown }).now === "string"
      ? (body as { now: string }).now
      : new Date().toISOString();

  try {
    const result = await runFollowUpWorker(dependencies, requestedNow);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ success: false, processed: 0, sent: 0, skipped: 0, failed: 0, error: "worker_failed" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined } };
};

export function createFollowUpWorkerHandler(
  dependencies: FollowUpWorkerDependencies,
): (request: Request) => Promise<Response> {
  return (request) =>
    workerRequest(
      request,
      dependencies,
      runtime.Deno?.env.get("WHATSAPP_FOLLOWUP_WORKER_SECRET"),
    );
}
