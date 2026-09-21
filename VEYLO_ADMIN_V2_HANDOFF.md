# Veylo Admin V2 handoff

The 15-stage admin plan is complete. `VEYLO_ADMIN_V2_PROGRESS.md` is the short audit trail; this note is the practical handoff for the next deploy and review.

## What is live in the codebase

- The admin workspace has separate views for operations, accounts, deliveries, AI jobs, client access, volume jobs, storage, music and narration, billing, portfolios, support, configuration, product analytics, and security.
- Superadmins can permanently delete a photographer account from its account workspace after entering a reason and typing `DELETE`. The guarded route cancels active Paystack subscriptions when configured, removes Veylo-hosted media and account-owned records, revokes access through deletion, and keeps immutable admin audit evidence. Administrator accounts cannot be removed from the photographer workspace.
- Product analytics is optional and consent-gated. The client sends meaningful outcomes in small batches to `POST /api/v1/analytics/events`; the server allowlist currently contains 166 event names.
- Session identifiers are HMAC-digested before persistence. Passwords, PINs, tokens, contact details, private briefs, client/studio names, captions, filenames, photograph pixels, audio, messages, and keystrokes are removed from metadata recursively.
- The Product analytics tab is limited to superadmin, operations, analyst, and read-only admin roles. It reports journey checkpoints, format use, source/campaign/referrer labels, devices, failures, and the full event catalogue without exposing private content.
- The retention worker removes product analytics after the configured window (365 days by default). Superadmins can change that window in Configuration, from 30 to 3,650 days.
- Privacy copy and the cookie settings dialog describe the optional measurement choice. Existing visitors with the older notice are shown the new choice again.

## Deploy checklist

1. Deploy the API, client, and admin builds from the same commit. Confirm `/health` returns `healthy`.
2. Set `CLIENT_URL`, `ADMIN_URL`, `ALLOWED_ORIGINS`, `MONGODB_URI`, `JWT_SECRET`, `OTP_SECRET`, and provider secrets in the API environment. Never put provider secrets in either browser build.
3. Sign in as a superadmin, open Configuration, confirm Optional analytics is enabled only if the published privacy notice and consent flow are approved, and confirm the analytics retention value.
4. Open Cookie settings in a clean browser profile. Check that “Only necessary” produces no analytics request and “Allow product analytics” permits events after the choice is saved.
5. Open Product analytics in the admin workspace. Confirm a consent event, a page view, and a safe test action appear; confirm a failed API request appears in the failure panel without any private field.
6. Run the smoke and regression checks from `server`, `client`, and `admin` after deployment. For the database-backed creation/publishing path, provide a disposable verified session through `SMOKE_ACCESS_TOKEN` and remove it after the test.

## Verification commands

```text
server: npm run verify:analytics
server: npm run verify:security
server: npm run verify:delivery-v2
server: npm run verify:soundtracks
server: SMOKE_BASE_URL=https://<api-host> npm run verify:smoke
client: npm run verify:responsive
client: npm run verify:share-meta
client: npm run build
admin: npm run build
```

The smoke script deliberately reports the database-backed ownership flow as skipped when no disposable session is supplied. That is an external environment requirement, not a reason to fabricate a passing result.
