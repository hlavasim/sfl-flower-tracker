# iPhone-style widgets — design

## Why
The DASH boards and the ＋ gallery look dated: every widget is a full table, and every gallery preview is the same square. The owner wants it to look and feel like iPhone home-screen widgets: glanceable, pretty, and each widget the size its content needs.

## Chosen approach: two faces (picked by the owner)
Each widget gets a compact **glance face** for boards and the gallery. The full table stays and opens on a tap. The pages (BUMPKIN, ROADMAP…) keep the full tables, in the new look.

Rejected alternatives:
- Restyle only: the boards stay dense tables.
- Glances on DASH only: the gallery and the pages stay inconsistent.

## Design
- **Sizes:** a board is a grid of ~165 px cells. S = 1×1, M = 2×1, L = 2×2, Full = the whole row (today's table). Each pinned copy has its own size (⚙ → Look → Size). The default is the widget's natural size. A widget without a glance face is Full.
- **Glance face:** a new optional `glance(data, ctx, opts) → { size, html }` on a widget. It is built from shared primitives in `ui/glance.mjs`:
  - a big number plus caption;
  - a ring;
  - a progress bar;
  - a sparkline;
  - icon rows (icon · name/sub · value or chip);
  - mini tiles.

  One widget can render S, M and L variants; it chooses what fits.
- **Tap:** tapping a glance opens the full widget in a sheet (iOS-style overlay) with its ⚙. The ✕ or a swipe closes it.
- **Gallery (＋ Add widget):** a dense grid where each preview has its real glance size, so not every preview is a square. An S / M / L switcher on each card works like iOS's size swipe. Widgets without a glance show a live preview at its natural height, not cropped into a square. Search and categories stay.
- **Look, everywhere (boards and pages):**
  - frosted cards with a 24 px radius and a soft shadow;
  - SF / Inter system font;
  - iOS colours: green #30d158, orange, blue #0a84ff, pink;
  - big bold numbers with muted captions;
  - game icons in rounded squares;
  - a subtle gradient background.

  Reference: `mockups/ios-widgets.html`.
- **Data:** no change. A glance reads the same `needs()` data as the full widget.

## Rollout
1. Infrastructure:
   - the glance API and primitives;
   - board grid sizes and the sheet;
   - per-copy size in settings;
   - the new gallery;
   - the iOS theme.

   It also adds glance faces for the most-used widgets: farm value, what's ready, income, buy next, kitchens, ascension, flowers, crafting box, stock, dolls, bumpkin XP, leveling plan.
2. Glance faces for the remaining widgets, in batches by page (parallel agents, one page each).

## Non-goals
- No change to calculations, APIs or data.
- No drag-to-reorder or resize handles yet. Size is set in ⚙.

## Left to the builder
- Exact cell size per breakpoint (phone: 2 columns of S).
- Which S / M / L variants each widget offers.
