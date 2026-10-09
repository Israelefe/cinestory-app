# Human support, refund reviews and cPanel mail

This change leaves Content Studio outside the work. It connects the customer support page, Veylo Assistant, the admin support inbox and the existing Paystack billing ledger.

Existing support tickets are assigned a general or billing mailbox automatically. Their messages and original timestamps are preserved.

## Customer support

- `/contact` creates a human support request. Signed-in customers use their account identity; guests provide a reply address and receive a reference, without access to account conversations.
- `/contact?tab=inbox` lists the signed-in customer's conversations. `/contact?ticket=…` opens an owned conversation. Customers can reply, attach screenshots and follow a refund review.
- Support automatically collects the verified account plan and paid-through date, browser/device family and approved Assistant workflow facts. Customers can exclude diagnostics. Optional fields collect the expected result, when it started, a delivery reference and screenshots. Payment references are checked against the signed-in account.
- Veylo Assistant has visible human-support and inbox controls. It suggests escalation when a fix fails or it cannot establish an answer. It prepares an editable message from the customer's recent questions. The customer reviews it and presses **Send to a person**. A model answer never creates a ticket or claims a message was sent. Success shows the persisted reference and conversation link.
- Private photo URLs, passwords, access codes and arbitrary typed form fields are excluded from automatic context. Screenshots are authenticated, limited, decoded and converted to WebP with metadata removed; downloads require ownership or the appropriate admin role.

## Refund policy coverage

| Policy condition | Evidence or action in admin |
| --- | --- |
| Seven days from the first Pro payment | First successful paid payment and the immutable request received time. A later staff review does not move the deadline. |
| No paid-period delivery, storage or Portfolio use | Retained activity by type and timestamp, plus existing service records. Deleting work does not erase the activity ledger. |
| Used periods and renewal payments | Payment history, subscription periods and first-payment status. Routine change-of-mind checks remain separate from exceptions. |
| Duplicate charge | Payment history and the original reference; finance records its investigation and a decision. |
| Charge after confirmed cancellation | Cancellation request, pending and provider-confirmed timestamps. Pending cancellation is not treated as confirmed. |
| Payment without Pro access | Paid-but-unfulfilled queue, existing verification/reconciliation and current entitlement evidence. |
| Material service failure | Customer conversation and manual review note; staff can compare the dates with Operations incidents. Usage does not automatically reject an exception. |
| Processing, failed or needs-attention refund | Provider status, safe provider recheck, customer email updates and a protected bank-details form when Paystack requests it. |
| Full or partial refund; separate renewal cancellation | Existing billing rules preserve newer valid access. Finance can request cancellation separately; an unconfirmed cancellation remains visible. |

Finance can request more information, decline, or approve a stated amount. Internal review notes and customer explanations are separate. No automatic eligibility decision sends money. Approvals use the existing per-account billing lock, balance reservation and provider reconciliation. An ambiguous provider response requires review instead of another submission.

Email senders are not authenticated Veylo users. A finance administrator must verify ownership outside the email claim, record how it was verified and link the exact payment reference. The verified account email must match. The review keeps the IMAP server's original received time, rather than the time staff imported or linked the message.

`PAID_USAGE_LEDGER_STARTED_AT` is an optional ISO timestamp marking when all usage hooks in this release were deployed. Leave it blank until that is true. Earlier periods always carry an incomplete-history warning; absence of records is not proof that a historical period was unused. Do not backdate it. Financial evidence follows the existing six-year restricted retention process after account deletion; customer conversations, screenshots and outbox records are removed.

## Mailbox configuration

The customer supplied these secure cPanel settings. They are separate mailboxes with separate credentials:

| Mailbox | Incoming IMAP host | Outgoing SMTP host | Ports |
| --- | --- | --- | --- |
| `info@veylo.com.ng` | `s4.whitelabelclouds.com` | `s4.whitelabelclouds.com` | IMAP 993; SMTP 465 |
| `payment@veylo.com.ng` | `mail.veylo.com.ng` | `mail.veylo.com.ng` | IMAP 993; SMTP 465 |

