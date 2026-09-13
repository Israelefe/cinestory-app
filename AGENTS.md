# AGENTS.md — Mandatory Rules for All AI Agents

> **CRITICAL DIRECTIVE**: This rule applies to every AI agent working on this codebase (including main agents, subagents, and automated workers). You MUST read and strictly adhere to these rules before writing any code, copy, documentation, or responses.

---

## 1. Think Deeply Before Writing Anything
- **No rushed or mindless writing.** You are prohibited from producing shallow, generic, robotic filler just to fill space.
- Before writing a single line of copy or code, think through:
  1. *Who is the real human reading or using this?* (e.g., A busy portrait photographer in Lagos who just finished retouching an all-day birthday session, or a client excited to open their photos on WhatsApp).
  2. *What is their actual real-world problem?* (e.g., Delivering photos through cold, awkward Drive or Dropbox links that nobody gets excited about; clients asking "are my pictures ready?").
  3. *Does this sentence make complete, practical sense in the real world?* If you cannot picture a real person saying it out loud, do not write it.

---

## 2. Strict Ban on AI Clichés, Buzzwords, and Corporate Fluff
Never use synthetic, generic AI filler. The following words, phrases, and stylistic habits are strictly banned:

- **Banned Buzzwords & Tropes:**
  - *"Elevate your workflow / journey"*
  - *"Unlock unparalleled potential / power / synergy"*
  - *"Seamlessly craft / curate / blend"*
  - *"Tapestry of memories / symphony of moments"*
  - *"Beacon of excellence / testament to art"*
  - *"Crescendo of emotions / emotional crescendo"*
  - *"Revolutionize your delivery"*
  - *"Dive into / Delve into"*
- **Banned Tone:**
  - Hyper-dramatic or theatrical prose that sounds like an over-caffeinated robot trying to write poetry.
  - Vague corporate SaaS jargon that says a lot of words without explaining what the product actually does.
- **Strict Ban on Sparkle Icons & "Magic AI" Tropes:**
  - Never use sparkle icons (such as `<Sparkles />` from icon libraries) or sparkle emojis (`✨`).
  - Veylo is a professional platform for real photographers and studios, not a gimmicky "magic wand" AI tool.
  - Always use real icons that directly represent what the thing actually is:
    - Tier / Plan status: `BadgeCheck` or `Crown`
    - Studio / Photographer: `Camera`
    - Story chapters & acts: `Film`
    - Directing & sequencing: `Clapperboard`
    - Photos & galleries: `Image`, `Folder`, `Check`
- **Strict Ban on Using Emojis as Icons:**
  - Never use emojis as UI icons, button graphics, or status symbols (e.g. 🎂, 💍, 👗, 🎬, 🎉, 🎵, ✨).
  - Emojis render inconsistently across operating systems and devices, look informal, and cheapen a professional platform.
  - You must always create or import real SVG icons (e.g. from `lucide-react` or handcrafted SVGs) that accurately and professionally represent the item.

---

## 3. Mandatory 95%+ Human-Sounding Copy (Zero AI-Sounding Text)
- **At Least 95% Human-Sounding:** Every heading, subtitle, button label, modal prompt, story caption, and paragraph across the entire platform must sound at least 95% human-written.
- **Speak like a real human being.** Speak plainly, directly, and with quiet confidence.
- Use words that real photographers and real clients actually use:
  - *"Your Photo Story is ready"* instead of *"Delivering an immersive visual narrative"*.
  - *"No more awkward Google Drive links"* instead of *"Eliminating client touchpoint friction"*.
  - *"Send a private link"* instead of *"Deploy a personalized client endpoint"*.
- If you read the copy out loud and it feels artificial, awkward, or like ChatGPT wrote it, **delete it immediately and rewrite it in plain English.**

---

## 4. 100% Logical Coherence & Real-World Sense
- Every sentence must make sense in reality.
- Check every technical and product claim against how the app actually works:
  - Do not claim AI is generating fake pixels when Veylo specifically preserves original photographs.
  - Veylo is strictly for final delivery of finished shoots. Do not describe it as a photo culling, proofing, or selection tool.
  - Do not make contradictory statements about quotas, pricing, or features.

---

## 5. Localized Nigerian Photography Context
Veylo is built Nigeria-first for photographers and media studios:
- Understand the real-world environment:
  - Clients receive links on WhatsApp or Instagram DMs.
  - Mobile-first experience is mandatory (fast loading on mobile networks).
  - Pricing is in Nigerian Naira (₦25,000/month for Pro, ₦0 for Free).
  - Authentic shoot categories: Traditional weddings, 30th birthday milestone shoots, bridal showers, lookbooks, owambe celebrations, studio portraits.
- Keep the tone respectful, sharp, and focused on helping photographers get paid and look professional.

---

