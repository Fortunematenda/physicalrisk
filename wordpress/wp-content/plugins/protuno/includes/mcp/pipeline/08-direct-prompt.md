# Protuno Site Build — Direct Prompt Pipeline

You were called because the user asked for a website / landing page / template / section without sharing a Figma URL. Their brief may be as short as **"make docker service design"** or **"build me a saas landing"** — that is normal. Your job is to turn that brief into a complete site (Header → body → Footer), using the Proton MCP tools, with NO follow-up questions to the user unless something is truly ambiguous.

---

## Step 0 — Read this first

You are NOT generating loose HTML to chat. Every section ends up as a real Elementor template on the user's WordPress site, via these tools:

- `check_config` — site readiness (call once, first)
- `create_uichemy_composer_header_footer({ type:"header"|"footer", ... })` — Header / Footer theme templates (Pro / Nexter only — otherwise embed inline; see Build order)
- `create_uichemy_composer_page({ ... })` — first body section, creates the page
- `add_uichemy_composer_section({ post_id, ... })` — every subsequent body section
- `request_image_upload({ filename, mime })` — upload AI-generated images so `<img src>` is a real URL

**Globals sync is disabled for this build** — do NOT call `get_globals` / `sync_globals` / `get_atomic_globals` / `sync_atomic_globals`. Style every section with raw CSS values (full font properties on every text element, raw hex on every color). See Step 3 and the CSS rules in Step 4.

If you ever feel the urge to print large HTML in chat instead of calling these tools — stop. The user wants a built site, not a code dump.

---

## Step 1 — Plan from the brief (no questions yet)

Infer four things from the user's brief in this order:

| Inferred | Source |
|---|---|
| **Brand / topic** | The noun in the brief. "docker service design" → brand="Docker", topic="developer tooling / container platform". "coffee shop site" → brand="Aurora Roasters" (invent a plausible name if not given), topic="café". |
| **Page title** | `<Brand> — <Page kind>`. Examples: "Docker — Service Design", "Aurora Roasters — Homepage", "Lumen — Pricing". NEVER `"Protuno AI Landing Page"`. |
| **Style direction** | One sentence: typography family hint, palette hint, tone (e.g. "modern dark technical, Inter + Geist Mono, teal accent on near-black"). Pick something sensible — do not ask the user. |
| **Section plan** | See below. |

**Default section plan for any "build me a site" prompt** — six to eight sections, ALWAYS starting with Header and ending with Footer:

```
🧩 SECTION PLAN — "Docker — Service Design"
   1. Header   — logo + nav + CTA
   2. Hero     — headline + sub + 2 CTAs
   3. Features — 3 to 6 capability cards
   4. How it works — 3-step process or pipeline diagram
   5. Social proof — logos OR a testimonial block
   6. Pricing  — 2 to 3 tiers (skip if the brief implies "no pricing")
   7. CTA banner — single conversion block
   8. Footer   — links + small copyright
→ Mode: MULTI-WIDGET (N sections)
```