Copy the non-secret entries from `server/.env.example` into the API deployment environment. Set `SUPPORT_GENERAL_PASSWORD` and `SUPPORT_BILLING_PASSWORD` through the hosting provider's secret configuration, never in Git, browser settings, screenshots or chat. Restart the API after setting them. No calendar, contacts or POP3 configuration is required. The application verifies TLS certificates; do not disable certificate checking to make a hostname work.

Per-mailbox settings are `SUPPORT_GENERAL_IMAP_HOST`, `SUPPORT_GENERAL_SMTP_HOST`, `SUPPORT_GENERAL_USER`, `SUPPORT_GENERAL_PASSWORD` and the corresponding `SUPPORT_BILLING_*` entries. Secure ports default to 993 and 465; per-mailbox `*_IMAP_PORT` and `*_SMTP_PORT` can override shared ports. SMTP 587 requires STARTTLS. Optional `*_SENT_FOLDER` specifies the actual IMAP Sent path if the server does not advertise it.

After restart, open **Admin → Support inbox** and choose **Sync mail**. Check both mailboxes for a successful sync time. Then send a deliberate test request from an address you control, reply from admin and verify receipt and the Sent-folder copy. No live mailbox connection or real email send was performed during implementation because passwords were not supplied.

The API worker starts after 20 seconds and runs each minute. It imports INBOX in bounded batches, tracks UID validity and message identities, and uses a database lease across API instances. Initial backlog arrives over successive runs. It does not move or delete messages in cPanel. Existing Sent history and other folders are not imported. Replies sent from admin are copied to Sent when a Sent folder is available. General mail is restricted to operations/support/superadmin; raw billing email and financial actions are restricted to finance/superadmin.

Email HTML, remote images and tracking pixels are never rendered in admin. Long messages show a shortened-text notice. Email attachments, messages above 8 MB and unreadable messages require the original in cPanel webmail; skip counts are visible. These boundaries avoid ingesting arbitrary files into the application. In-app screenshot attachments are available directly in the support conversation.

## Delivery failures and recovery

Customer replies appear in the app immediately. Public staff replies enter a persistent email outbox; internal notes never do. **Sent** means the SMTP or email provider accepted the message, not that the customer's inbox received it. Failed delivery and Sent-copy failures are visible in the conversation. Resend is an optional fallback for sending when mailbox SMTP is unconfigured; it does not connect the cPanel inbox.

Known rejections retry with backoff. Timeouts or process interruptions after a possible SMTP send are marked **uncertain**. Staff must inspect mail history and confirm the message was not sent before retrying; this creates an audit entry. Do not repeatedly retry an uncertain email or refund to clear its warning.

Payments also expose failed webhook retries, unfulfilled successful payments, unresolved cancellations, refunds needing attention and disputes. Dispute submission remains in Paystack; Veylo does not claim to file or resolve a bank dispute.

## Validation

- Server: syntax check, billing regression/edge cases, Assistant privacy/workspace tests, Operations tests and `npm run verify:support`.
- Client: support inbox and Assistant Playwright suites, including draft review, real API submission, failed-AI escalation, ownership-safe guest behavior and 320/768/834/1440 pixel layouts.
- Admin: Operations and support/refund Playwright suites at the same widths, plus public replies versus internal notes.
- Both production frontend builds run their motion-policy checks. Device Reduce Motion does not suppress Veylo's configured motion.
- `npm audit --omit=dev` reports no known server production dependency vulnerabilities. Existing nodemon development-chain advisories remain outside the production dependency graph.

References: [cPanel mail client setup](https://docs.cpanel.net/cpanel/email/set-up-mail-client/), [Paystack refunds](https://paystack.com/docs/payments/refunds/), [IMAPFlow](https://imapflow.com/docs/api/imapflow-client/), [Nodemailer SMTP](https://nodemailer.com/smtp).
