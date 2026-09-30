# Studio or Brand names

Each account has one Studio or Brand name. Names keep their displayed capitalisation and punctuation, but ownership uses a private `studioNameKey`: Unicode NFKC normalisation, trimmed and collapsed whitespace, then lowercase. `Amara Studios`, `AMARA STUDIOS`, and ` Amara  Studios ` belong to the same name. Names use 2–100 visible characters. Invisible formatting and control characters are rejected.

Onboarding and Account settings use the same authenticated, account-rate-limited availability endpoint. Availability is feedback rather than a reservation. The unique MongoDB index decides who owns a name if two saves arrive together. Both save endpoints return HTTP 409 with `STUDIO_NAME_TAKEN` and `field: studioName` for a collision. Query updates through the User model also maintain the ownership key. Portfolio edits use the account name and cannot set a separate brand name.

The existing 30-day rename cooldown remains in place. A successful rename releases the old name. An account may keep its current name while changing other profile details. Availability responses contain no owner IDs, emails, or profile information and are not cached.

## Existing accounts and deployment

From `server`, with `MONGODB_URI` configured:

```sh
npm run studio-names:audit
```

This command only reads. It reports the number of named accounts, keys needing backfill, and duplicate groups with account IDs. Treat its output as internal account data. It does not pick a winner or rename anyone.

Resolve any duplicate groups with the affected account owners before rollout. Do not invent replacement names or delete accounts to make the migration pass. Pause profile and onboarding writes on older server instances while deploying; those versions do not maintain the ownership key.

```sh
npm run studio-names:migrate
```

This backfills private ownership keys and creates the unique partial index `studio_name_unique`. Accounts without a name can still register. Server startup runs the same preparation before accepting requests, so a database without duplicates is prepared automatically. Re-running preparation is safe. If duplicates or database errors prevent preparation, the server keeps running but availability and name-save endpoints return HTTP 503. They cannot save an unchecked name. Other account and delivery routes stay available.

The implementation deliberately creates this index after the audit rather than through Mongoose auto-indexing. The constraint uses MongoDB’s [unique partial index behaviour](https://www.mongodb.com/docs/manual/core/index-partial/).

## Verification

`npm run verify:studio-names` uses an isolated in-memory MongoDB, covering migration conflicts, existing names, simultaneous claims across the two save endpoints, query updates, cooldowns, and owner exclusions. `npx playwright test tests/studio-workspace.spec.js` in `client` covers all three screens, availability failures, stale responses, save conflicts, logo uploads, and phone/tablet/desktop layouts. Review screenshots are written under `.visual-review/studio-workspace`.
