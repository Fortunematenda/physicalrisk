# PHASE 2 — Per-section loop (atomic generate + upload)

Iterate `sectionPlan[]` in order. Complete Steps 6→10 fully for section N before initialising N+1.

## Required per-section log (print verbatim)

```
📐  Fetching design context — section N/T: <Label>   (includes inline screenshot)
📋  Typography: N/T matched → .class1 · .class2 | X inline
🔨  Generating HTML/CSS/JS  — section N/T: <Label>
🛡️  Section N/T: PASS
⬆️  Uploading to WordPress  — section N/T: <Label>
✅  Section N/T uploaded    (post_id=…)
🧹  Memory cleared          → Section N+1/T: <Next Label>
```

If Step 8 fails → `❌ Section N/T: FAIL` then list every failing selector before fixing.

---

## Step 6 — Fetch section data

1. Initialise `currentSectionMemory = { label, nodeId }`.
2. Print `📐  Fetching design context` → call **`get_design_context`** on section `nodeId` → store. Do NOT set `excludeScreenshot` — you want its inline screenshot. This single call returns BOTH the visual reference (inline PNG) AND the exact code/measurements. Use the embedded screenshot for layout, spacing, colors, and hierarchy; use the code for precise px values. Extract: layout mode, padding, gap, child specs (text, font, fill, stroke, radius, shadow), CDN image URLs, component instances.
3. **(Optional — detail only)** If the embedded screenshot is too small to read fine detail (dense text, tiny icons), call **`get_screenshot`** with a higher `maxDimension` for THIS section only. Do NOT call `get_screenshot` by default — a plain call just adds a redundant URL (its default response is a link, not a viewable inline image).
4. **Component instances:** fetch master component `get_design_context` — treat as source of truth for typography and padding.
5. **Insufficient first read?** Make additional `get_design_context` on child nodes within this section only → store in `extraContexts[]`.

Never use design_context from a different section.

### ⚠️ Overflow handling — mandatory for Step 6

When any tool result (get_screenshot, get_design_context, component get_design_context) overflows to a temp file:

1. **Always use the Read tool** — read in 300-line chunks (offset/limit) until the full file is consumed.
2. **Extract everything in one logical pass:** layout mode, padding, gap, all text nodes (content + font + size + weight), all fill colors, all image URLs, all component refs. Store everything in `currentSectionMemory`.
3. **Never bash, never re-read, never subagent** — Step 6 needs full layout/structure data. A subagent compact summary loses spacing, hierarchy, and component data critical for HTML/CSS generation.

---

## Step 7 — Generate HTML + CSS + JS

Print `🔨  Generating HTML/CSS/JS`.

### 7a — Pre-generation typography matching (mandatory gate)

For every text node in `designContext` + `extraContexts[]`, build key `"Family|Weight|RoundedSizePx"` → check `typoLookup`. Perform the matching internally, then print ONE compact line:

```
📋 Typography: N/T matched → .class1 · .class2 · .class3 | X inline
```

Example:
```
📋 Typography: 3/4 matched → .text-e4f5a6b · .g-utabc12 · .text-c7d8e9f | 1 inline
```

Do not begin writing HTML until this line is printed. Unmatched → inline CSS only. Never fabricate a class name for an unmatched entry.

### 7b — HTML

Root element: `<div class="uichemy-{slug}-{index}">` (slug = kebab-case label, index = 1-based).

For Header/Footer: root stays `<div>` — never `<header>` or `<footer>` as widget root.

Rules:
- Semantic HTML5 (`<nav>`, `<section>`, `<ul>`, `<button>`, `<a>`, etc.) · BEM class naming for all children
- Exact text from Figma — no paraphrasing
- Real Figma CDN URLs from `designContext` only. No URL → `data-figma-image="nodeId"`. Never fabricate URLs.
- Append matched typography class (`.class` from `typoLookup`) alongside BEM — never replace BEM.
  - Standard: `text-{id}` · Atomic: atomic token (e.g. `g-utabc12`) — no `text-` prefix
