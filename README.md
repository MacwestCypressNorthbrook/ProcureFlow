This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Scheduled jobs (required)

ProcureFlow has **one** cron endpoint. Everything time-based runs off it, so if it is not
scheduled, reminders and every bundled email silently stop — no error surfaces in the UI.

```bash
curl -X POST 'https://<your-domain>/api/reminders/send' \
  -H 'Authorization: Bearer <CRON_SECRET>'
```

| | |
|---|---|
| **Method** | `POST` only — a `GET` returns 405 |
| **Auth** | `Authorization: Bearer $CRON_SECRET`. Missing/blank `CRON_SECRET` on the server → **503** (fails closed); wrong value → **401** |
| **Interval** | **Every 5 minutes** (`*/5 * * * *`) — the app itself decides which ticks do work; see below |
| **Job timezone** | `Africa/Accra`, so the weekly digest lands on the intended weekday |

Scheduled externally (cron-job.org, GitHub Actions, Vercel Cron — anything that can POST with a
header). `CRON_SECRET` must be set in the deployment's environment, not just `.env.local`.

### What one run does

1. **Due reminders** — emails + in-app alerts for anything a requester nudged, or that is overdue.
2. **Project Lead weekly digest** — one email listing everything awaiting Lead review. No-ops on
   every day except the configured one (default Thursday, changeable in *Admin → Workspace
   Preferences*), and at most once per day. Engineers' submissions are deliberately **not** emailed
   to the Lead individually; this digest replaces that.
3. **Stage digests** — when a reviewer approves requisitions, the next stage's email is bundled
   rather than sent per item. A batch goes out once no new approval has landed for 10 minutes, or
   30 minutes after the first one, whichever comes first. Covers Lead→Supply Chain,
   Supply Chain→Admin, Admin→Cost Control, Cost Control→Finance. Only approved items are included,
   and each is re-checked as still sitting at that stage before it goes in.
4. **Housekeeping** — prunes expired rate-limit rows.

In-app notifications are always immediate and are unaffected by this cron. Send-backs and
rejections are also emailed immediately — only forward approvals are bundled.

### Why the interval matters

A batch is sent on the first run *after* its 10-minute quiet period elapses, so the cron interval
is added to the delay. Anything slower than every 15 minutes makes the handoff feel broken.

### Not every tick does work (database compute)

Neon bills compute for every minute the database is awake and suspends it only after ~5 idle
minutes, so a query every 5 minutes keeps it awake 24/7 — ~730 hours a month with nobody using the
app. That exhausted the plan quota once (every query then fails with HTTP 402 and the whole app,
sign-in included, goes down).

So the database should only wake when there is real work. Two things make that happen:

1. **Active users carry the work.** Whenever someone's notification bell polls (every minute,
   only while they are active), the same request runs the dispatcher afterwards (`after()`), at
   most once per 2 minutes. The database is awake for them anyway, so this costs nothing extra.
   A lease row in `app_settings` (`dispatch_lease`) stops two instances sending the same batch.
2. **The cron only fills the gaps.** The scheduler keeps firing `*/5`, but `src/lib/cron-window.ts`
   lets through only:

| When (Accra) | Cron runs | Covers |
|---|---|---|
| Mon–Fri 07:00–19:00 | every 30 min | a reviewer who approved a batch and closed the tab at once |
| Nights and weekends | every 3 hours | overnight reminders/digests (also sent when the first person opens the app) |

Skipped ticks return `{ "success": true, "skipped": true }` without touching the database. Add
`?force=1` to the URL to bypass the schedule (manual dispatch, testing).

The bell stops polling after 12 minutes with no click, key or scroll, so a tab left open overnight
lets the database sleep.

### Related environment variables

`CRON_SECRET` (required) · `NEXT_PUBLIC_APP_URL` (required — builds the links inside emails) ·
`RESEND_API_KEY` **or** `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` (without one, sends are
logged and dropped) · `EMAIL_FROM`.

### Verifying it works

Enable response history in your scheduler. Each run returns a summary you can read directly:

```json
{ "success": true, "processed": 0, "leadDigest": { "sent": 0, "reason": "not the configured day" }, "stageDigests": { "supply_chain": 1 } }
```

`reason` explains a zero-send digest (`digest disabled`, `not the configured day`,
`already sent today`, `no requisitions waiting`). A `503` means `CRON_SECRET` is unset on the
server; a `401` means the header does not match it.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
