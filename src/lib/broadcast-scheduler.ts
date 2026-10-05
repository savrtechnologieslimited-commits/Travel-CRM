export type BroadcastSchedulerDueItem = {
  id: string;
  status: string;
  scheduled_for: string | null;
};

export type BroadcastSchedulerExecutionInput = {
  broadcastId: string;
  now?: string;
  mode?: "local" | "meta";
};

export type BroadcastSchedulerDependencies = {
  listDueScheduledBroadcasts: (now: string) => Promise<BroadcastSchedulerDueItem[]>;
  claimDueBroadcast: (broadcastId: string, now: string) => Promise<BroadcastSchedulerDueItem | null>;
  executeBroadcast: (input: BroadcastSchedulerExecutionInput) => Promise<unknown>;
};

export type BroadcastSchedulerResult = {
  success: boolean;
  processed: number;
  executed: number;
  skipped: number;
  failed: number;
};

export async function runBroadcastScheduler(
  dependencies: BroadcastSchedulerDependencies,
  now = new Date().toISOString(),
): Promise<BroadcastSchedulerResult> {
  const dueBroadcasts = await dependencies.listDueScheduledBroadcasts(now);
  const result: BroadcastSchedulerResult = {
    success: true,
    processed: 0,
    executed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const broadcast of dueBroadcasts) {
    result.processed += 1;
    try {
      const claimed = await dependencies.claimDueBroadcast(broadcast.id, now);
      if (!claimed) {
        result.skipped += 1;
        continue;
      }
      await dependencies.executeBroadcast({
        broadcastId: broadcast.id,
        mode: "local",
        now,
      });
      result.executed += 1;
    } catch {
      result.failed += 1;
      result.success = false;
    }
  }

  if (result.failed > 0) {
    result.success = false;
  }

  return result;
}
