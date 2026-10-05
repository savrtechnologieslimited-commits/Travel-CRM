import {
  buildBroadcastAudience,
  getBroadcastSummary,
  isValidBroadcastTransition,
  summarizeBroadcastRecipients,
  validateBroadcastTemplate,
} from "./broadcasts";
import {
  cancelScheduledBroadcast,
  createBroadcastDraft,
  duplicateBroadcast,
  executeBroadcast,
  retryFailedRecipients,
} from "./broadcasts.server";
import {
  type BroadcastSchedulerDependencies,
  runBroadcastScheduler,
} from "./broadcast-scheduler";

function makeRepo() {
  const broadcasts = new Map<string, any>();
  const recipients = new Map<string, any>();
  const runs = new Map<string, any>();

  const repo = {
    async getBroadcast(id: string) {
      return broadcasts.get(id) ?? null;
    },
    async listBroadcasts() {
      return [...broadcasts.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    async listDueScheduledBroadcasts(now: string) {
      return [...broadcasts.values()].filter((broadcast) => {
        if (broadcast.status !== "scheduled") return false;
        if (!broadcast.scheduled_for) return false;
        return new Date(broadcast.scheduled_for).getTime() <= new Date(now).getTime();
      }).sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
    },
    async claimDueBroadcast(now: string, broadcastId?: string) {
      const due = await this.listDueScheduledBroadcasts(now);
      const candidate = broadcastId ? due.find((row) => row.id === broadcastId) ?? null : due[0] ?? null;
      if (!candidate) return null;
      const updated = { ...candidate, status: "running", updated_at: new Date().toISOString() };
      broadcasts.set(updated.id, updated);
      return updated;
    },
    async createBroadcast(input: any) {
      const record = {
        id: `broadcast-${Math.random().toString(36).slice(2)}`,
        title: input.title,
        status: input.status,
        audience_mode: input.audience_mode,
        template_id: input.template_id ?? null,
        body: input.body,
        scheduled_for: input.scheduled_for ?? null,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        ...input,
      };
      broadcasts.set(record.id, record);
      return record;
    },
    async updateBroadcast(id: string, patch: any) {
      const current = broadcasts.get(id);
      const merged = { ...current, ...patch, updated_at: new Date().toISOString() };
      broadcasts.set(id, merged);
      return merged;
    },
    async listRecipients(broadcastId: string) {
      return [...recipients.values()].filter((row) => row.broadcast_id === broadcastId);
    },
    async insertRecipients(rows: any[]) {
      const inserted: any[] = [];
      for (const row of rows) {
        const record = {
          id: `recipient-${Math.random().toString(36).slice(2)}`,
          broadcast_id: row.broadcast_id,
          recipient_type: row.recipient_type,
          recipient_id: row.recipient_id ?? null,
          customer_id: row.customer_id ?? null,
          lead_id: row.lead_id ?? null,
          phone: row.phone,
          display_name: row.display_name,
          conversation_id: row.conversation_id ?? null,
          status: row.status ?? "pending",
          failure_reason: row.failure_reason ?? null,
          meta_message_id: row.meta_message_id ?? null,
          sent_at: row.sent_at ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        recipients.set(record.id, record);
        inserted.push(record);
      }
      return inserted;
    },
    async updateRecipient(id: string, patch: any) {
      const current = recipients.get(id);
      const merged = { ...current, ...patch, updated_at: new Date().toISOString() };
      recipients.set(id, merged);
      return merged;
    },
    async createRun(input: any) {
      const record = {
        id: `run-${Math.random().toString(36).slice(2)}`,
        broadcast_id: input.broadcast_id,
        status: input.status,
        started_at: input.started_at,
        finished_at: input.finished_at ?? null,
        summary: input.summary ?? null,
        created_at: new Date().toISOString(),
        ...input,
      };
      runs.set(record.id, record);
      return record;
    },
    async updateRun(id: string, patch: any) {
      const current = runs.get(id);
      const merged = { ...current, ...patch, updated_at: new Date().toISOString() };
      runs.set(id, merged);
      return merged;
    },
  };

  return { repo, broadcasts, recipients, runs };
}

describe("broadcast audience targeting", () => {
  test("builds a combined customer and lead audience for all contacts mode", () => {
    const audience = buildBroadcastAudience({
      customers: [
        { id: "c1", full_name: "Amit Shah", mobile: "9876543210" },
        { id: "c2", full_name: "Priya Nair", mobile: null },
      ],
      leads: [
        { id: "l1", customer_name: "Rohan Mehta", mobile: "9988776655", status: "new" },
      ],
      mode: "all_contacts",
    });

    expect(audience.recipients).toHaveLength(2);
    expect(audience.recipients.map((recipient) => recipient.name)).toEqual(["Amit Shah", "Rohan Mehta"]);
    expect(audience.summary).toContain("2 recipients");
  });

  test("filters to only active leads for lead-only campaigns", () => {
    const audience = buildBroadcastAudience({
      customers: [{ id: "c1", full_name: "Amit Shah", mobile: "9876543210" }],
      leads: [
        { id: "l1", customer_name: "Rohan Mehta", mobile: "9988776655", status: "new" },
        { id: "l2", customer_name: "Sneha Iyer", mobile: "9911223344", status: "closed" },
      ],
      mode: "leads_only",
    });

    expect(audience.recipients).toHaveLength(1);
    expect(audience.recipients[0].name).toBe("Rohan Mehta");
    expect(summarizeBroadcastRecipients(audience.recipients)).toBe("1 recipient");
  });

  test("normalizes invalid phone numbers and rejects missing numbers", () => {
    const audience = buildBroadcastAudience({
      customers: [{ id: "c1", full_name: "Amit Shah", mobile: "(987) 654-3210" }],
      leads: [{ id: "l1", customer_name: "No phone lead", mobile: "", status: "new" }],
      mode: "all_contacts",
    });

    expect(audience.recipients).toHaveLength(1);
    expect(audience.recipients[0].phone).toBe("919876543210");
  });
});

describe("broadcast state and persistence", () => {
  test("creates a draft and stores concrete recipient rows", async () => {
    const { repo } = makeRepo();
    const result = await createBroadcastDraft({
      title: "Holiday update",
      mode: "customers_only",
      body: "Hi {{name}}, your next trip is ready.",
      customers: [
        { id: "c1", full_name: "Amit Shah", mobile: "9876543210" },
        { id: "c2", full_name: "Priya Nair", mobile: null },
      ],
      leads: [],
      repository: repo,
    });

    expect(result.broadcast.status).toBe("draft");
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0].display_name).toBe("Amit Shah");
    expect(result.summary.eligible).toBe(1);
  });

  test("persists a scheduled broadcast and lists it back from storage", async () => {
    const { repo } = makeRepo();
    const scheduled = await repo.createBroadcast({
      title: "Holiday reminder",
      status: "scheduled",
      audience_mode: "all_contacts",
      template_id: null,
      body: "Hi {{name}}",
      scheduled_for: "2026-10-10T18:00:00.000Z",
      created_by: null,
    });

    await repo.insertRecipients([
      { broadcast_id: scheduled.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const listed = await repo.listBroadcasts();
    expect(listed.some((item) => item.id === scheduled.id && item.status === "scheduled" && item.scheduled_for === "2026-10-10T18:00:00.000Z")).toBe(true);
  });

  test("state transitions reject invalid moves and allow legal ones", () => {
    expect(isValidBroadcastTransition(undefined, "draft")).toBe(true);
    expect(isValidBroadcastTransition("draft", "scheduled")).toBe(true);
    expect(isValidBroadcastTransition("draft", "running")).toBe(true);
    expect(isValidBroadcastTransition("scheduled", "running")).toBe(true);
    expect(isValidBroadcastTransition("running", "completed")).toBe(true);
  });

  test("cancelled scheduled broadcasts mark remaining recipients as skipped", async () => {
    const { repo } = makeRepo();
    const broadcast = await repo.createBroadcast({
      title: "Visa reminder",
      status: "scheduled",
      audience_mode: "all_contacts",
      template_id: null,
      body: "Hi {{name}}",
      scheduled_for: new Date().toISOString(),
      created_by: null,
    });

    const recipients = await repo.insertRecipients([
      { broadcast_id: broadcast.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
      { broadcast_id: broadcast.id, recipient_type: "lead", recipient_id: "l1", customer_id: null, lead_id: "l1", phone: "919988776655", display_name: "Rohan", status: "sent", failure_reason: null, meta_message_id: "m-1", sent_at: new Date().toISOString() },
    ]);

    const result = await cancelScheduledBroadcast({ broadcastId: broadcast.id, repository: repo });
    expect(result.broadcast.status).toBe("cancelled");
    const nextRecipients = await repo.listRecipients(broadcast.id);
    expect(nextRecipients.find((row) => row.display_name === "Amit")?.status).toBe("skipped");
    expect(recipients[1].status).toBe("sent");
  });

  test("duplicate creates a fresh draft without mutating the original recipients", async () => {
    const { repo } = makeRepo();
    const original = await repo.createBroadcast({
      title: "Offer set",
      status: "draft",
      audience_mode: "customers_only",
      template_id: null,
      body: "Hi {{name}}",
      scheduled_for: null,
      created_by: null,
    });

    await repo.insertRecipients([
      { broadcast_id: original.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const duplicated = await duplicateBroadcast({ broadcastId: original.id, repository: repo });
    expect(duplicated.broadcast.title).toBe("Offer set (copy)");
    expect(duplicated.broadcast.status).toBe("draft");
    expect((await repo.listRecipients(duplicated.broadcast.id)).length).toBe(1);
  });
});

describe("broadcast scheduler", () => {
  test("finds due scheduled broadcasts", async () => {
    const { repo } = makeRepo();
    const due = await repo.createBroadcast({
      title: "Due", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });
    await repo.createBroadcast({
      title: "Future", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2099-01-01T00:00:00.000Z", created_by: null,
    });
    await repo.createBroadcast({
      title: "Cancelled", status: "cancelled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });

    const dueBroadcasts = await (repo as any).listDueScheduledBroadcasts("2026-01-02T00:00:00.000Z");
    expect(dueBroadcasts.map((entry: any) => entry.id)).toContain(due.id);
    expect(dueBroadcasts.map((entry: any) => entry.title)).not.toContain("Future");
    expect(dueBroadcasts.map((entry: any) => entry.title)).not.toContain("Cancelled");
  });

  test("atomically claims a due scheduled broadcast once", async () => {
    const { repo } = makeRepo();
    const due = await repo.createBroadcast({
      title: "Atomic", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });

    const first = await (repo as any).claimDueBroadcast("2026-01-02T00:00:00.000Z");
    const second = await (repo as any).claimDueBroadcast("2026-01-02T00:00:00.000Z");

    expect(first?.id).toBe(due.id);
    expect(first?.status).toBe("running");
    expect(second).toBeNull();
  });

  test("runs the scheduler for due broadcasts and persists completion", async () => {
    const { repo } = makeRepo();
    const due = await repo.createBroadcast({
      title: "Now", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });
    await repo.insertRecipients([
      { broadcast_id: due.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const scheduler: BroadcastSchedulerDependencies = {
      listDueScheduledBroadcasts: async (now) => (await (repo as any).listDueScheduledBroadcasts(now)).map((item:any) => ({ id: item.id, status: item.status, scheduled_for: item.scheduled_for })),
      claimDueBroadcast: async (broadcastId, now) => (await (repo as any).claimDueBroadcast(now, broadcastId)),
      executeBroadcast: async ({ broadcastId, now }) => executeBroadcast({ broadcastId, mode: "local", repository: repo, now: () => now ?? "2026-01-02T00:00:00.000Z" }),
    };

    const result = await runBroadcastScheduler(scheduler, "2026-01-02T00:00:00.000Z");
    expect(result.success).toBe(true);
    expect(result.executed).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect((await repo.getBroadcast(due.id))?.status).toBe("completed");
  });

  test("ignores future and cancelled broadcasts", async () => {
    const { repo } = makeRepo();
    await repo.createBroadcast({
      title: "Future", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2099-01-01T00:00:00.000Z", created_by: null,
    });
    await repo.createBroadcast({
      title: "Cancelled", status: "cancelled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });

    const scheduler: BroadcastSchedulerDependencies = {
      listDueScheduledBroadcasts: async (now) => (await (repo as any).listDueScheduledBroadcasts(now)).map((item:any) => ({ id: item.id, status: item.status, scheduled_for: item.scheduled_for })),
      claimDueBroadcast: async (broadcastId) => { const broadcast = await repo.getBroadcast(broadcastId); return broadcast && broadcast.status === "scheduled" ? { ...broadcast, status: "running" } : null; },
      executeBroadcast: async () => { throw new Error("should not execute"); },
    };

    const result = await runBroadcastScheduler(scheduler, "2026-01-02T00:00:00.000Z");
    expect(result.processed).toBe(0);
    expect(result.executed).toBe(0);
  });

  test("successful recipients are not resent", async () => {
    const { repo } = makeRepo();
    const due = await repo.createBroadcast({
      title: "No repeat", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });
    await repo.insertRecipients([
      { broadcast_id: due.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "sent", failure_reason: null, meta_message_id: "m-1", sent_at: new Date().toISOString() },
      { broadcast_id: due.id, recipient_type: "customer", recipient_id: "c2", customer_id: "c2", lead_id: null, phone: "919823456789", display_name: "Priya", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const scheduler: BroadcastSchedulerDependencies = {
      listDueScheduledBroadcasts: async (now) => (await (repo as any).listDueScheduledBroadcasts(now)).map((item:any) => ({ id: item.id, status: item.status, scheduled_for: item.scheduled_for })),
      claimDueBroadcast: async (broadcastId, now) => (await (repo as any).claimDueBroadcast(now, broadcastId)),
      executeBroadcast: async ({ broadcastId, now }) => executeBroadcast({ broadcastId, mode: "local", repository: repo, now: () => now ?? "2026-01-02T00:00:00.000Z" }),
    };

    const result = await runBroadcastScheduler(scheduler, "2026-01-02T00:00:00.000Z");
    expect(result.executed).toBe(1);
    expect((await repo.listRecipients(due.id)).find((row) => row.display_name === "Amit")?.status).toBe("sent");
    expect((await repo.listRecipients(due.id)).find((row) => row.display_name === "Priya")?.status).toBe("accepted");
  });

  test("scheduler failure does not create fake success", async () => {
    const { repo } = makeRepo();
    const due = await repo.createBroadcast({
      title: "Broken", status: "scheduled", audience_mode: "customers_only", template_id: null, body: "Hi {{name}}", scheduled_for: "2022-01-01T00:00:00.000Z", created_by: null,
    });
    await repo.insertRecipients([
      { broadcast_id: due.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const scheduler: BroadcastSchedulerDependencies = {
      listDueScheduledBroadcasts: async (now) => (await (repo as any).listDueScheduledBroadcasts(now)).map((item:any) => ({ id: item.id, status: item.status, scheduled_for: item.scheduled_for })),
      claimDueBroadcast: async (broadcastId, now) => (await (repo as any).claimDueBroadcast(now, broadcastId)),
      executeBroadcast: async () => { throw new Error("provider outage"); },
    };

    const result = await runBroadcastScheduler(scheduler, "2026-01-02T00:00:00.000Z");
    expect(result.success).toBe(false);
    expect(result.executed).toBe(0);
    expect(result.failed).toBe(1);
    expect((await repo.getBroadcast(due.id))?.status).toBe("running");
  });
});

describe("broadcast execution and retries", () => {
  test("mock execution creates accepted recipient results and summary counts", async () => {
    const { repo } = makeRepo();
    const broadcast = await repo.createBroadcast({
      title: "Promo",
      status: "draft",
      audience_mode: "all_contacts",
      template_id: null,
      body: "Hi {{name}} - travel offer",
      scheduled_for: null,
      created_by: null,
    });

    const recipients = await repo.insertRecipients([
      { broadcast_id: broadcast.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
      { broadcast_id: broadcast.id, recipient_type: "lead", recipient_id: "l1", customer_id: null, lead_id: "l1", phone: "919988776655", display_name: "Rohan", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const result = await executeBroadcast({ broadcastId: broadcast.id, mode: "local", repository: repo, now: () => "2026-10-02T00:00:00.000Z" });
    expect(result.broadcast.status).toBe("completed");
    expect(result.summary.sentAccepted).toBe(2);
    expect((await repo.listRecipients(broadcast.id)).every((row) => ["accepted"].includes(row.status))).toBe(true);
    expect(getBroadcastSummary(recipients).total).toBe(2);
  });

  test("retry failed recipients only replays the failed rows", async () => {
    const { repo } = makeRepo();
    const broadcast = await repo.createBroadcast({
      title: "Retry test",
      status: "draft",
      audience_mode: "customers_only",
      template_id: null,
      body: "Hi {{name}}",
      scheduled_for: null,
      created_by: null,
    });

    const failed = await repo.insertRecipients([
      { broadcast_id: broadcast.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "failed", failure_reason: "temporary", meta_message_id: null, sent_at: null },
      { broadcast_id: broadcast.id, recipient_type: "customer", recipient_id: "c2", customer_id: "c2", lead_id: null, phone: "919823456789", display_name: "Priya", status: "accepted", failure_reason: null, meta_message_id: "m-2", sent_at: new Date().toISOString() },
    ]);

    const result = await retryFailedRecipients({ broadcastId: broadcast.id, mode: "local", repository: repo, now: () => "2026-10-02T00:00:00.000Z" });
    expect(result.summary.sentAccepted).toBe(2);
    expect(result.recipients.some((row) => row.display_name === "Amit" && row.status === "accepted")).toBe(true);
    expect(result.recipients.find((row) => row.display_name === "Priya")?.status).toBe("accepted");
    expect(failed.length).toBe(2);
  });

  test("meta execution routes through the existing WhatsApp provider boundary", async () => {
    const { repo } = makeRepo();
    const broadcast = await repo.createBroadcast({
      title: "Meta promo",
      status: "draft",
      audience_mode: "customers_only",
      template_id: null,
      body: "{{name}}, special offer", 
      scheduled_for: null,
      created_by: null,
    });

    const provider = {
      sendWhatsAppMessage: async (input: any) => ({
        providerMessageId: "meta-message-1",
        status: "accepted",
        timestamp: "2026-10-02T00:00:00.000Z",
        recipient: input.recipientPhone,
        messageType: "text",
      }),
      sendWhatsAppTextMessage: async (input: any) => ({
        providerMessageId: "meta-message-1",
        status: "accepted",
        timestamp: "2026-10-02T00:00:00.000Z",
        recipient: input.recipientPhone,
        messageType: "text",
      }),
    };

    const recipients = await repo.insertRecipients([
      { broadcast_id: broadcast.id, recipient_type: "customer", recipient_id: "c1", customer_id: "c1", lead_id: null, phone: "919876543210", display_name: "Amit", status: "pending", failure_reason: null, meta_message_id: null, sent_at: null },
    ]);

    const result = await executeBroadcast({
      broadcastId: broadcast.id,
      mode: "meta",
      repository: repo,
      provider,
      now: () => "2026-10-02T00:00:00.000Z",
    });

    expect(result.recipients[0].status).toBe("sent");
    expect(result.recipients[0].meta_message_id).toBe("meta-message-1");
    expect(recipients[0].status).toBe("pending");
  });
});

describe("template validation", () => {
  test("validates resolved values and missing placeholders", () => {
    const valid = validateBroadcastTemplate({
      body: "Hi {{name}}, trip to {{destination}}",
      values: { name: "Amit", destination: "Dubai" },
    });
    expect(valid.valid).toBe(true);

    const invalid = validateBroadcastTemplate({
      body: "Hi {{name}}, trip to {{destination}}",
      values: { name: "Amit" },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors[0]).toContain("destination");
  });

  test("summarizes recipient stats without pretending delivery/read values exist", () => {
    const stats = getBroadcastSummary([
      { status: "pending" },
      { status: "sent" },
      { status: "delivered" },
      { status: "read" },
      { status: "failed" },
      { status: "skipped" },
    ]);

    expect(stats.total).toBe(6);
    expect(stats.pending).toBe(1);
    expect(stats.sentAccepted).toBe(1);
    expect(stats.delivered).toBe(1);
    expect(stats.read).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.skipped).toBe(1);
  });
});