- Inline SVGs: set `width`, `height`, `viewBox` from Figma values
- Accessibility: `aria-label` on icon-only buttons · `role="navigation"` on `<nav>` · `alt` on all images · `aria-expanded` on toggles

#### Images that aren't already a public HTTPS URL → `request_image_upload`

The upload tools (`create_uichemy_composer_page`, `add_uichemy_composer_section`, `set_site_branding`) sideload `<img src="…">` by **downloading the URL over HTTP**. They can NOT read `data:` URIs, `blob:` URIs, local file paths, or any URL their server cannot reach. If you have an image that is none of (a) a Figma CDN URL from `designContext`, (b) an existing media-library URL, (c) a public HTTPS URL the WP server can fetch — you MUST upload it through `request_image_upload` first.

Flow:
1. Call `request_image_upload({ filename, mime })` → response contains `upload_url`, `upload_token`, `curl_example`, `expires_in` (seconds). Slot is single-use and expires in ~10 minutes.
2. Run the returned `curl_example` via your bash tool with the actual image bytes (`--data-binary @/path/to/file`). PUT raw bytes is the default; POST multipart `file=@…` also works.
3. Read the upload response → `{ url, attachment_id }`. Use that `url` in your HTML `<img src="…">`.
4. Then send the HTML to `create_uichemy_composer_page` / `add_uichemy_composer_section` as usual — the dedupe layer will reuse the attachment, so no second sideload.

If a single section has multiple non-public images, request a fresh slot per image (slots are single-use). Never embed `data:` or local paths in HTML you're about to send — the sideload step will fail silently and the live page will render with a broken image.

**Header sections — Logo:**

| Figma element | Tag |
|---|---|
| Main brand logo (rectangular, linked home) | `<uichemy-site-logo class="{block}__logo" />` |
| Small favicon/square icon | `<uichemy-site-icon class="{block}__icon" data-size="64" />` |

Never use raw `<img src="...figma-cdn-url...">` for logo in Header.

**Header sections — Navigation:**

```html
<uichemy-nav-menu class="{block}__nav" role="navigation" aria-label="Main navigation">
  <li for="nav_item in nav_menu" class="{block}__nav-item">
    {nav_item}
    <ul if="sub_items in nav_item" class="{block}__dropdown">
      <li for="sub_item in nav_item.sub_items" class="{block}__dropdown-item">{sub_item}</li>
    </ul>
  </li>
</uichemy-nav-menu>
```

- Do NOT wrap in extra `<nav>`. CSS targets `.{block}__nav > ul > li`. Never hardcode `<li><a>` items.

### 7c — CSS

Scoped under `.uichemy-{slug}-{index}` for every rule. No `@import` or `<link>` in widget CSS.

**Colors:**
- Hex in `colorLookup` → `var(--e-global-color-{id})` (standard) or `var(--{label})` (atomic). Always.
- Hex NOT in `colorLookup` → raw hex + `/* untracked: #hex */`
- `rgba()` alpha<1 → always raw inline.

**Typography — matched elements:** No `font-family`, `font-weight`, `font-size`, `line-height`, `letter-spacing` in CSS rule — global class handles them.

**Layout signals:**

| Figma signal | CSS pattern |
|---|---|
| `primaryAxisSizingMode: FIXED` | `max-width: {value}px; width: 100%;` |
| `layoutGrow: 1` | `flex: 1 1 0; min-width: 0;` |
| `layoutWrap: WRAP` | `flex-wrap: wrap; gap: {value}px;` |
| Hero heading | `font-size: clamp({mobile}px, {fluid}vw, {desktop}px);` |
| Section horizontal padding | `padding-inline: clamp(16px, 5vw, {figma}px);` |
| Any `<img>` | `width: 100%; height: auto; object-fit: cover; max-width: 100%;` |

**Multi-column / grid structures — read design_context before choosing (do NOT default to auto-fit):**

