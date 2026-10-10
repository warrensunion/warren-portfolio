# yuzeli.ca and this page, side by side

Made by `npm run compare` on 2026-10-10. yuzeli.ca is on the left and this page is on the right, at the
same viewport (1440x900, 1920x1080 and 390x844) and the same named positions. These images are only for
judging the borrowed techniques by eye. No image, word or character of yuzeli.ca ships on this page.

## What matches, on purpose (measured on yuzeli.ca)

- The text column sticks at 96 px under a 60 px bar, and releases when its bottom meets the end of its
  figure column (`work`, `project`, `project-mid`).
- The grid ratio is about 5:7 with a gap of about 86 px at 1440, and the content column is 1180 px.
- Figure plates have the same anatomy: an LED, "Fig. N", a title and a live readout in the head, then a
  caption below.
- A figure only runs while it is in the middle half of the viewport, and it loads about one screen ahead.
- On phones it is one column with the text above the figure, and nothing sticks.

## What differs, on purpose

- **Scroll stages.** yuzeli.ca draws each figure once over `top 85%` to `center 45%`. Here each project is a
  tall track whose figure walks through stages (85svh of scroll each, after yuzeli.ca's 85% pin length).
- **Feature entry.** yuzeli.ca's TopsOJ entry (`feature`) puts its text above stacked full-width figures and
  has no tabs. BTTRURSLF keeps the sticky text beside one wide plate, with tabs, as Warren asked.
- **Breakpoint.** yuzeli.ca switches at 881 px and this page at 860 px. At 390 px both are single column.
- **Paper, type and figures.** All of these are this page's own: Source Serif 4, IBM Plex Mono, the meltwater
  accent, and figures that are live demos of Warren's projects.
