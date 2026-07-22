# Scope Decision — Site-Level vs Page-Level

Whenever you're about to emit a `<link>`, `<style>`, `<script>`, or `<meta>` tag (Google Fonts, Bunny Fonts, CDN libs, analytics, pixels, custom CSS, etc.) you must consciously choose **site scope** or **page scope**. Picking the wrong scope means either bloat (asset loaded on every page when only one needs it) or breakage (font missing on a page that uses it).

## The fields

| Field | Where it lands | When emitted |
|---|---|---|
| `site_before_head` | Site option `uichemy_composer_site_custom_code.head` → printed in `<head>` of **every** page on the site | First upload of the pipeline only |
| `site_before_body` | Site option `…footer` → printed before `</body>` of **every** page | First upload of the pipeline only |
| `page_before_head` | Stored on the first Proton widget of the page (`page_custom_code_head`) → printed in `<head>` of **that page only** | First upload of the page only (sections 2+ skip) |
| `page_before_body` | Stored on the first widget (`page_custom_code_footer`) → printed before `</body>` of **that page only** | First upload of the page only |
| `css` / `js` | Scoped to the widget instance | Every section |

## Decision rubric

For each asset you'd otherwise drop into a `<link>`/`<style>`/`<script>` tag, ask in order:

1. **Is it used by the header or footer template?** → **site_before_head**. The header/footer renders on every page, so its dependencies must too.
2. **Will it be needed by ≥2 different pages in this build?** → **site_before_head**. One cached copy is cheaper than re-fetching per page. Brand fonts are almost always this case.
3. **Is it a global concern (analytics, tag manager, GA4, Meta Pixel, cookie banner, A/B testing harness)?** → **site_before_head** / **site_before_body**.
4. **Is it specific to one page only?** (campaign pixel, chart library only used by a report page, page-only hero font, page-only animation lib) → **page_before_head** / **page_before_body**.
5. **Tiebreaker for fonts:** when you genuinely can't tell, prefer **site_before_head**. Font files are cache-friendly across pages and the cost of double-importing on the one page that uses them is much smaller than the cost of a missing font on a page you forgot.

## Concrete font handling

- The `unmatchedFonts[]` set collected in Phase 1 Step 5 is the **site-level** font set — these are the families the design system reuses. Emit them in `site_before_head` on the first upload of the pipeline (header, footer, or first section — whichever runs first).
- If a single section introduces a font that is **not** in `unmatchedFonts[]` and the design clearly uses it on this section only (e.g., a quote-card display face used only on the "Testimonials" page), emit it via `page_before_head` on that page's first upload — not site-wide.
- Never duplicate: if a family is already in the site-level set, do not re-emit it at page level.

## Format

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap">
```

Use raw `<link>` tags — do **not** wrap them in `<style>`. The composer storage layer preserves `<link>`/`<style>`/`<script>`/`<meta>` tags exactly when sent through MCP.

## Anti-patterns

- ❌ Putting every font at site level "to be safe" — bloats every page on the site.
- ❌ Putting brand fonts at page level — they'll be missing on every other page that uses them.
- ❌ Re-sending `site_before_head` on sections 2+ — duplicate `<link>` URLs are skipped, but it's wasted payload.
- ❌ Wrapping `<link>` tags inside `<style>` — browsers ignore that.