| Structure in design_context | CSS pattern |
|---|---|
| Equal cards, one flat row, identical widths | `grid-template-columns: repeat(auto-fit, minmax({min}px, 1fr)); gap:{gap}px;` |
| Unequal-height columns / one column spans multiple rows of the others | Explicit `grid-template-columns: {w1}px {w2}px {w3}px` (or `fr` proportions) + each column is its own flex column (`flex-direction:column; gap:{gap}px`). Never `auto-fit` — it flattens the spanning column. |
| Asymmetric widths (e.g. text 558 + image 461) | `grid-template-columns: {w1}fr {w2}fr` from the Figma width ratio — not equal `1fr`. |
| A column that itself stacks children (nested auto-layout) | Grid/flex cell → inside it `flex-direction:column; gap:{childGap}px`. |
| Overlapping / negative-offset children (carousel bleed, badge over card) | Parent `position:relative` + child `transform`/`position`, or `overflow` for intentional bleed — not grid. |

Rule: column widths and child counts in design_context are **authoritative**. A 3-column block whose middle spans 2 rows is NOT a 3-up auto-fit grid. At ≤768px collapse multi-column structures to a single column in source order.

**Always include:**
```css
*, *::before, *::after { box-sizing: border-box; }
img, video, iframe { max-width: 100%; }
```

**Anti-overflow — mandatory:**
```css
.uichemy-{slug}-{index} { width: 100%; max-width: 100%; overflow-x: clip; }
.uichemy-{slug}-{index} * { min-width: 0; }
```

**Container wrapper — mandatory for boxed sections:**

Use the correct class depending on the mode (`atomic_enabled` from Step 2a):

| Mode | Class to use |
|---|---|
| `atomic_enabled=false` | `elementor-global-boxed-width` |
| `atomic_enabled=true`  | `elementor-atomic-boxed-width` |

```html
<!-- non-atomic -->
<div class="{block}__container elementor-global-boxed-width"><!-- content --></div>

<!-- atomic -->
<div class="{block}__container elementor-atomic-boxed-width"><!-- content --></div>
```
```css
.{block}__container { width: 100%; margin-inline: auto; padding-inline: clamp(16px, 5vw, {figma-padding}px); }
```
Both classes apply `max-width` automatically from the globals CSS — **never write `max-width` on boxed wrappers**.

- Full-bleed sections → add class on inner content wrapper only, not on root.
- Header/Footer → add on inner nav/content row, not on root `<div>`.
- True full-bleed (no boxed wrapper) → omit entirely.

**Responsive — three breakpoints, all non-empty:**
```css
@media (max-width: 1024px) { /* tablet: reduce padding/gaps, 3-4 col → 2 col */ }
@media (max-width: 768px)  { /* mobile: single-column, stack flex rows, full-width CTAs */ }
@media (max-width: 480px)  { /* small mobile: tightest spacing, smallest clamp floors */ }
```

**Hover/focus:** Buttons `filter:brightness(0.9)` · Cards `translateY(-2px)` · Links `text-decoration:underline` · All interactive: `:focus-visible` outline — never `outline:none` without replacement.

### 7d — JavaScript

No `<script>` tags in HTML. Bare JS only.

**Scoping — mandatory:**
```js
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('.uichemy-{slug}-{index}');
    if (!root) return;
    // all DOM queries via root.querySelector() / root.querySelectorAll()
  });
})();
```

**Pattern table:**

| Pattern | Required behaviour |
|---|---|
| Slider/Carousel | prev/next · touch swipe · dot indicators · loop · autoplay pause on hover |
| Tabs | panel show/hide · `aria-selected` · keyboard ←/→ |
| Accordion | max-height animation · `aria-expanded` · Enter/Space |
| Counter | `IntersectionObserver` once · `requestAnimationFrame` increment |
| Hamburger nav | toggle drawer · body scroll lock · close on link click · Esc |
| Sticky header | scroll listener · `is-sticky` class · `will-change: transform` |
| Modal | open/close · backdrop click · Esc · focus-trap · `aria-modal="true"` |
| Dropdown | hover desktop · click mobile · close on outside click |
| Scroll animations | `IntersectionObserver` → `is-visible` · `threshold: 0.15` |

**Quality:** `data-bound="1"` guard · null-checks before every `addEventListener` · no jQuery · no `console.log` · Enter/Space for buttons · Esc for overlays · no external dependencies.

Static section → `js: ""`
