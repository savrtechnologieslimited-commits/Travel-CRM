# New Business Travel CRM Setup Guide

This guide sets up an independent copy of the Travel CRM for a new business:
its own source repository, Vercel project, domain, Supabase project, staff
accounts, and (if enabled) WhatsApp CRM integration. It is intended to keep the
existing production deployment and its data untouched.

## First: understand the three local ports

Ports are only for local development. They are not part of the production
domain.

| Application | Folder | Local URL | Needed for basic CRM? |
| --- | --- | --- | --- |
| Travel CRM web app | Repository root | `http://localhost:5173` | Yes |
| WACRM WhatsApp app | Separate WACRM checkout (folder containing its `package.json`) | `http://localhost:3000` | Only for WhatsApp inbox/automation features |
| OCR service | `ocr-service` | `http://localhost:8001` | Only for OCR on scanned documents |

The root application uses Vite/TanStack Start and is configured for Vercel.
WACRM is a separate Next.js app. If you use an extracted WACRM archive, its
actual app root is the directory containing its `package.json`; archives
sometimes add an outer wrapper directory. OCR is a separate Python service.
You do not need to start all three to work on the Travel CRM.

The WACRM app can stay in that separate folder or be moved/copied elsewhere.
It does not have to be physically inside the Travel CRM repository. Keep the
two apps as separate Vercel projects and select each app's own root directory.
For WACRM, select the directory containing its `package.json`, not the outer
`wacrm-main-extracted` folder.

**Before publishing any WACRM checkout, inspect it for `.env.local` files and
uncommitted Git changes.** Ensure environment files are ignored; never share,
upload, or commit their contents. Preserve wanted local edits and review them
before copying or pushing to another repository. A Git-connected Vercel deploy
only includes committed and pushed changes.

## Deployment version verified from Vercel

The screenshots provided for the existing deployment show:

- Production environment, status **Ready**
- Git source branch **`main`**
- Commit **`7ef351a`** (`Remove DMC tab from customer bookings`)

The commit age shown by GitHub is not the deploy date. To get that exact source
snapshot, use the commit-specific archive rather than a moving branch ZIP:

<https://github.com/savrtechnologieslimited-commits/Travel-CRM/archive/7ef351a.zip>

The archive is source code only. It does not include Vercel environment
variables, Supabase databases/data, provider credentials, or Git history.

## Non-negotiable safety rules

1. Create a **new private Git repository**, **new Vercel project**, and **new
   Supabase project** for the new business.
2. Do not change the existing Vercel project, existing Supabase project, its
   production secrets, or its production data while preparing the copy.
3. Do not copy production customer, lead, booking, payment, WhatsApp, or staff
   data into the new business.
4. Never put a Supabase service-role key, WhatsApp access token, OAuth client
   secret, API key, or bridge secret in a `VITE_` variable or committed file.
5. The root `supabase/config.toml` in the source names the existing Supabase
   project. Do not use Supabase CLI commands until it has been reviewed and
   linked to the new project.
6. Do not run all incremental CRM migrations against an empty database and
   assume that creates the whole application schema. The repository copy
   inspected for this guide does not contain a complete initial CRM schema
   baseline (`supabase/remote-public-schema.sql` is empty here). Resolve the
   baseline with the database administrator before deploying.
7. Verify the currently deployed commit in Vercel before using a ZIP. A
   deployment can differ from a GitHub branch if it was deployed from an
   uncommitted local directory.

## Phase 1 — Create the private code copy

### Option A: use the commit-specific ZIP

1. Download the commit archive linked above.
2. Extract it into a new folder, for example:
   `C:\Users\YOUR_NAME\Desktop\travel-crm-new`.
3. In VS Code choose **File → Open Folder** and open the extracted repository
   root. The correct root contains `package.json`, `src`, `supabase`,
   `apps`, and `ocr-service`.
4. Create a new **private** GitHub repository with no README/license/template
   files, then open the VS Code terminal (PowerShell) and run this from the
   extracted root, replacing the URL:

   ```powershell
   git init
   git add .
   git commit -m "Initial fresh Travel CRM copy"
   git branch -M main
   git remote add origin "https://github.com/NEW-OWNER/NEW-PRIVATE-REPO.git"
   git push -u origin main
   ```

   Before `git add .`, check that there are no `.env`, `.env.local`, service
   keys, tokens, or customer exports in the extracted folder.

