# Veylo uptime monitor

This separate Cloudflare Worker checks the Render API and public website once per minute. It sends an outage email after three consecutive failed checks and a recovery email after two successes. It uses the existing Resend provider directly, so alert delivery does not depend on Render or MongoDB being available.

The website check fetches HTML and verifies its first same-origin `/assets/` JavaScript bundle. The API check requires `/ready` to return a successful response with `status: "ready"`. These checks do not sign in, open private deliveries or complete downloads in a browser.

A single SQLite-backed Durable Object stores bounded failure counters, incident state and pending email metadata across restarts. Duplicate schedule events are ignored. Email retries use the same payload and idempotency key; rejected sends are retried on later checks for up to 23 hours. After that, `monitor.notification.expired` is logged rather than risking a duplicate after Resend's 24-hour idempotency window. An unsent outage notification is cancelled after observed recovery. Provider acceptance is not proof of inbox delivery.

## Setup

1. Generate one independent random secret (at least 32 characters) and save it as `OPS_MONITOR_SECRET` in the Render API's environment. Restart/deploy the API to apply it. Keep the value private; do not paste it into chat or commit it.
2. Create a Cloudflare Worker connected to this repository, named `veylo-uptime-monitor`, using the `main` branch and repository root. No application build command is needed. Set the deploy command to:

   ```text
   npx wrangler deploy --config cloudflare/uptime-monitor/wrangler.toml
   ```

   Alternatively, from an authenticated local Wrangler installation, run that command from the repository root.

3. In the new Worker's **Settings → Variables and Secrets**, add the following runtime secrets, then apply/deploy the settings:

   | Name | Value |
   | --- | --- |
   | `OPS_MONITOR_SECRET` | Exactly the same new secret saved on Render |
   | `OPS_ALERT_EMAIL` | Your tested operations alert inbox |
   | `RESEND_API_KEY` | Your existing email-provider key |
   | `RESEND_FROM_EMAIL` | The verified sender already used by the API |

   The API and website addresses are configured in `wrangler.toml`. Change them there if the production origins change. No secret belongs in that file. This independent monitor's recipient must be updated separately if you change the alert address in Veylo admin.

4. Confirm the `* * * * *` Cron Trigger and `UPTIME_MONITOR` Durable Object binding appear. Initial Cron Trigger changes can take up to 15 minutes to propagate. The first deployments may log missing configuration until all four secrets have been saved.
5. In **Veylo admin → Operations**, confirm the API and public website checks have recent timestamps and show **Passing**. The API rejects unauthenticated, stale or replayed check-ins. A report becomes stale after three minutes without another accepted report.
6. Inspect the Worker's logs for `monitor.check` and check-in/email failures. The Worker deliberately has no public URL or HTTP trigger for sending alerts. Do not take production offline just to test; outage, recovery, restart and rejection paths are covered by local fixtures. A full live outage/recovery acceptance test should use a separate test deployment and test recipient.

Cloudflare account access is required to deploy. No monitor is deployed just by adding this directory to the repository. This monitor is independent of Render but shares Cloudflare with the public website; it cannot reliably alert during a complete Cloudflare outage. Use an additional monitor on another provider if provider-wide coverage is required.

## Validation

```powershell
node --test cloudflare/uptime-monitor/monitor.test.mjs
npx wrangler deploy --dry-run --config cloudflare/uptime-monitor/wrangler.toml
```

No live emails or production state changes are made by these checks.

References: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
