# Broadcast scheduler

This worker is the smallest production-safe scheduling mechanism in the current CRM architecture: a Supabase Edge Function trigger that looks for due scheduled broadcasts, atomically claims one, and delegates execution to the existing broadcast execution path.

## Trigger mechanism

The scheduler is server-side and must be invoked by a periodic trigger such as:

- Supabase cron / pg_cron every 5 minutes
- or an external cron job calling the Edge Function over HTTP

The function authenticates with a bearer secret in `BROADCAST_SCHEDULER_SECRET`.

## Required production setup

1. Deploy the Edge Function.
2. Set `BROADCAST_SCHEDULER_SECRET` as a Supabase Edge Function secret.
3. Provide a private server adapter that calls the existing `executeBroadcast(...)` flow for each claimed broadcast.
4. Configure the periodic trigger to POST to the function endpoint, for example every 5 minutes.

## Scheduling behavior

- `status = 'scheduled'`
- `scheduled_for <= now`
- claim is atomic via `status` transition to `running`
- only one scheduler invocation succeeds in claiming each due broadcast
- already-sent recipients are not resent because the execution path skips successful rows
- cancelled broadcasts are ignored because they are not returned as due scheduled items