### Option B: clone the source repository with Git history

Create an empty private destination repository first, then run in PowerShell:

```powershell
$target = "C:\Users\YOUR_NAME\Desktop\travel-crm-new"
git clone "https://github.com/savrtechnologieslimited-commits/Travel-CRM.git" $target
Set-Location $target
git switch -c client-fresh-start 7ef351a
git remote set-url origin "https://github.com/NEW-OWNER/NEW-PRIVATE-REPO.git"
git push -u origin client-fresh-start
```

This branch starts from the verified deployment commit. If Git says that
`7ef351a` is not available, stop and confirm the source repository before
continuing. The ZIP option is simpler but has no Git history.

## Phase 2 — Prepare the CRM database (blocking prerequisite)

The Travel CRM needs its complete Postgres schema, functions, triggers,
permissions, row-level-security policies, extensions, storage buckets/policies,
and seed/reference data. The incremental SQL files in
`supabase/migrations` are changes over time, not a verified empty-database
bootstrap for this copy. Applying only those files to a blank database can
leave the app unusable or insecure.

Have the current Supabase/database administrator prepare and validate a
**schema-only** baseline for a brand-new Supabase project. It must:

- include the CRM schema and its required private functions, policies, triggers,
  extensions, storage setup, and required non-customer lookup/reference data;
- exclude all business/customer/lead/booking/payment/WhatsApp records and all
  existing auth users;
- be restored and tested in the **new** Supabase project, not production;
- identify which repository migrations are already represented in the
  baseline, so only later unapplied migrations are run, in their correct order;
- confirm that the new database has the required objects and RLS policies
  before any real user data is entered.

Do not make a database dump containing production data and then try to delete
the rows afterward. Do not paste database passwords or service-role keys into
VS Code chat. The separate file `supabase/wacrm_same_project.sql` is WACRM
schema content; it is not the missing CRM bootstrap.

After the schema plan is approved:

1. Create a new Supabase project for the business and record its project
   reference, URL, database password, publishable key, and service-role key in
   the business's password manager.
2. In this copy only, change `project_id` in `supabase/config.toml` to the new
   project reference.
3. Have the database administrator restore and validate the CRM schema-only
   baseline in that new project. Then apply only the CRM migrations that are
   newer than, and not included in, the baseline.
4. Keep a written list of every applied migration and whether its functions,
   policies, storage, and scheduled jobs were also installed.

## Phase 3 — Local CRM setup

Install Node.js 20+ and Bun, then from the repository root run:

```powershell
bun install
bun run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open <http://localhost:5173>. If port 5173 is already taken, close the other
local dev server or choose an unused port; update Supabase Auth redirect URLs
to match that local port during development.

The root `package.json` also provides:

```powershell
bun run build
bun run typecheck
bun run lint
bun test
```

Run these before deploying. Do not use the `apps/wacrm` commands to start the
main CRM.

## Phase 4 — Deploy the main CRM to Vercel

1. In Vercel, create a **new project** and import the new private GitHub repo.
2. Set **Root Directory** to the repository root (`.`), not `apps/wacrm`.
3. Use the root app build (`bun run build`, which runs `vite build`). The repo
   includes `vercel.json` and a Vercel Nitro preset in `vite.config.ts`.
4. Add the following environment variables to the new Vercel project. Use the
   new business's Supabase project values:

   | Variable | Value | Exposure |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | New Supabase project URL | Browser/build-time |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | New Supabase publishable key | Browser/build-time |
   | `SUPABASE_URL` | Same new Supabase URL | Server |
   | `SUPABASE_PUBLISHABLE_KEY` | Same new publishable key | Server |
   | `SUPABASE_SERVICE_ROLE_KEY` | New Supabase service-role key | **Server only; secret** |

   Set them for Production and Preview as appropriate. Never prefix the
   service-role key with `VITE_`.
5. Deploy to the Vercel preview URL first. Check build logs and test against
   the new database before assigning the production domain.

## Phase 5 — Configure authentication and the domain

1. In the new Vercel project, open **Settings → Domains**, add the new
   business's domain, and apply the DNS records Vercel shows.
2. Wait for Vercel to verify the domain and HTTPS certificate.
3. In the new Supabase project, open **Authentication → URL Configuration**:
   - Site URL: `https://YOUR-NEW-DOMAIN`
   - Redirect URL: `https://YOUR-NEW-DOMAIN/reset-password`
   - Add the exact Vercel preview URL plus its reset-password path if preview
     authentication is needed.
   - For local development, allow `http://localhost:5173` and
     `http://localhost:5173/reset-password` (or the actual local port used).
