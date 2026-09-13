# Image reference audit

> **Remediation status — 12 September 2026:** All 55 source images listed in the immediate and medium-resemblance groups have been replaced. The responsive image library was regenerated and the production build passed. This document remains as the record of the original findings; see `IMAGE_REFERENCE_REMEDIATION.md` for the completed replacement log.

Audit date: 12 September 2026

## What was checked

- 69 files in `Downloads\sk`, reduced to 66 unique images after exact duplicates were removed.
- 59 files in `Downloads\photo`.
- The original files in `client/public/veylo`, their responsive WebP copies, and every current reference to them in the site code.
- Facial appearance, pose, clothing, props, furniture, background, lighting, crop, and overall composition.

This is a visual similarity review. It identifies images that should be replaced before publication; it is not a legal ruling on copyright or personality rights.

## Conclusion

Yes. Several images currently shown on the site still look recognisably connected to their reference photographs. Changing the face or clothing did not make the strongest examples visually independent because the pose, prop, furniture, background, light, and framing were retained together.

The clearest action is to replace every item in the high-resemblance table. The medium-resemblance group should receive another generation from a written brief without supplying the original photograph.

## Immediate replacement

| Live image or set | Reference | What remains recognisable | Where it appears |
| --- | --- | --- | --- |
| `hero/story.jpeg` | The hands-towards-camera references in `photo` | The close hands framing the subject remain distinctive. The live image also contains a visible `GinthPhotography` watermark. | Homepage rotating hero, Photo Story scene |
| `show/sharon-1.jpeg` to `show/sharon-4.jpeg`, plus `pv-shay.jpeg` | `Shay.jpg` | Same plywood wall, oversized black leather coat, formal shirt, short bob, framing, and closely related poses. | Homepage Photo Reveal section, Formats page, Photo Reveal demo, Portfolio, Birthday page gallery |
| `ada/ada-1.jpg` to `ada/ada-5.jpg`, plus `pv-red-phone.jpeg` | `Jasmine Tookes Harper's Bazaar Kazakhstan Enrique Vega Cover Editorial.jpg` | Same red telephone, red chair, crossed-leg poses, glasses, wall shadows, and fashion setup. | Homepage Editorial section, Formats page, Editorial demo, Portfolio, Commercial page |
| `lora/lora-1.jpeg` to `lora/lora-6.jpeg` | `Birthday photoshoot ideas.jpg` and `Birthday Photoshoot inspiration.jpg` | Same orange studio, green ruffled dress, red rose or small prop, body positions, and portrait framing. | Homepage Photo Story section, Formats page, Lora Photo Story, Portfolio, Birthday page |
| `look/look-1.jpeg` to `look/look-4.jpeg` and `look/review-1.jpeg` to `look/review-4.jpeg` | `BNW Aesthetic.jpg` | Same Bantu-knot hair, shirt, tie, dark jacket, instant camera, black-and-white treatment, and model styling. | Homepage pre-flight review and Client Experience page |
| `hero/editorial.jpeg` | `I'm kind of late to the #worldphotographyday….jpg` | Same chair, crossed-leg seated pose, circular studio light, camera angle, and empty space around the subject. | Homepage rotating hero, Editorial scene |
| `hero/canvas.jpeg` | `351912465961186.jpg` | Same walking profile, arm position, full-body crop, and studio arrangement. | Homepage rotating hero, Canvas scene |
| `audience/commercial-media.jpeg` | `I've been working on something absolutely INSANE….jpg` | Same seated newspaper concept, surrounding loose pages, front-facing framing, and chair placement. | Homepage Commercial card and Commercial page hero |
| `pv-espresso.jpeg` | `CEO energy loaded_ …Something big is coming for….jpg` | Same drink-to-mouth gesture, suit styling, hand placement, wall, and crop. | Birthday page gallery |
| `pv-soft.jpeg` | `Afro Inspo from Small to Huge.jpg` | Same large afro silhouette, shoulder angle, head direction, lighting, and close crop. | Homepage Portfolio preview and Portfolio page |
| `pv-luxury.jpeg` | `Birthday Photoshoot inspiration.jpg` | Same seated floor pose, long dress spreading across the floor, warm studio background, and camera position. | Homepage Wedding Studios card |
| `pv-ghana.jpeg` | `Work done for @kiki_celinee #ghanaportraits….jpg` | Same seated pose, loose jeans, white studio, hand position, and full-body framing. | Portrait Photographers page |
| `pv-green-portrait.jpeg` | `123215739807957734.jpg` | Same formal portrait construction, body angle, hand placement, painted studio background, and crop. | Signup page and Commercial page gallery |
| `pv-male-portrait.jpeg` | `by @sage_east Lighting director_ @dinbaedin Photo….jpg` | Same seated profile, hand against the face, chair, dark green lighting, and tight crop. | Homepage Portfolio preview and Portfolio page |
| `pv-brand.jpeg` | `Birthday blessings @nenye_nwa10….jpg` | Same seated position, round brown seat, warm background, body angle, and hand placement. | Commercial page recommended-format preview |
| `pv-motion.jpeg` | `MOTION_ @timberland…jpg` | Same covered-head styling, hand gesture, seated angle, mirror or circular prop, and fashion framing. | Commercial page recommended-format preview |
| `pv-reaching.jpeg` and `sunshine.jpeg` | `Sunshine mixed with a little hurricane….jpg` | Same hand reaching towards the lens, wide-angle perspective, white background, and body direction. | Portrait Photographers page |
| `pv-photographer.jpeg` | `961377851726359880.jpg` | Same photographer-on-stool setup, camera pose, circular studio light, and full-body composition. | About page and Sign-in page |

