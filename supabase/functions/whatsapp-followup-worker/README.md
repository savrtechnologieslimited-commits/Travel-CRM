# WhatsApp follow-up worker

This function is intended for authenticated server-to-server invocation. The Supabase gateway requires a JWT, and the handler also supports the `WHATSAPP_FOLLOWUP_WORKER_SECRET` server secret for an additional bearer check.

The production adapter must provide:

- due task IDs from the existing `tasks` table
- the existing `sendDueAiWhatsAppFollowUp({ taskId, now })` function

The Edge runtime cannot safely import the app's Node/TanStack server module directly. The deployed adapter must therefore be a private server-side bridge to that existing function; it must not reimplement follow-up decisions or outbound sending.

The worker does not duplicate follow-up or outbound logic. It only authenticates, iterates due task IDs, delegates each task, and returns counts.

Intended production schedule: invoke frequently, such as every 5 minutes, through Supabase Cron/pg_cron. No cron job is created by this task.

Before activation:

1. Deploy the function.
2. Configure `WHATSAPP_FOLLOWUP_WORKER_SECRET` as an Edge Function secret.
3. Provide the server adapter that supplies due task IDs and calls `sendDueAiWhatsAppFollowUp`.
4. Create the pg_cron job separately with a server-side JWT and worker secret.