4. Redeploy the CRM after setting the production domain/environment settings.
5. Invite/create the new business's first administrator in the new Supabase
   Auth project using the app's supported staff onboarding flow. Do not reuse
   production staff accounts.

## Phase 6 — Enable optional modules

The base CRM uses its new Supabase project. Optional external integrations
need their own provider accounts/credentials. Enable only the ones the new
business will use.

### AI itinerary tools and planner

Add server-only variables to the CRM Vercel project:

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TRAVEL_PLANNER_MODEL
```

Use models supported by the provider/account. Keep the API key server-only.
Without these settings, AI generation/planning functions that require OpenAI
will report that the provider is not configured; manual itinerary management
is separate.

### Email connections

If staff need Gmail/Google or Zoho mail connection features, create OAuth
credentials for the new business and set the relevant server-only values:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REDIRECT_URI
ZOHO_ACCOUNTS_URL
ZOHO_MAIL_API_URL
```

The app has a `GOOGLE_REDIRECT_URI` override; its code currently contains a
localhost fallback at `http://localhost:3000/gmail/oauth/callback`. Do not use
that localhost value in production. Before enabling email, verify the actual
redirect URI shown/used by the current deployed app and configure the
provider's authorized callback to that exact HTTPS URL. Set the production
redirect URI explicitly in Vercel. These integrations are not required for the
base CRM.

### OCR for scanned documents

OCR is a separate Python service, not a Vercel port. For local testing, its
Docker Compose service listens on `8001`; the Vercel server must not be
configured to call `localhost`.

Deploy `ocr-service` to a private HTTPS container/service that can be reached
from the CRM server. Configure:

| Where | Variable | Value |
| --- | --- | --- |
| OCR service | `OCR_HOST` | `0.0.0.0` |
| OCR service | `OCR_PORT` | `8001` (or platform port) |
| OCR service | `OCR_SERVICE_API_KEY` | New strong random secret |
| CRM Vercel server | `PADDLE_OCR_URL` | OCR service HTTPS base URL |
| CRM Vercel server | `OCR_SERVICE_API_KEY` | Same secret as OCR service |

The service also accepts `OCR_MAX_FILE_SIZE_BYTES`, `OCR_TIMEOUT_SECONDS`, and
`OCR_DOWNLOAD_TIMEOUT_SECONDS` (documented defaults are 10485760, 45, and 30).
Do not expose the OCR key in browser code. See `ocr-service/README.md`.

### WhatsApp inbox, contact matching, flows, and greetings (WACRM)

WACRM is a **separate application and database**. To provide the WhatsApp
features, deploy and configure both applications; do not point a new CRM at
the current business's WACRM project/account.

1. Create a new WACRM Supabase project, separate from the CRM Supabase project.
2. Use the separate WACRM checkout. Its app root is the directory containing
   its `package.json` (not an outer archive wrapper). Its local port is 3000,
   and it has its own deployment environment variables, authentication URLs,
   storage, and database. It may be moved, but keep its source separate from
   the main CRM project.
3. Before pushing it to the new WACRM GitHub repository, inspect the Git
   status and decide which existing local edits and untracked files belong in
   the new business's version. Preserve wanted changes; do not use `git reset`,
   blanket cleanup, or overwrite the folder. Confirm `.env.local` remains
   untracked and never copy its values into chat or source control.
4. In the separate WACRM Vercel project, connect its repository and set
   **Root Directory** to the directory containing WACRM's `package.json` (the
   repository root if the WACRM app is pushed by itself; otherwise
   `apps/wacrm` for the bundled CRM repository). Its local start command is
   `npm run dev`, which serves `http://localhost:3000`.
5. Install the WACRM database using its own ordered migrations under
   that WACRM checkout's `supabase/migrations`. Do not run those migrations
   against the CRM database. Follow the WACRM docs linked below for the full
   Supabase, Meta, and deployment setup.
