# PHASE 3 — Final summary

## Step 11 — Final code injection (optional) + Summary

If site-wide or page-level code was deferred, call **`set_page_site_code`** once:
```
{ post_id, site_before_head, site_before_body, page_before_head, page_before_body }
```
Only call if remaining code to inject — skip if already sent on first section upload.

```
✅  Page created successfully

   🖊️  Edit in Elementor:  <elementor_link>
   👁️   Live Preview:       <preview_link>
```

**Single post template — print by `system` value:**

| system | Output |
|---|---|
| `elementor_pro` | `📄 Single Post → <link> (ACTIVE on all posts ✅)` |
| `nexter` | `📄 Single Post → <link> (ACTIVE on all posts ✅)` |
| `none` | `ℹ️ No theme builder — imported as regular page instead` |

If sample post created: `📝 Sample post: <title> → <permalink>`

**Header/Footer — print by `system` value:**

| system | Output |
|---|---|
| `elementor_pro` | `🧩 Header/Footer → ACTIVE on entire site ✅` |
| `nexter` | `🧩 Header/Footer → ACTIVE on entire site ✅` |
| `elementor` | `🧩 Header/Footer → INACTIVE — activate manually: Elementor > Theme Builder → Add Condition → Entire Site` |

If `set_site_branding` was called: `🎨 Logo → ✅ set | skipped | ❌ failed · Icon → ✅ set | skipped | ❌ failed`

Then 3–5 line paragraph: globals synced/skipped · sections completed · notable JS/responsive features.

---

## Appendix A — Common failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| `sync_globals` validation error | Wrong payload shape | Use exact schema from Step 4 — nested `value` objects, `sizes:[]` not null |
| CSS uses raw hex that's in colorLookup | Step 8 missed a CSS property | Search full CSS string for every colorLookup key before upload |
| Matched element still has `font-size` in CSS | CSS not cleaned after adding class | Strip font props from all selectors targeting matched elements |
| Responsive rules are empty blocks | Didn't review Figma layout signals | Re-read design_context for `primaryAxisSizingMode`, `layoutWrap`, child counts |
| JS re-binds on every render | Missing `data-bound="1"` | Wrap every listener block in bound guard |
| `site_before_head` missing fonts from later sections | Built from section 1 only | Build from full `unmatchedFonts[]` collected in Step 5 |
| Upload fails "post_id not found" on section 2+ | `pipelineState.post_id` not saved | Always save post_id from `create_uichemy_composer_page` before clearing section 1 memory |
| Token counts swing between runs | Skipped `get_variable_defs` or root `get_design_context` | Always call both in Step 3 |
| Generic nodeIds after `get_metadata` | Children are wrapper groups | Recurse deeper until real section names appear |
| `sync_atomic_globals` error | Wrong `data` shape | Ensure `data.color[].type="global-color-variable"` and `data.typography[].value.desktop` is an object |
