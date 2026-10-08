# Veylo Assistant

The launcher says **Ask Veylo**. Delivery creators and the Portfolio editor use an inline entry so the launcher does not cover their controls.

## Page and account context

The browser records explicit page and workflow facts in memory for the current tab: the open draft and step, photo count, upload progress and failures, unsaved changes, preview state, and recent navigation or workflow events. It retains at most 20 events for 30 minutes. Refreshing the page or changing the signed-in account resets this activity.

Automatic context excludes typed fields, file names, media URLs, passwords, access codes and payment details. The server validates the entire context against a strict whitelist and rejects stale snapshots. Browser facts are labelled as reported activity; ownership, saved delivery requirements, quota, storage and billing come from authenticated server lookups.

The context row shows the current page or step. Users can inspect recent activity, clear it, or turn page context off. These controls affect automatic context; questions and explicit writing instructions still go to the assistant. Turning context off does not disable authenticated account questions. Recipient conversations never fetch studio account data.

## Practical tasks

- **Account and drafts** checks account usage and opens up to five recent owned drafts. It can be refreshed explicitly.
- **Check delivery** evaluates saved publishing requirements and reports unsaved changes or uploads separately. Preview approval and publishing remain in the existing delivery flow.
- **Writing help** prepares a delivery title, selected PhotoSwap or Showcase caption, Portfolio introduction, or a WhatsApp message for a published delivery. It uses saved text and the photographer's instruction, without sending the photograph or private client name.
- **Apply to draft form** requires confirmation. The server verifies a signed, ten-minute proposal, ownership, current access and the saved revision again. The client changes only the selected field in the matching open form. Delivery forms still need their normal save; Portfolio uses its existing private draft autosave. Applying a suggestion does not publish anything.
- **Copy message and link** copies a published delivery message and its verified relative client link. It does not send a message.
- **Prepare support request** fills a reviewable support form with safe page and activity facts. The user submits it through the normal support form.

## Maintenance and checks

`client/src/utils/assistantContext.mjs` and `server/src/constants/assistantContext.mjs` contain the same contract. Keep both copies identical because client and server deploy from separate roots; the workspace tests check this.

Pages register facts and field callbacks through `useAssistantWorkflow`. Keep callbacks narrow and preserve all other form fields. Add new page, step or event names to both contract copies and the corresponding tests. Never pass arbitrary analytics metadata or form contents as automatic context.

Validation commands:

```sh
cd server
npm run verify:assistant
cd ../client
npx playwright test tests/assistant-chat.spec.js tests/assistant-workspace.spec.js
npm run build
cd ../admin
npm run build
```

Automated provider and account tests use fixtures. A deployed smoke check with an owned draft and the configured writing provider is still needed to verify the live integration.