Adjust the body sections to fit the brief (a portfolio doesn't have pricing, a blog homepage swaps Pricing for "Latest posts" — use judgment). **Header is section 1, Footer is the last section. Never optional.** Print the section-plan block to the user before any tool calls.

---

## Step 2 — Site readiness

Call `check_config` once. Store from the response:

- `checks.elementor_active` — if false, STOP and tell the user to activate Elementor.
- `atomic_enabled` — picks the globals tool family.
- `header_footer_system` — informs the user which system header/footer will land on (`elementor_pro` / `nexter` / `elementor`).
- `checks.has_nav_menu` — if false, call `ensure_nav_menu` now (the Header you're about to build uses `<uichemy-nav-menu>`, which renders empty without an assigned menu).
- `active_header[]` / `active_footer[]` — if non-empty, mention to the user that you'll be replacing them when your new templates publish.

Print one compact line, then move on:

```
⚙️  SITE READY — atomic=false · system=elementor_pro · nav=✅ · existing header/footer will be replaced
```

---

## Step 3 — Pick a palette + type scale (no globals sync)

Globals sync is OFF for this build, so don't call `get_globals` / `get_atomic_globals` / `sync_globals` / `sync_atomic_globals`. Instead, pick a small palette + type scale once and reuse the **raw values** everywhere:

- **Palette** — 4 to 6 colors written as raw hex (`#0A0F1E`, `#22D3EE`, `#E5E7EB`, …). Pick: brand, accent, ink-1, ink-2, surface, border. Write a one-line summary so you don't drift later.
- **Type scale** — 4 to 6 typography combos as `{family, weight, size, line-height, letter-spacing}` (e.g. `Inter / 700 / 48px / 1.1em / -0.02em` for H1). Use these raw values inline on every matching text element in every section.

Google Fonts still need to be loaded once via `site_before_head` on your first upload (Step 4 build order). Build a Google Fonts `<link>` line that covers every family + weight in your type scale.

Skip directly to Step 4 — no sync calls.

---

## Step 4 — Build the site (atomic per-section loop)

For each section in your plan, do generate → upload in one shot. Don't pre-write all sections then upload — go one by one so an error in section 4 doesn't waste sections 5–8.

### Per-section log (print before each upload)

```
🔨  Generating section N/T: <Label>
🛡️  Section N/T: PASS
⬆️  Uploading section N/T: <Label>
✅  Section N/T uploaded (post_id=…)
```

### HTML rules — every section

- Root: `<div class="uichemy-{slug}-{index}">` where slug = kebab-case label, index = 1-based.
- Semantic HTML5: `<nav>`, `<section>`, `<ul>`, `<button>`, `<a>` — BEM class names for children.
- Plain BEM class names only. **No `.text-{id}` matched-typography classes** — globals sync is off, so typography lives in CSS rules per element instead.
- **Real text content from your brief — never lorem ipsum.** Make up plausible product copy that fits the brand and topic.
- **Images** — see Step 5 for the upload flow. Never use `data:` URIs, `blob:` URIs, `/local/paths.png`, or made-up URLs like `https://example.com/hero.png`. Either go through `request_image_upload`, OR omit the `<img>` and use a CSS-only visual.
- **Header specifics:** root stays `<div>` (NOT `<header>`). Use `<uichemy-site-logo class="..." />` for the brand mark, `<uichemy-nav-menu class="..." role="navigation">` for the menu (the template engine renders the WP menu — do NOT hardcode `<li>` items). Pattern:

  ```html
  <uichemy-nav-menu class="hdr__nav" role="navigation" aria-label="Main navigation">
    <li for="nav_item in nav_menu" class="hdr__nav-item">
      {nav_item}
      <ul if="sub_items in nav_item" class="hdr__dropdown">
        <li for="sub_item in nav_item.sub_items" class="hdr__dropdown-item">{sub_item}</li>
      </ul>
    </li>
  </uichemy-nav-menu>
  ```

### CSS rules — every section

- Scope every rule under `.uichemy-{slug}-{index}`. No `@import`, no `<link>` in widget CSS (use `site_before_head` for Google Fonts, once, on the first upload).
- **Colors — raw hex on every property.** Globals sync is off, so do NOT emit `var(--e-global-color-*)`. `rgba(... , α<1)` stays raw as before. Reuse the exact hexes you picked in Step 3 so the build doesn't drift.
- **Typography — full font shorthand on every text element.** Each text rule MUST include `font-family`, `font-weight`, `font-size`, `line-height`, and (when needed) `letter-spacing`. No `.text-{id}` classes. Reuse the exact combos from your Step 3 type scale so the build stays consistent across sections.
- **Container width — hardcode it.** Globals sync is off, so the kit's `.elementor-global-boxed-width` / `.elementor-atomic-boxed-width` classes have no max-width to inherit. Set `max-width: 1280px` (or the Figma frame's content width) explicitly on the widget's inner `{block}__container`.
- Always include:
  ```css
  *, *::before, *::after { box-sizing: border-box; }
  img, video, iframe { max-width: 100%; }
  .uichemy-{slug}-{index} { width: 100%; max-width: 100%; overflow-x: clip; }
  .uichemy-{slug}-{index} * { min-width: 0; }
  ```
- Three breakpoints, all non-empty:
  ```css
  @media (max-width: 1024px) { /* tablet */ }
  @media (max-width: 768px)  { /* mobile */ }
  @media (max-width: 480px)  { /* small mobile */ }
  ```
- **Inner container spacing — the widget owns it.** Use `padding-inline: clamp(16px, 5vw, {target}px)` on the section's inner container. The outer Elementor container is already `padding=0, margin=0, gap=0` — do not compensate for it.

### JS rules

- No `<script>` tags in HTML. Bare JS only, wrapped:
  ```js
  (function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
      var root = document.querySelector('.uichemy-{slug}-{index}');
      if (!root) return;
      // queries via root.querySelector*()
    });
  })();
  ```
- Static section → `js: ""`.

### Build order — branch on `header_footer_system` from Step 2

`check_config` returned `header_footer_system` as one of `elementor_pro` | `nexter` | `elementor`. Pick the matching branch — never guess.

#### Case A — `header_footer_system` is `elementor_pro` OR `nexter` (theme-builder path)

The site has a working theme builder, so Header and Footer become real theme templates that activate site-wide on creation.

```
1. create_uichemy_composer_header_footer({ type:"header", title:"<Brand> Header", html, css, js,
                                           site_css:"<Google Fonts links — only on this first call>",
                                           upload_images:true })
2. create_uichemy_composer_page({ title:"<Brand> — <Page kind>", status:"draft", label:"<first body label>",
                                  html, css, js, upload_images:true })       ← FIRST body section only
3. add_uichemy_composer_section({ post_id, label, html, css, js, upload_images:true })
                                                                              ← repeat once per remaining body section
4. create_uichemy_composer_header_footer({ type:"footer", title:"<Brand> Footer", html, css, js,
                                           upload_images:true })
```

Header/Footer NEVER go through `create_uichemy_composer_page` in this case — that creates a body section, not a theme-builder template, and the live site keeps its old header/footer.

Confirm `system` and `active=true` on each header_footer response. On the Pro / Nexter path both should be `true`.

#### Case B — `header_footer_system` is `elementor` (inline-fallback path)

Plain Elementor without Pro and without Nexter — `create_uichemy_composer_header_footer` would create an INACTIVE template that QA / end-users have to manually activate in Theme Builder. Don't do that. Instead, embed the Header and Footer as the first and last sections inside the page itself.

```
1. create_uichemy_composer_page({ title:"<Brand> — <Page kind>", status:"draft", label:"Header",
                                  html, css, js,
                                  site_before_head:"<Google Fonts — only on this first call>",
                                  upload_images:true })                      ← HEADER as section 1
2. add_uichemy_composer_section({ post_id, label:"<body label>", html, css, js, upload_images:true })
                                                                              ← repeat once per body section (Hero, Features, …)
3. add_uichemy_composer_section({ post_id, label:"Footer", html, css, js, upload_images:true })
                                                                              ← FOOTER as the LAST section
```

In this path the live page already shows the header at the top and the footer at the bottom — no theme-builder setup needed. Skip `create_uichemy_composer_header_footer` entirely.

Tell the user during the summary (Step 7) which path you took: `"theme-builder header+footer"` for Case A, `"inline header+footer (plain Elementor — no Pro / Nexter active)"` for Case B.

Save from each response: `post_id` (after the very first call — reuse in every subsequent `add_uichemy_composer_section`), `system`, `active`, `preview_link`.

---

## Step 5 — Images: the only correct way to inject one

The upload tools sideload `<img src="…">` by **fetching the URL over HTTP from the WP server.** They cannot read `data:` URIs, `blob:` URIs, local paths, or any URL the server cannot reach. So when the brief implies an image (hero illustration, feature icon, screenshot) you have three options:

1. **CSS-only** — gradient + shape + maybe an SVG inline in the HTML. Best for backgrounds and abstract visuals.
2. **External public URL** — only if you actually have a known-good HTTPS URL the WP server can reach. Most placeholder/CDN services count, but you cannot invent one — if you're guessing, don't use it.
3. **Generate + upload via `request_image_upload`** — if you have access to an image-generation model + a bash tool:
   1. Generate the image, save it to a local path.
   2. Call `request_image_upload({ filename, mime })` → response contains `upload_url`, `upload_token`, `curl_example`, `expires_in` (~10 minutes).
   3. Run the returned `curl_example` via bash with `--data-binary @/path/to/file.png`.
   4. Read the upload response → use the returned `url` in your `<img src="…">`.
   5. Slots are single-use — request a fresh one per image.

Default to option 1 (CSS-only) unless the brief specifically needs a photo/screenshot you can actually produce. Never embed `data:`, `blob:`, or invented URLs.

---

## Step 6 — Verification before each upload

Before each `create_*` / `add_*` call, do a quick PASS check:

- Scope: every CSS rule under `.uichemy-{slug}-{index}`.
- Images: no `data:` / `blob:` / local paths / invented URLs.
- Responsive: tablet, mobile, and small-mobile blocks all non-empty.
- Typography: every text element's CSS rule has full font-family / weight / size / line-height. No `.text-{id}` classes (globals sync is off).
- Colors: raw hex on every property — no `var(--e-global-color-*)`. Hexes match the palette you picked in Step 3.
- Header is in the right place for your branch (section 1 of the page in Case B; separate template in Case A). Footer at the end. Real content (no lorem).

If everything passes → print `🛡️  Section N/T: PASS` and call the upload tool. If anything fails → fix and re-check before uploading. Don't ship FAILing sections.

---

## Step 7 — Final summary

When the loop ends, print one summary block to the user:

```
✅  Site built — "<Page title>"
    Header:  post_id=… · system=<system> · active=<true|false>
    Page:    post_id=… · preview=<preview_link>
    Footer:  post_id=… · system=<system> · active=<true|false>
    Sections uploaded: N
    Open the page link to preview. Header/footer are live across the site.
```

If the header/footer system is `elementor` (not Pro / not Nexter), tell the user the templates are saved as INACTIVE and they need to assign them under WP Admin → Templates → Theme Builder.

---

## Anti-patterns — do not do these

- Skipping Header or Footer because the user didn't say "header".
- Putting nav/logo/footer HTML inside `create_uichemy_composer_page` when `header_footer_system` is `elementor_pro` or `nexter` (those have working theme builders — use `create_uichemy_composer_header_footer`).
- Calling `create_uichemy_composer_header_footer` when `header_footer_system` is `elementor` (plain Elementor — that creates an inactive template that needs manual activation). Use the inline-fallback path instead.
- Default-naming pages `"Protuno AI Landing Page"` or templates `"Header — Protuno"`.
- Lorem ipsum text. Use real brand-appropriate copy.
- `<img src="https://example.com/something-i-just-invented.png">`.
- Compensating for kit-inherited container padding in widget CSS (the outer container is already zeroed).
- Writing huge HTML blocks to chat instead of calling the upload tools.
