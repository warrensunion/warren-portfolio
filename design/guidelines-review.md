# Web Interface Guidelines review

Rules: vercel-labs/web-interface-guidelines `command.md`, fetched 2026-10-10 (the web-design-guidelines skill's
source). Reviewed: index.html, src/styles/*.css, src/figures/iceblock/figure.css, src/render.js (the page's
markup), src/main.js, src/chrome/copyEmail.js, src/figures/host.js, and the DOM and accessibility parts of the
figure modules. The ported three.js scene internals were skipped. Line numbers are after the fixes.
Each finding says FIXED, or KEPT with the reason.

## index.html

pass. Zoom is allowed (no maximum-scale or user-scalable=no). `lang="en"` is set. theme-color #f4f3ee
matches the paper. The critical serif is preloaded, and every face uses `font-display: swap`
(src/styles/tokens.css).

## src/render.js

- src/render.js:58 - FIXED: brand name not marked untranslatable. Added `translate="no"` to the bar name,
  the h1 (:69), both email buttons (:60, :111) and the tags line of tool names (:82).
- src/render.js:39 - FIXED (in src/figures/host.js:103): a drag figure kept its tab stop, and its
  "Drag or use arrow keys to turn it." hint stayed visible (:50), under reduced motion, `?static=1`, no WebGL2
  or Save-Data, where the poster cannot turn. A lasting fallback now removes the tabindex and hides the hint.
  A context loss leaves both alone, because the scene comes back.
- src/render.js:146 - pass: skip link to `#main`. Checked in Chromium: the first Tab shows "Skip to content"
  at the top with the accent outline, Enter moves focus into main, and the next Tab lands on the first bio link.
- src/render.js:48 - pass: every poster has width and height. Below-the-fold posters are lazy, and the hero
  poster is eager with `fetchpriority="high"` (it is the LCP element in every Lighthouse run).
- src/render.js:61 - pass: the copy status is a polite live region (`role="status"`).
- src/render.js:131 - pass: the footer date is formatted with Intl (`toLocaleString`, en-US, UTC).
- KEPT: "Title Case for headings and buttons" and "second person, avoid first person". Spec section 3 sets
  sentence case everywhere, and a portfolio speaks in its owner's first person.

## src/styles/base.css

- src/styles/base.css:91 - FIXED: no `touch-action: manipulation` on tap targets. Added it to `a`, `button`
  and `[tabindex]`. The ice block stage's own `pan-y` still wins inside the stage, because touch-action
  intersects up the tree.
- src/styles/base.css:11 - FIXED: tap highlight left to the browser default. It is now a faint accent.
- src/styles/base.css:94 - pass: `:focus-visible` gives every focusable element a 2 px accent outline,
  offset 3 px. A Tab walk over the whole page showed it on all 22 stops (skip link, bar, bio links, the three
  drag figures, the contact button and links, the project links, and the footer). That walk ran before the
  fallback fix. Under a lasting fallback the three figures now drop out of the order.
- src/styles/base.css:14 - pass: `scroll-padding-top` keeps anchors and focused elements clear of the
  sticky bar.
- src/styles/base.css:75 - KEPT: `text-decoration-color` transition (not transform or opacity). It is a
  150 ms fade on an underline, has no layout cost, and paints only the link.

## src/styles/layout.css

- src/styles/layout.css:44 - FIXED: "Warren Sun" in the bar had no hover feedback. It now underlines on hover.
- src/styles/layout.css:376 - FIXED: at 320 px the bar wrapped. "Warren Sun" broke onto two lines and
  LinkedIn dropped below. The name no longer wraps (:40), and below 380 px and 340 px the bar's gaps and
  type step down, so the bar stays on one line at 320 px (checked at 320, 340, 379 and 390).
- src/styles/layout.css:20, :83, :283 - KEPT: border-color, background-color and color transitions on the
  bar hairline, the email button and the project links. These are short paint-only fades on small
  elements, and none of them animates layout.
- pass: no `transition: all` anywhere. Hover states exist on the bar links, the email buttons, the
  project links and every underlined link.

## src/styles/figure.css

- src/styles/figure.css:22 - FIXED: "Fig. N" could break between the word and the number in a squeezed
  head row. It is now `nowrap`.
- src/styles/figure.css:27 - FIXED: the figure title, a flex child, had no `min-width: 0`. A long title can
  now wrap inside the head instead of pushing the readout out.
- pass: the readout uses tabular numerals and does not wrap. Every transition is opacity only.

## src/figures/iceblock/figure.css

pass. While dragging, the stage disables text selection (`user-select: none`). `touch-action: pan-y` keeps
vertical page scrolling on phones.

## src/main.js

pass. The bar hairline uses an IntersectionObserver sentinel, not a scroll listener.

## src/chrome/copyEmail.js

- src/chrome/copyEmail.js:57 - pass: the failure message gives the fix ("Press Ctrl+C to copy") and selects
  the address.
- src/chrome/copyEmail.js:36 - KEPT: `navigator.platform` is deprecated. It only picks "Cmd" or "Ctrl" in
  that message, and it falls back to the user agent.
- pass: the `e` shortcut is ignored in inputs, in contenteditable, with modifiers and on key repeat, and the
  contact hint documents it.

## src/figures/host.js

- src/figures/host.js:103 - FIXED: see src/render.js:39 above.
- pass: canvases, the fps meter and the readout are `aria-hidden`. The stage carries `role="img"` and
  the scene's description. Rect reads happen only inside rAF or IntersectionObserver callbacks.

## src/figures/iceblock/figure.js, label.js

pass. The drag gesture has a keyboard alternative: the arrow keys work while the figure is focused, and
`preventDefault` keeps the page from scrolling. The label layer is `aria-hidden` (label.js:94).

## src/figures/ring/morphLinks.js

pass. The morph follows focus as well as hover, so keyboard users get the same reshaping. The links are
real anchors.

## src/figures/contests/figure.js

pass. The chart is `aria-hidden`. The stage's aria-label is rebuilt from the same rows as the marks
(:108). The empty state is intentional and says how to fill it.

## Taste pre-flight (built dist/index.html)

- Em dashes and en dashes in visible copy and in alt, aria-label and title text: 0. Also checked: no
  "...", straight quotes, middle dots or arrows.
- Eyebrows: 0. No `text-transform: uppercase` in the page CSS. The only uppercase text is the ported
  Plex labels inside the ice block figures, as spec section 3 allows.
- One accent (#1f5f78): used for links, focus, the copy status and the figures' one ink.
- Focus visible everywhere, and the skip link works (see base.css and render.js above).
- Contrast, WCAG 2 ratios computed from the tokens composited over each surface:

| text token | on paper #f4f3ee | on plate #fbfbf8 | on stage #eef0f1 | AA (4.5:1) |
|---|---|---|---|---|
| --ink #17191c | 15.85:1 | 16.99:1 | 15.41:1 | pass |
| --ink-2 rgba(23,25,28,.72) | 6.62:1 | 6.85:1 | 6.53:1 | pass |
| --ink-3 rgba(23,25,28,.62) | 4.75:1 | 4.87:1 | 4.70:1 | pass |
| --accent #1f5f78 | 6.37:1 | 6.83:1 | 6.19:1 | pass |
| ice block leader, ink at .7 | 6.19:1 | 6.39:1 | 6.10:1 | pass (non-text, 3:1 needed) |

The tightest case is --ink-3 on the stage colour, at 4.70:1. Captions, meta and dates use --ink-3 on paper
or plate (4.75:1 and up).