## Medium resemblance: regenerate before relying on them

| Live image or set | Closest reference relationship | Where it appears |
| --- | --- | --- |
| `courage/courage-1.jpeg` to `courage/courage-6.jpeg` | The graduation references, especially `Congratulations…jpg` and `35747390788593286.jpg`. The first image retains the crossed-arm graduation pose and gown structure; later images vary the pose more. | Homepage Canvas section, Formats page, Canvas demo, Portfolio |
| `hero/reveal.jpeg` | `Ideias de penteados.jpg` | Similar close shoulder portrait, head turn, and framing, although hair, clothing, and background changed. | Homepage rotating hero |
| `hero/chapters.jpeg` | `Birthday Photoshoot inspiration.jpg` | Similar floor-level studio composition and crouched or seated pose, with a changed person and outfit. | Homepage rotating hero |
| `audience/portrait-photographers.jpeg` | `“Wishing an incredible Happy Birthday to our….jpg` | Similar close studio portrait, blazer-led styling, lighting, and framing. | Homepage Portraits card |
| `audience/birthday-shoots.jpeg` | `CEO energy loaded…jpg` | Similar formal portrait with a glass and a closely cropped studio composition. | Homepage Birthdays card |
| `niche/camera-portrait.jpeg` | `#polaroid #photoshootideas.jpg` | The camera-over-one-eye pose remains, although the person, clothing, background, and camera changed. | Portrait Photographers page recommended-format preview |
| `niche/blue-expression.jpeg` | The close blazer portraits in `photo` | Similar face-forward beauty crop, glasses, strong colour block, and studio lighting. | Birthday Shoots page hero |
| `sam/sam.jpeg` | `26810560282387191.jpg` | Same low chair, dark studio, low camera angle, and seated male portrait setup; the body pose and clothing changed. | Homepage “Every delivery includes” section |
| `pv-white-fashion.jpeg` | `Me for @ktbyknix Feb Swim 24”…jpg` | Similar hands-to-face expression and tight portrait construction; styling and background changed. | Commercial page gallery |
| `pv-striking.jpeg` | `Striking pose, Timeless impression….jpg` | The face and styling are changed, but the polished close portrait and hand-led posing still feel related. | Portrait and Birthday pages |

## Lower resemblance in this comparison

These live groups do not look like straightforward copies of anything in `photo`: the Folake and Tunde wedding set, the Adeyemi family Album set, `charm.jpeg`, `smile.jpeg`, `pv-marvis.jpeg`, `pv-bnw.jpeg`, and `pv-casual.jpeg`. They share common studio-photography ideas, but I did not find the same combination of person, pose, clothing, prop, background, and crop in the supplied reference folder.

Low resemblance does not establish ownership. If the reference photographs are unlicensed, the cleanest long-term approach is to replace the live library with images generated from written briefs or photographs that Veylo owns or has permission to use.

## File tracing result

Of the 66 unique files in `sk`, 63 have a matching copy or re-encoded version inside `client/public/veylo`. Responsive WebP conversion does not change the underlying composition. Many of those public files are currently referenced by the homepage, live format demos, Portfolio, Client Experience, audience pages, About, Signup, or Sign-in.

Three exact duplicates were also found in `sk`:

- `Sharon_Adeleke-4.jpg` duplicates `create_another_varition_of_this_2K_202609071107.jpeg`.
- `Stepping_into_the_spotlight_is_202609051645.jpeg` duplicates `st.jpeg`.
- `Sunshine_mixed_with_a_little_202609051645.jpeg` duplicates `sunshine.jpeg`.

## Recommended replacement order

1. Replace `hero/story.jpeg` first because the watermark is visible on the homepage.
2. Replace the Sharon, Ada, Lora, and black-and-white Polaroid sets. These repeat across several prominent pages and demos.
3. Replace the three close homepage hero derivatives: Editorial, Canvas, and Chapters.
4. Replace the Commercial newspaper image and the individual portfolio and audience images listed as high resemblance.
5. Regenerate the medium group from written briefs only.
6. Re-run this comparison before publishing the replacement library.
