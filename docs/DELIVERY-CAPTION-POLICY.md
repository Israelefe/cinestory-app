# Delivery captions and headlines

V3 Showcase copy is a message to the recipient about the photographer's stated purpose. It must not introduce the recipient to themselves or describe their wardrobe and props back to them.

## Sources and voice

- The purpose and client name supply identities and occasion facts. Names and ages must remain as supplied. Shoot type provides light context.
- Full image observations stay with selection, colour analysis and grouping. Writing receives only an optional visible smile or laugh. A cue does not establish emotions, personality, achievements, relationships or attendance.
- Personal formats address the recipient directly. Event Coverage can address the people celebrating. Campaign copy communicates the supplied commercial purpose.
- A birthday purpose alone does not establish a party, friends attending, candles, cake or a location.
- Headlines and captions form one message. Both do not need to repeat a name or birthday word. The message must remain tied to the purpose, with meaningful headlines and varied thoughts.

## Generation and review

Initial generation, regeneration and photo replacement use the same writing policy. A separate model request reviews the drafts against the purpose, recipient, facts and text limits. Rejected descriptive or unrelated wording is omitted from rewrite inputs. A second review is attempted when the result still fails the checks or repeats wording.

Regeneration receives existing valid messages and the photographer's current unsaved words to avoid repeating them. These are not sources of new facts. Old clients can still submit the earlier request shape. Input sizes are validated, and existing overlong text is bounded when sent from the editor.

The checks cover photo descriptions, third-person personal captions, unsupported names and numbers, unsupported gathering claims, repeated copy and text lengths. They do not prove every generated sentence correct; photographers still review and can edit the words before publishing.

Photo Story keeps its six-second photo timing and written captions. Captions remain at most 150 characters; other formats use at most 180. Bookends have their own limits and use complete fallback messages when a generated thought is oversized, rather than cutting it mid-sentence.

Regeneration has a 45-second total provider budget, including retries and reviews, below the browser's 60-second timeout. A slow review may retain an already checked draft. A first-pass timeout returns a clear retry response while the editor retains its current photo and words. Initial preparation continues through the existing background job.

Existing published deliveries are not rewritten. The new policy applies when generating or regenerating words after deployment.

## Verification

- Regression cases include all nine descriptive birthday captions reported by the photographer.
- All eight Showcase formats exercise initial writing, review and regeneration.
- Checks cover replacing a photo without changing the client's name, birthday ages written as digits or words, duplicate drafts, unsaved text, timeout recovery and complete bookends.
- Browser checks cover the photo picker and failed regeneration retaining the existing photo and words at 320, 768, 834 and 1440 pixels.
- Actual Model Studio responses were inspected using sample purposes and photo summaries, without changing deliveries or uploading photographs.
