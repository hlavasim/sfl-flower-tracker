# Glance templates — plan (iPhone-style widget looks, v3)

## Why this plan exists
Each round so far has been rebuilt after the owner looked at it:
- **v1:** a hand-written S/M/L face per widget gave too few looks.
- **v2:** one model × 8 sizes × 8 styles gave about 60 looks per widget, and most of them were the same content stretched into a bigger, emptier box. The icon grids were also uneven: 2.5×2.5 cells, items cut off, "3 of 4" shown.

The owner wants:
- **Dozens of ready-made looks per widget.** Clicking ◀ ▶ should show each one, ideally with no configuring.
- **Every look meaningfully different and good-looking.** No look that only re-arranges the same few items into more empty space.
- **Shapes beyond squares,** such as 1×4 and 4×1, where the content suits them.
- **Even, centred grids** (1–4 equal columns), with nothing cut off.

### Research: Apple HIG "Widgets", read 2026-11-26
- "Small widgets … typically show a single piece of information while larger sizes support **additional layers of information**."
- "**Avoid expanding a smaller widget's content to simply fill a larger area.** It's more important to create one widget in the size that best represents the content than providing the widget in all sizes."
- "Balance information density. Sparse layouts can make the widget seem unnecessary; overly dense ones are less glanceable."
- "In larger widgets, display more data or more detailed visualizations, but stay centred on the widget's main purpose."
- Standard margins are **16 pt** (11 pt for tight groupings). Text is **≥ 11 pt**. Content corner radius follows the widget's.
- "Design a realistic preview for the widget gallery … clearly representing the experience each size can provide."
- If data can be stale, show when it was last updated.

## The design

### 1. A layered model, not a flat one
A widget describes its data in layers, from most to least important. Larger looks add layers; they do not stretch layer 0.
- `head` (layer 0): the one number that matters, with optional `ring` / `meter` (0–100), `hero` icon, `cap`, `unit` and `tone`.
- `items` (layer 1): the primary list, most important first.
  - Each item has `{ icon, name, sub, value, tone, chip:{text,tone}, pct, at }`.
  - `at` is a timestamp in ms. When set, the engine renders a live countdown that the page's existing timer ticks: `class="growing-bed-time" data-ready`. This gives the crafting queue and trap times for free.
- `tiles` (layer 2): 2–6 key numbers `{ label, value, sub }`.
- `series` (layer 3): a real time series (numbers, oldest first), only when the data has one.
- `foot`: a closing line, e.g. totals or "as of 12 min ago".

### 2. A curated template catalogue instead of size × style
A **template** is a hand-designed layout at one size that uses specific layers. Each template declares:
- `size`;
- `needs`, the layers it requires (`head`, `items`, `icons` (items with icons), `pct`, `tiles`, `series`);
- `slots`, how many items or tiles it can show;
- `render(model)`.

The catalogue covers about 30 templates. Rough content per size:

