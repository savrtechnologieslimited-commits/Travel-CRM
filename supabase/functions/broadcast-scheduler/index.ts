import { runBroadcastScheduler, type BroadcastSchedulerDependencies } from "../../../src/lib/broadcast-scheduler";

export type BroadcastSchedulerResult = Awaited<ReturnType<typeof runBroadcastScheduler>>;

export function authorizeBroadcastSchedulerRequest(request: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expectedSecret}`;
}

export async function schedulerRequest(
  request: Request,
  dependencies: BroadcastSchedulerDependencies,
  expectedSecret: string | undefined,
): Promise<Response> {
  if (!authorizeBroadcastSchedulerRequest(request, expectedSecret)) {
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
    const result = await runBroadcastScheduler(dependencies, requestedNow);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ success: false, processed: 0, executed: 0, skipped: 0, failed: 0, error: "broadcast_scheduler_failed" }),
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

export function createBroadcastSchedulerHandler(
  dependencies: BroadcastSchedulerDependencies,
): (request: Request) => Promise<Response> {
  return (request) =>
    schedulerRequest(
      request,
      dependencies,
      runtime.Deno?.env.get("BROADCAST_SCHEDULER_SECRET"),
    );
}
