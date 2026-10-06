# HaBoneh admin console

Server-rendered back office for the product owner. Node 20 + Express, talks to
Supabase with the **service-role key**, gated by one shared password (HTTP
Basic). Hebrew RTL. No client JS, no build step.

## What it does (day-one product-ops needs)

| Screen | Answers | Actions |
|---|---|---|
| סקירה | who signed up (total / 7d), projects, active pro seats, paying users, FM counter, open deletion requests | — |
| משתמשים | every account: phone (masked), role family / pro, Pro flag, subscription, banned? | **ban / unban**, **grant / revoke Pro**, **delete account** |
| תשלומים | `pro_subscriptions` + founding-member purchases + the FM counter the app shows | **comp a Pro period** (30 / 90 / 365 days) |
| פרויקטים | each project's members and pro seats | **add a partner seat**, **add a pro seat (full / scoped)**, **revoke a pro seat** |
| הזמנות | pending partner + pro invites | — |
| יומן אדמין | every admin action, newest first | — |

Phone numbers are masked on purpose; the console is for operations, not for
browsing PII.

## Deploy (Render, free plan)

The repo root carries a `render.yaml` blueprint that declares this service
(`rootDir: admin-console`) and the static landing site. In Render:
**New → Blueprint → this repo**. Then set the three secrets on the service:

| Env | Value |
|---|---|
| `SUPABASE_URL` | `https://bfuvdoeaoispektxfqid.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` |
| `ADMIN_PASSWORD` | a long random string; share it only with people who may delete users |

Free web services sleep after 15 min idle; the first request takes ~30 s.

## One-time SQL (audit table)

```sql
create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb
);
alter table public.admin_actions enable row level security;
-- no policies on purpose: only the service role (this console) reads/writes it.
```

## Local run

```bash
cd admin-console && npm install
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ADMIN_PASSWORD=dev npm start
open http://localhost:3000   # user: anything, password: dev
```

## Deliberately NOT here (yet)

- Editing a family's budget / documents / defects — the app is the place for
  that, and admin edits would bypass the trust-feedback layer.
- Sending pushes or SMS from the console.
- Anything that reads message content (chat, comments).