| size | templates (examples) |
|---|---|
| 1×1 | number + ring · hero icon + number · next-up (first item's big icon + chip/countdown) · icon grid (2–6) · 3 rows · 5 compact lines · 2–4 tiles · big gauge (head ring centred) |
| 2×1 | number │ 3 rows · number │ tiles · icon strip (one row, up to 6) · rows in 2 columns (6) · number + chart · 3 bars |
| 1×2 | number + 4 rows · icon column/grid (up to 8) · 6 bars · 10 compact lines |
| 2×2 | number + tiles + 3 rows · icon grid (up to 16) · number + chart + 2 rows · 8 rows · bars + number |
| 4×1 | number + icon strip · rows in 3 columns · 4–6 tiles in a row · wide chart + number |
| 1×4 | tall list (12 rows) · icon column (up to 12) |
| 4×2 | dashboard: number + tiles + chart + list |
| 2×4 | head + long list (18) |

### 3. Offer only looks that fill well and differ
A template is offered for a model only when all three hold:
- **(a)** its `needs` are present.
- **(b)** its fill is **≥ 50 %**. Fill means items shown ÷ slots; templates that show only the head count as full. This removes "4 items in a 16-slot grid".
- **(c)** its **signature** differs from every smaller template already offered. The signature is the set of layers it shows plus how many items/tiles it shows. A bigger box with the same signature is dropped.

The ◀ ▶ order runs by size, then by template order. The counter shows "n / total".

### 4. Visual rules (CSS tokens, one place)
- **Padding:** 16 px; tight groups 11 px.
- **Text:** ≥ 11 px everywhere.
- **Headline size per template size, not per container width:** 1×1 34 px · 2×1 / 1×2 36 px · 2×2 44 px · 4×1 40 px · 4×2 / 2×4 48 px.
- **Icon grids:** the engine picks columns × rows for the item count and shape, from 1–4 equal columns only (never 2.5), centred, every item visible. Over capacity, the last cell is "+N". Icon size = its cell minus the tag line, capped at 72 px.
- **Rows:** a fixed row height (34 px in rows, 22 px in compact), so the slot counts are exact, not guessed.
- **Ring:** sits in the head's own box and never overlaps the list.
- **Empty and stale states:** a model `{ empty }` shows centred dim text. Stale data shows the existing freshness badge.

### 4b. Phones and tablets (a hard requirement from the owner)
- **Board columns:** a phone (< 700 px) always has 2 columns and a tablet (700–1100 px) has 4. On desktop a board keeps its own setting (2–12).
- **Width-4 templates on a narrower board:** a template 4 cells wide never just gets clipped or squeezed. Each one declares a `narrow` twin with the same layers at width ≤ 2: 4×1 → 2×2 and 4×2 → 2×4. The host renders the twin whenever the board has fewer columns than the template is wide. The board tells the host its live column count, measured in `_wFitBoard` and passed on each paint.
- **Touch:**
  - ◀ ▶ and ⚙ are always visible on touch devices. Hover does not exist there.
  - Tap targets are at least 36 px.
  - The sheet is full-screen on a phone.
  - The gallery is 2 columns on a phone, and each card has a size row that scrolls sideways.
- **Lab checks:** the lab page also renders every template at phone width (375 px) and flags overflow there.

### 5. A glance lab page (the QA tool)
`mockups/glance-lab.html` renders the live farm's model for every widget and **every offered template**, side by side at true board sizes, with the board's CSS.
- An auto-check flags overflow (`scrollHeight > clientHeight`), text under 11 px, and an icon grid with unequal columns.
- One page shows everything, so a reviewer can scroll it and nobody has to click through 130 widgets.

### 6. Reuse what exists
- **Models already written by the 8 stopped agents:** these are saved as patches in the scratchpad (`models/*.patch`, about 3,900 lines). They already provide `head` / `items` / `tiles` / `series`, so they are kept and extended (`at` for countdowns, item order) rather than rewritten.
- **Untouched:** board columns (2–12 per board), the sheet, the gallery and ◀ ▶ (host `variant` action), and the size/style settings. A saved `{size, style}` maps onto the template whose old style matches; otherwise it falls back to the template at the natural look.

## Revisions after review (Fable 5.2, medium, 2026-11-26). These override the sections above.
1. **Scale from a reference cell, so slot counts really are constant.** Every template is designed at a 170 px cell, and the whole glance scales with its width: `font-size` comes from container units, and rows, icons and padding are in `em`. A glance board's effective column count is `min(setting, floor(width / 110))`, so a cell is never narrower than 110 px and text never drops below 11 px.
2. **Expected look counts, stated honestly:**
   - **Typical widgets:** about 10–20 distinct looks. Weather, with 4 items, will have about 10.
   - **Rich widgets:** 25 or more, when they have a long list with icons, pct, tiles and a series.
   - **More looks:** come from adding templates to the catalogue (target about 45), never from loosening the rules.
3. **The signature is (presentation, layers, count shown).** Deduplicate only within the same presentation. A 4×1 icon strip is a different presentation from a 1×1 icon grid, so the wide and tall shapes stay. List templates need fill ≥ 75 %. The "head only counts as full" exemption is limited to templates that show nothing but the head.
4. **"Offered" is separate from "renderable."**
   - A saved look always renders while its `needs` hold, even when its fill has dropped. It never changes size by itself; the board must not reflow because data changed.
   - If the `needs` fail, it falls back to the same-size template with the fewest needs, else to number at that size.
   - The ◀ ▶ counter shows "– / N" for a look not in the offered list.
5. **Persistence:**
   - `settings.look = templateId`, added to `cleanSettings`. `size` and `style` are still written alongside for older clients.
   - An explicit old-style → template table maps saved v2 settings.
   - Template ids are never renamed. A test pins the list.
6. **Narrow boards (phone, tablet, 3-column):** each template declares `narrow`, a twin of width ≤ 2 with the same layers. The host picks it from the board's live column count.
7. **Countdowns:**
   - Countdowns get their own `.g-at` class in the glance font, ≥ 11 px, and do not reuse `.growing-bed-time`.
   - The board schedules a re-render at the earliest `at` among its items, so counts, chips and order update when something becomes ready.
8. **One `renderAllLooks(widget, data)` serves three uses:**
   - **(a)** The lab, a hidden `?page=glance-lab` inside `flowers.html` so it has `_wCtx`. Fixture JSON stands in for live loads.
   - **(b)** A "Looks" picker sheet on the board: tap ⚙ → Looks to see every look of this widget at once, real data, pick one.
   - **(c)** The gallery. One card per widget at its natural look, plus "Looks (17)", which opens the same picker. ◀ ▶ stays, and walks same-size looks first so the board reflows less.
9. **Accessibility:**
   - The glance body is `role="button" tabindex="0"`, and Enter opens the sheet.
   - Chips and tags are ≥ 11 px.
   - The nav buttons are ≥ 36 px on touch.
10. **Existing faces:** the 108 hand-written `glance()` faces are replaced by models. The host keeps the `glance()` path until the last widget is migrated, then removes it. A test checks that no widget still has `glance`.
11. **Patches are drafts.** First pilot one, chores/dolls (crafting box, targets, what's ready), on engine v3. Then hand the rest to agents with the lab's `window.__labReport`: a machine-readable list of overflow, small text and uneven grids. Agents fix only what is listed; nobody eyeballs screenshots.
12. **The owner sees it first.** Before any engine work, a static showcase of every template for 3 fixture models: weather (4 items), the crafting queue with countdowns, and one widget with a series. It comes with a "looks per widget" count table, and the owner signs it off. Engine v3 starts after that.

## Steps
1. **Engine v3.** Rewrite the template catalogue in `ui/glance.mjs`, including `templatesFor(model)` (the replacement for `variants`), live countdown items, fixed slot heights, and the CSS tokens. Update the host to store `settings.look = templateId` (the old `size` / `style` still read). Write tests: catalogue fill and dedupe rules, icon grid columns ∈ {1,2,3,4}, countdown markup. *(me)*
2. **Glance lab page** plus the automatic checks. *(me)*
3. **Models.**
   - Apply the 8 patches onto engine v3 and fix any test conflicts.
   - Then 4 agents (Opus, medium) each take one quarter of the widgets. Each agent:
     - checks its widgets in the lab;
     - adds `at`, `pct` and icons where missing;
     - re-orders items by importance;
     - fixes anything the lab flags.
   - They change models only, never the engine.
4. **Review.** I go through the lab myself and send the owner a screenshot or artifact of the lab for one round of feedback before merging. I do not deploy until the owner says "nasaď next".

## Out of scope
- Free resizing by dragging a glance; looks are preset only.
- Per-widget custom templates. The catalogue is shared, so a widget-specific need goes into the catalogue.
- Deploying.

## Risks
- **Too few looks for small widgets** (e.g. weather: 4 items, no series). That is acceptable per the HIG, which says fewer good sizes beat many stretched ones. If the owner wants more, add templates; do not loosen the fill rule.
- **The template catalogue grows ad hoc.** Keep it in one table with a test that every template declares `needs` and `slots`.