6. Confirm the WACRM checkout contains the CRM bridge/contact-matching/flow
   integration endpoints and their required migrations before expecting CRM
   embedding, contact matching, destination actions, or flow-completion sync
   to work. The separate WACRM checkout can be a different version from the
   bundled `apps/wacrm` copy. Do not copy integration migrations blindly;
   have the coding agent compare the two versions and validate schema/code
   compatibility first.
7. Set WACRM's Supabase URL, anon/publishable key, service-role key,
   `ENCRYPTION_KEY`, and required Meta credentials/secrets as server
   environment values. Generate a unique encryption key for this WACRM
   deployment; do not change it after storing encrypted WhatsApp credentials.
8. In Meta, configure the new business's WhatsApp Cloud API/WABA/phone number
   and webhook callback:
   `https://YOUR-WACRM-DOMAIN/api/whatsapp/webhook`.
   Subscribe to the required `messages` webhook field and complete Meta's
   verification/business/template setup. Keep Meta tokens private.
9. In WACRM, create the business's workspace/account and record its account
   UUID. Configure its WhatsApp account in WACRM's own settings.
10. Generate one strong random `WACRM_BRIDGE_SECRET` of at least 32 bytes. Set
   the **same** value server-side in CRM and WACRM. Do not reuse the secret
   from the existing business.
11. Configure WACRM server values:

   ```text
   TRAVEL_CRM_BASE_URL=https://YOUR-CRM-DOMAIN
   CRM_ORIGIN=https://YOUR-CRM-DOMAIN
   WACRM_BRIDGE_SECRET=<unique shared secret for this CRM/WACRM pair>
   NEXT_PUBLIC_SITE_URL=https://YOUR-WACRM-DOMAIN
   ```

   Configure WACRM's Supabase Auth Site URL/redirects to its own domain.
12. Configure CRM's WACRM integration values server-side:

   ```text
   WACRM_SUPABASE_URL=<new WACRM Supabase URL>
   WACRM_SUPABASE_SERVICE_ROLE_KEY=<new WACRM service-role key>
   WACRM_ACCOUNT_ID=<new WACRM workspace/account UUID>
   WACRM_BRIDGE_SECRET=<same unique pair secret>
   ```

   Set `VITE_WACRM_APP_URL` to `https://YOUR-WACRM-DOMAIN` for the embedded
   WhatsApp workspace. If a CRM feature needs browser-side direct WACRM
   Supabase access, use the matching public client settings
   `VITE_WACRM_SUPABASE_URL` and `VITE_WACRM_SUPABASE_ANON_KEY` (or
   `VITE_WACRM_PUBLISHABLE_KEY` where supported), never a service-role key.
13. For CRM-to-WACRM flow completion, set WACRM's
    `TRAVEL_CRM_FLOW_SYNC_URL` to
    `https://YOUR-CRM-DOMAIN/api/wacrm/flow-completed`, and ensure the matching
    CRM/WACRM migration requirements in the root README are applied.
14. For CRM destination/flow actions, apply the required CRM and WACRM
    migrations listed in the root README. These features depend on the signed
    bridge, the correct paired URLs, and the same pair-specific secret.
15. If using automated flow timeouts/scheduled automations, set a strong
    `AUTOMATION_CRON_SECRET` in WACRM and schedule authenticated GET requests
    every few minutes to:

    ```text
    https://YOUR-WACRM-DOMAIN/api/automations/cron
    https://YOUR-WACRM-DOMAIN/api/flows/cron
    ```

    Send the secret in the `x-cron-secret` header. These endpoints return
    `401` without the correct header and `503` if the secret is missing.
16. For WhatsApp customer greetings sent from the CRM, create a WACRM API key
    with only the required `messages:send` scope and set these server-only
    CRM variables:

    ```text
    WACRM_API_KEY=<new WACRM API key>
    WACRM_GREETING_TEMPLATE_NAME=<approved Meta template name>
    WACRM_GREETING_TEMPLATE_LANGUAGE=en_US
    ```

    Use a Meta-approved template with the expected customer-name parameter.

WACRM documentation for its environment variables, Supabase schema, WhatsApp
Cloud API, auth email setup, and deployment:

- <https://wacrm.tech/docs/getting-started>
- <https://wacrm.tech/docs/supabase-setup>
- <https://wacrm.tech/docs/whatsapp-setup>
- <https://wacrm.tech/docs/environment-variables>
- <https://wacrm.tech/docs/deployment-hostinger>
- Repository documentation: `apps/wacrm/docs`

Do not reuse the old WACRM account ID, Meta phone-number ID, API key, webhook
secret, encryption key, or WhatsApp access token.

## Phase 7 — Test every enabled workflow before handover

Use only test customers and test provider accounts until checks pass.

### Core CRM

- Sign in, sign out, password reset, and role/permission checks work on the new
  domain.
- Create, search, update, assign, and move a test lead through the pipeline.
- Convert a test lead to an enquiry/customer; verify links are correct.
- Create a travel group and traveller; verify records belong only to the new
  business.
- Create/edit a quotation and its items; verify totals and PDF/document output.
- Create/edit an itinerary; test days, stays, transport, activities, costs,
  package options, images, sharing/export, and AI generation if configured.
- Convert the test flow to a booking; verify booking items, travellers,
  documents, status, and itinerary links.
- Test a payment and receivable/invoice workflow with test values only; verify
  totals and reports.
- Test supplier bills/expenses, tasks/follow-ups, communications, search, and
  reports.
- Upload/download a test document and verify storage access/RLS. If OCR is
  enabled, test a non-sensitive sample document.

### WhatsApp (only if enabled)

- Connect the new WABA/phone number in WACRM; confirm the displayed account and
  phone number belong to the new business.
- Verify Meta webhook handshake and inbound message delivery.
- Send a test reply and approved template; confirm delivery/status webhooks.
- Test contact matching in both directions, and confirm a same-name test
  contact is not incorrectly linked.
- Test the CRM embedded WACRM screen and signed bridge authentication.
- Test customer greeting only with consent and a test number.
- Test each enabled flow/automation, retries, cron auth, and completed-flow
  sync into the CRM.

### Go-live checks

- Confirm Vercel Production is serving the new domain and new repository.
- Confirm Vercel environment variables reference only the new project.
- Confirm Supabase Auth URLs, policies, storage, edge functions, and schedules
  are configured for the new project.
- Confirm no production records/accounts are present in the new database.
- Configure automated database backups and document who can restore them.
- Give the business owner access to its own Vercel, Supabase, GitHub, domain,
  Meta, email, and provider accounts.

## Ports and deploys: quick reference

```text
Main CRM local:  bun run dev -- --host 127.0.0.1 --port 5173 --strictPort
Main CRM URL:    http://localhost:5173
WACRM local:     Set-Location "C:\path\to\wacrm-app-root"; npm install; npm run dev
WACRM URL:       http://localhost:3000
OCR local:       cd ocr-service; docker compose up --build
OCR URL:         http://localhost:8001
Production:      HTTPS domain(s); no localhost ports
```

Deploy the root app and WACRM as separate Vercel projects. For this WACRM
checkout, the Vercel Root Directory must point at the inner `wacrm-main`
directory (the one containing its `package.json`). OCR is separately hosted as
a protected HTTPS service if that optional feature is required.

## Ready-to-paste VS Code task prompt

After opening the **new private copy** in VS Code, paste this prompt into your
coding agent. Do not give the agent production secrets:

> This is a fresh client copy of the Travel CRM. Preserve the existing
> production app and data. First inspect the repository and this
> `NEW-BUSINESS-SETUP-GUIDE.md`; report the exact commit/source, app roots,
> package managers, local ports, required and optional environment variables,
> migration folders, and integrations. Do not run SQL, Supabase CLI commands,
> deployments, migrations, destructive commands, or modify environment files.
> Do not copy production data or credentials. Identify what is missing to
> bootstrap a clean CRM Supabase database, including RLS, functions, triggers,
> extensions, storage policies, and reference data. Produce a checklist and
> ask me before any code, schema, or deployment changes. Keep CRM and WACRM
> databases separate. Never put secrets in `VITE_` variables or source control.

This guide is intentionally cautious about the database baseline: until an
administrator validates a complete schema-only bootstrap on a new project,
the clone is not ready for customer data or production use.
