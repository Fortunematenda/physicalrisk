## Step 4 — Compare Figma vs WordPress → sync decision

Merge Step 2b WordPress baseline with Step 3 `designTokenInventory`.

### 4 pre-work — Extract container width (no extra API call)

`get_metadata` does NOT return padding, and top-level sections are usually full-bleed
(width = root width). So do NOT use `child.width − padding` on direct children — that
just returns the full-bleed width (e.g. 1440) and will overwrite the kit's real boxed
width.

Instead, scan EVERY descendant frame in the `get_metadata` tree and find the boxed
content width:
1. Let `rootW` = root frame width.
2. Collect the `width` of every descendant frame.
3. Discard any width within 2px of `rootW` (those are full-bleed sections), and any
   width < 800px (inner components, not containers).
4. `figmaContainerWidth.value` = the most frequently repeated remaining width
   (must repeat ≥3 times across sections).
5. Fallback if nothing repeats ≥3×: `rootW − 2 × (most common left x-offset of the
   boxed content frames)`, flagged `estimated:true`.
6. If still nothing usable → `null`: skip comparison, re-send the existing kit width
   unchanged. NEVER overwrite the kit width from a guess.

```
figmaContainerWidth = { value: <px>, count: <repeat count>, estimated: false|true }
```

### Matching rules

**Colors:** Exact lowercase hex. CSS `var(--...)` clearly mapping to kit color → matched, document mapping.
**Typography:** Match on `(family, weight, sizePx)`. Tolerance ±2px allowed — document it.
**Container width:** Compare `figmaContainerWidth.value` vs `containerWidths.desktop.size`.

### ADD rules

**Typography ADD when any:** Count ≥2 · role is `h1` · clear systemic role (primary body/button/heading scale).

**Color ADD when any:** Count ≥3 · brand/primary accent (saturated, on CTAs/links) · dominant text or background color.

**SKIP when:** Already in kit · pure decorative one-off (count ≤2, non-systemic) · gradient/image fill · `rgba()` alpha<1.

### Decision log (print before sync)

**MANDATORY — print ONE line before any sync decision.** Never silently skip. The user has no other audit trail; if you skip the line they cannot tell whether the sync ran, failed, or was unnecessary.

```
📋 Syncing: N new colors · M new typography · container Xpx (updated|unchanged|not detected)
(or)
📋 No sync required — kit covers all tokens · container Xpx matched
```

If nothing to add AND container width MATCHED → skip the sync API call, but still print the `No sync required` line.
Container width CHANGED alone is enough to trigger a sync call.

### Sync payload — ALWAYS include all three groups

Even if a group has nothing to add, send it as an **empty array** (colors/typography) or **re-send the current value unchanged** (container_width). Reasons:

- `sync_globals` (standard mode) used to crash on PHP 8 if any of `colors` / `typography` / `container_width` was missing — fixed, but a malformed payload still wastes a round-trip. Always send `colors: []`, `typography: []`, `container_width: { desktop:{…current…} }`.
- `sync_atomic_globals` (atomic mode) **MUST** include `container_width` whenever you call it. Omitting it used to silently delete the existing boxed-width across the whole site — the PHP side now preserves it, but you must still pass the current value any time `container_width` actually needs to change. Re-send the existing breakpoints (`desktop`/`tablet`/`mobile`) verbatim from `get_atomic_globals` when nothing changes.

### Sync result — verify after the call

After the API call returns, print a one-line confirmation built from the response data:
```
✅ Synced: N colors · M typography · container Xpx (updated|unchanged)
```
If the response lacks the items you sent → STOP, print the discrepancy, do not enter Phase 2.

---

### Typography value derivation (compute per style — never guess)

For every typography global you CREATE, derive each field from `get_variable_defs` /
design_context for that exact style — do not reuse a default like `1.2`/`1.5`:

- **line-height:**
  - design shows `normal` / Figma AUTO        → `"normal"`
  - unitless ratio (e.g. `1.4`)               → `"1.4em"`
  - pixels (`Npx` on a style of size `Spx`)   → `round(N/Spx, 2)` + `"em"`
  - percent (`P%`)                            → `round(P/100, 2)` + `"em"`
  - apply the SAME line-height to desktop, tablet, mobile (never scale it)
- **letter-spacing:** px → `"<px>px"`; percent → `round(P/100, 2)` + `"em"`; `0`/none → omit
- **font-weight:** the style's real weight as a string (`"400"`, `"500"`, `"600"`, `"700"`)
- **font-size:** desktop = real px; tablet/mobile via the responsive scale table

Matched styles are NOT recomputed — they reuse the existing kit class as-is.

---

### Option A — sync_globals (`atomic_enabled=false`)

One call with all additions. Required schema:

```
colors item:    { action:"ADD", value: { id:"7chars", title:"Name", value:"#hex" } }

typography item: { action:"ADD", value: { id:"7chars", title:"Name", value: {
    typography_typography: "custom",           ← mandatory
    typography_font_family: "Poppins",
    typography_font_weight: "700",
    typography_font_size:      { unit:"px", size:48, sizes:[] },  ← sizes:[] never null
    typography_line_height:    { unit:"em", size:1.2, sizes:[] },
    typography_letter_spacing: { unit:"px", size:0,  sizes:[] }
  } } }

container_width: { desktop: { unit:"px", size:<value>, sizes:[] } }
```

**Container width value:** CHANGED → `figmaContainerWidth.value` · MATCHED or null → re-send current `containerWidths.desktop.size` unchanged.

After sync: use response directly to build lookup tables — **do NOT call get_globals again**.

---

### Option B — sync_atomic_globals (`atomic_enabled=true`)

```
data.color item: { action:"ADD", type:"global-color-variable",
                   id:"e-gv-{6chars}", label:"kebab-css-name", value:"#hex" }

data.typography item: { action:"ADD", id:"g-ut{7chars}", label:"kebab-name",
  value: {
    desktop: { font-family:"Poppins", font-size:"48px", font-weight:"700", line-height:"1.2em" },
    tablet:  { font-size:"36px" },
    mobile:  { font-size:"28px" }
  } }

container_width: same format as Option A — synced value is applied via class `elementor-atomic-boxed-width` in HTML
```

After sync: use response directly — **do NOT call get_atomic_globals again**.

Verify returned data contains the new entries. If not → stop, report discrepancy, do not enter Phase 2.

Print one line: `✅ Synced: N colors · M typography · container Xpx (updated|unchanged)` or `✅ Sync skipped — kit covers all tokens`

---

## Step 5 — Build lookup tables

Built exclusively from the latest globals snapshot (post-sync or unchanged).

### Standard mode (`atomic_enabled=false`)

```js
colorLookup["#1a73e8"] = { cssVar: "var(--e-global-color-a1b2c3d)", name: "Brand Primary" }
typoLookup["Poppins|700|48"] = { class: "text-e4f5a6b", name: "Heading H1" }
```

### Atomic mode (`atomic_enabled=true`)

```js
colorLookup["#1a73e8"] = { cssVar: "var(--brand-primary)", name: "brand-primary" }
typoLookup["Poppins|700|48"] = { class: "heading-xl", id: "g-utabc12", name: "heading-xl" }
```

**Key construction rules:**
- Color key: always lowercase 6-digit hex (no shorthand, no alpha).
- Typography key: `"${fontFamily}|${fontWeight}|${Math.round(fontSizePx)}"` — weight as string (e.g. `"700"`).
- Standard: `fontSizePx` from `typography_font_size.size` (number).
- Atomic: parse from `"48px"` string → strip unit → `Math.round()`. Skip entry if unparseable.

**Atomic class name — CRITICAL:**
- The `class` field stored in `typoLookup` (and what you write into HTML's `class="…"`) is the **sanitized label**, never the `g-ut…` id.
- Sanitize the entry's `label` field with this rule (must match exactly):
  1. Lowercase the label.
  2. Trim whitespace.
  3. Replace every char that is NOT `[a-z0-9_-]` with `-`.
  4. Strip leading and trailing `-`.
  - `"Heading XL"` → `"heading-xl"` · `"Body / Default"` → `"body---default"` → `"body-default"` (collapse not required, but the form Elementor renders is the same)
- The `id` field (`g-ut…`) is **internal storage only**. It is the value Elementor's REST API uses to look up the class definition. It is NEVER the className on the page DOM. If `<h1 class="g-utabc12">` ends up in HTML, the class does not match any CSS selector and typography fails silently.
- Same rule for atomic width class (`g-uw…`), padding (`g-up…`), border (`g-ub…`), radius (`g-ur…`): always use the sanitized label as the className, never the id. The `id` is only useful when calling `sync_atomic_globals` to update an existing entry.
- Color is unaffected — atomic colors are applied via `var(--label)`, not via a class. The CSS variable name IS the (prefixed) label, so the `colorLookup.cssVar` field is already correct.

**Google Fonts:** Record all `fontFamily` values not in `typoLookup` as `unmatchedFonts[]` — required in `site_before_head` on first section upload.

Store `containerWidthPx` frozen for Phase 2 — used as `max-width` fallback on `{block}__container`.

**Build the lookup tables internally** (no API call — built from the sync response only):
`colorLookup` (hex → cssVar), `typoLookup` (`Family|Weight|SizePx` → class label), `containerWidthPx`, `unmatchedFonts[]`.

**Do NOT print the raw lookup tables** — they are internal jargon (hex maps, class ids) that the user doesn't need. Print only a one-line, human-readable summary:
```
🎨 Matched to your kit: N colors · M type styles · container 1140px · fonts to load: Poppins, Inter
```
Keep `colorLookup` / `typoLookup` / `containerWidthPx` / `unmatchedFonts[]` in working memory for Phase 2.

⟹ **After Step 5 complete and lookup tables confirmed built:**
   call `uichemy_composer_convert(figma_url, phase="2")`