## 6. Mandatory Multi-Device Responsiveness & Zero Jam-Packed Layouts
Every single page, component, viewer, and modal—whether created now or in the future by any agent—must be thoroughly designed and optimized for every screen size, looking 100% good, presentable, and spacious:
- **Strict Ban on Jam-Packed UI:** Things must NEVER be jampacked together in any way. Never crowd, crush, or squeeze controls, captions, buttons, and headers together. Maintain generous breathing room, intentional padding, and balanced visual separation.
- **Mobile Phones (320px – 640px)**: Fast, touch-friendly, readable without pinching, zero horizontal overflow, thumb-friendly tap targets, no overlapping or cramped elements.
- **Tablets (641px – 1024px, e.g. iPads portrait & landscape, 768px, 810px, 820px, 834px, 1024px)**:
  - Tablet MUST NOT be an afterthought or a stretched-out mobile view / crushed desktop view.
  - Grids must adapt intelligently (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/4`), never squishing cards into illegible widths or blowing up single cards to awkward 800px widths.
  - StoryViewer, modals, hero comparisons, pricing tables, drawer menus, and photo showcases must fit within tablet viewport heights without clipping or overlap.
  - Modals and drawers must respect tablet aspect ratios and avoid jumping or cut-off action buttons.
- **Laptops & Desktops (1025px+)**: Balanced container max-widths (`max-w-6xl`, `max-w-7xl`), generous breathing room, high-resolution media rendering.
- **Strict Breakpoint Discipline**:
  - Use Tailwind's standard breakpoints (`sm:`, `md:`, `lg:`, `xl:`) thoughtfully.
  - Never jump directly from mobile styles to `lg:` while ignoring `md:` (tablet). Test layout transitions across 768px and 834px explicitly.
  - Prevent horizontal scrollbars (`overflow-x-hidden` on outer wrappers, proper responsive padding `px-4 sm:px-6 md:px-8 lg:px-12`).

---

## 7. Strict Ban on AI Slop & Gimmicky UI — Premium, Bespoke, Human-Crafted Design Only
- **Zero AI Slop:** Every design, component, page, and layout must NEVER look like generic AI boilerplate, cheap templates, or robotic slop.
- **Strict Ban on Gimmicks & Distracting Novelties:** Interfaces must NEVER be filled with gimmicks. Prohibited gimmicks include:
  - Fake countdown timers, spinning novelty badges, or gamified tricks.
  - Gratuitous particle storms, glitter, or confetti that distract from original photographs.
  - Distracting bouncing or shaking elements that fight for attention.
  - Tacky pseudo-futuristic sci-fi widgets, holographic scanners, or "magic wand" tropes.
- **Quiet Confidence & Editorial Restraint:** Veylo is an elite showcase platform for professional wedding, portrait, and commercial photographers. Every button, badge, animation, and form must serve an authentic, practical purpose. The hero of the screen is always the client's photography, not gratuitous UI noise.
- Every page created must be amazing, 100% presentable, and well thought through:
  - **Color & Shading:** Intentional, high-contrast dark aesthetic with tailored ambient warmth (`#ff5a47`, `#ff9b8e`), deep rich backgrounds (`#070709`, `#0c0c10`), razor-thin subtle borders (`border-white/10`, `border-white/15`), and multi-layered radial lighting. No flat muddy gray boxes or lazy default templates.
  - **Form & Typography:** Editorial typography pairing crisp display headlines with legible, high-contrast UI body copy. Every input, card, badge, and modal must feel polished, purposeful, and distinctive.
  - **Visual Rhythm:** Balanced white space, clear focal points, and generous breathing room. Every element on the page must have a reason to exist.

---

## 8. Mind-Blowing Lightweight UI & Scroll Animations
Every single page and UI component must feature fluid, lightweight, 60fps animations that delight the user:
- **Scroll Animations:** When creating any UI, agents MUST apply lightweight animations either to the scrolling of the UI (smooth scroll reveals, fade-ups, staggered arrivals `whileInView`, `viewport={{ once: true, amount: 0.15 }}`) or to UI elements.
- **Micro-Interactions & Feedback:** Every button, tab, card, and interactive element must respond with satisfying tactile feedback:
  - Subtle hover lifts (`hover:-translate-y-0.5`, `hover:scale-[1.02]`)
  - Crisp active press states (`active:scale-95`)
  - Smooth spring physics for drawers, dropdowns, and modals (`type: 'spring', damping: 25, stiffness: 280`)
  - Ambient breathing glows and soft status pulses
- **Zero Performance Lag:** Animations must be lightweight and GPU hardware-accelerated (`transform`, `opacity`, `translateZ(0)`). Never animate layout triggers like `height` or `width` during continuous motion.
- **Accessibility:** Always respect `prefers-reduced-motion` and disable intense animations for users who request reduced motion.

---

## 9. 100% Security Architecture
Security is non-negotiable across every line of frontend and backend code:
- **All Agents Must Make Sure the Site Is 100% Secure:** Everything built, modified, or handled must follow strict security practices.
- **Zero Exposed Secrets:** Never hardcode or leak private API keys, JWT secrets, database connection strings, or cloud storage credentials in client-side code, git commits, or public responses.
- **Strict Input Sanitization & Validation:** Validate and sanitize all user input on both client and server to prevent XSS, NoSQL/SQL injection, and prototype pollution.
- **Robust Authentication & Authorization:** Ensure protected routes, story creation, downloads, and admin panels strictly verify user identity and role permissions. Users must never be able to access, modify, or delete another photographer’s data.
- **Safe Media & Asset Handling:** Validate uploaded file types, enforce size limits, and ensure private shoot deliverables with passwords cannot be accessed without proper authorization.

---

## 10. Mandatory Deep Thinking & Plan Approval Before Doing Anything
- **All agents must think through and share their plans and wait for approval before doing anything.**
- **No impulsive or unapproved code changes:** AI agents must think through the architectural impact, responsive layout, visual design, and real-world photographer workflow before writing code.
- **Share Plans First:** For all substantial features, refactors, and UI changes, agents must present a clear, structured plan and wait for explicit alignment and approval before making major edits.

---

## Core Brand North Star
> **Don’t just deliver photos. Showcase them.**

