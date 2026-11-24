// Turns src/content.js into the page's static HTML at dev and build time, so the page reads
// fully without JavaScript and the figure host only upgrades markup that is already there.
// Pure string functions with no DOM, so Node tests and the Vite plugin can both call them.
//
// The page is a climb (the Ascent redesign): every section is a numbered log with an altitude
// (data-alt), which the world (src/world/) reads to move its camera, and which the page shows as a log
// line. Behind it all sits the world's backdrop: a still per log for the page without WebGL.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

import { contestsLabel } from './figures/contests/figure.js';

const ext = (href) => /^https?:/.test(href);
const link = (href, text, attrs = '') =>
  `<a href="${esc(href)}"${attrs}${ext(href) ? ' rel="me noopener"' : ''}>${esc(text)}</a>`;
const pad2 = (n) => String(n).padStart(2, '0');
const metres = (m) => `${Number(m).toLocaleString('en-US')} m`;
const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ');

function linkList(links, cls) {
  return (
    `<ul class="${cls}">` +
    `<li>${link(links.resume, 'Résumé', ' type="application/pdf"')}</li>` +
    `<li>${link(links.github, 'GitHub')}</li>` +
    `<li>${link(links.linkedin, 'LinkedIn')}</li>` +
    `</ul>`
  );
}

// A log's marker line: LOG 03 · 2,100 m · Icefall, in the mono voice.
const logMark = (log, total) =>
  `<p class="log-mark"><span class="log-n">LOG ${pad2(log.n)}<span class="log-of"> / ${pad2(total)}</span></span>` +
  `<span class="log-alt">${esc(metres(log.alt))}</span><span class="log-name">${esc(log.name)}</span></p>`;

// Figures are numbered in document order; the counter is threaded through one render call.
function figure(fig, n, { eager = false } = {}) {
  const [w, h] = fig.size || [1200, 900];
  // Single-quoted attribute: only & and ' need escaping, so the JSON stays readable in the source.
  const json = JSON.stringify(fig.data || {}).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  // No tabindex here: a poster cannot be played, so the host adds the tab stop once a scene is live.
  const attrs = [
    `class="fig"`,
    `data-fig="${esc(fig.kind)}"`,
    `data-fig-data='${json}'`,
    fig.posterUnder ? `data-poster-under="${esc(fig.posterUnder)}"` : '',
    fig.posterMorph ? `data-poster-morph="${esc(fig.posterMorph.join(' '))}"` : '',
    `aria-label="Fig. ${n}: ${esc(fig.title)}"`,
  ].filter(Boolean);
  return (
    `<figure ${attrs.join(' ')}>` +
    `<div class="fig-head"><span class="fig-n">Fig. ${n}</span><span class="fig-t">${esc(fig.title)}</span>` +
    `<span class="fig-readout" aria-hidden="true"></span></div>` +
    `<div class="fig-stage" role="img" aria-label="${esc(fig.alt || fig.title)}">` +
    `<img class="fig-poster" src="${esc(fig.poster)}" alt="" width="${w}" height="${h}" ` +
    `loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async"></div>` +
    `<figcaption><strong>${esc(fig.stat)}</strong> <em>${esc(fig.caption)}</em>` +
    `</figcaption></figure>`
  );
}

// The world's backdrop: a still of the climb for each log (the page without WebGL, reduced motion,
// ?static=1), under a scrim that keeps the text column readable. The canvas joins it once the world runs.
function world(logs) {
  const stills = logs
    .map(
      (l, i) =>
        `<img class="world-still${i === 0 ? ' is-on' : ''}" data-log="${i}" src="posters/world-${i}.webp" alt="" ` +
        `width="1600" height="1000" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async"${i === 0 ? ' fetchpriority="high"' : ''}>`,
    )
    .join('');
  return `<div class="world" aria-hidden="true">${stills}<div class="world-scrim"></div></div>`;
}

function header(c) {
  return (
    `<header class="bar"><div class="bar-in">` +
    `<p class="bar-id"><a class="bar-name" href="#top" translate="no">${esc(c.name)}</a>` +
    `<span class="bar-read" data-hud="bar" aria-hidden="true">LOG 01 · 0 m · −4.0 °C</span></p>` +
    `<nav class="bar-nav" aria-label="Links">${linkList(c.links, 'bar-links')}` +
    `<button type="button" class="email-btn" data-copy-email translate="no"><span data-email>${esc(c.email)}</span></button>` +
    `<span class="copy-status" data-copy-status role="status" aria-live="polite"></span>` +
    `</nav></div></header>`
  );
}

function hud(h) {
  const rows = h.rows
    .map(([label, key, v]) => `<div class="hud-row"><dt>${esc(label)}</dt><dd data-hud="${esc(key)}">${esc(v)}</dd></div>`)
    .join('');
  return (
    `<div class="hud" role="group" aria-label="The climb, modelled">` +
    `<p class="hud-cap"><span class="hud-n">Fig. 0</span> ${esc(h.caption)}</p>` +
    `<dl class="hud-grid">${rows}</dl>` +
    `<p class="hud-hint">${esc(h.hint)}</p></div>`
  );
}

function hero(c, total) {
  return (
    `<div class="hero log" id="top" data-alt="${c.hero.log.alt}"><div class="hero-text">` +
    logMark(c.hero.log, total) +
    `<h1 translate="no">${esc(c.name)}</h1>` +
    c.bio.map((p) => `<p class="lede">${p}</p>`).join('') +
    hud(c.hero.hud) +
    `</div></div>`
  );
}

// The line that opens a log: its marker and one sentence, in the big quiet voice of yuzeli's logs.
const logLine = (log, total) =>
  `<div class="log-line">${logMark(log, total)}${log.line ? `<p class="log-say">${esc(log.line)}</p>` : ''}</div>`;

// Log 02: every project as a block of ice. Without WebGL (or JS) it is this ordered list of links; with
// it, the list stays the keyboard path and the blocks float up through the sticky stage beside it.
function index(c, total) {
  const all = c.sections.flatMap((s) => s.entries || []);
  const items = all
    .map((e, i) => {
      const first = strip(e.pitch || e.body[0]).split(/(?<=\.)\s/)[0];
      return (
        `<li><a class="ice-link" href="#${esc(e.id)}" data-block="${i}" data-symbol="${esc(e.symbol || '')}" ` +
        `data-meta="${esc(e.tags.slice(0, 2).join(' / '))}" data-date="${esc(/TODO/.test(e.dates) ? '' : e.dates)}">` +
        `<span class="ice-code" aria-hidden="true">PROJECT_${pad2(i + 1)}</span>` +
        `<span class="ice-name">${esc(e.title)}</span><span class="ice-what">${esc(first)}</span></a></li>`
      );
    })
    .join('');
  return (
    `<section class="section section--index log" id="index" data-alt="${c.index.log.alt}" aria-labelledby="index-h" style="--blocks:${all.length}">` +
    logLine(c.index.log, total) +
    `<div class="ice-head"><h2 id="index-h" class="log-h">${esc(c.index.title)}</h2><p class="lede">${esc(c.index.lede)}</p></div>` +
    `<div class="ice-pin"><ol class="ice-list">${items}</ol>` +
    `<div class="ice-stage" aria-hidden="true"></div></div>` +
    `</section>`
  );
}

function entry(e, next) {
  const title = e.href ? link(e.href, e.title) : esc(e.title);
  return (
    `<article class="entry"><div class="entry-text">` +
    `<h3>${title}</h3>` +
    `<p class="meta"><span>${esc(e.role)}</span><span>${esc(e.dates)}</span></p>` +
    e.body.map((p) => `<p>${p}</p>`).join('') +
    `<p class="tags" translate="no">${esc(e.tags.join(', '))}</p>` +
    `</div><div class="entry-fig">${figure(e.fig, next())}</div></article>`
  );
}

// A track (spec section 3): sticky text beside a rail whose figure walks through stages. Every stage
// ships a still, so the figure reads without JS, under reduced motion and before its demo loads; stage 0
// is the one shown at first paint, the rest are lazy.
function trackFigure(fig, n, id) {
  const [w, h] = fig.size || [1280, 800];
  const json = JSON.stringify(fig.data || {}).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  const labels = JSON.stringify(fig.stages.map((s) => s.label)).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  // With tabs, each stage belongs to the last tab that starts at or before it; only tab 0's show at first.
  const tabOf = (i) => (fig.tabs ? fig.tabs.reduce((k, t, j) => (t.first <= i ? j : k), 0) : -1);
  const tabs = fig.tabs
    ? `<nav class="fig-tabs" aria-label="Screens">` +
      fig.tabs
        .map(
          (t, j) =>
            `<button type="button" data-stage="${t.first}" data-tab="${j}"${j === 0 ? ' aria-current="true"' : ''} aria-controls="${esc(id)}-stage">${esc(t.label)}</button>`,
        )
        .join('') +
      `</nav>`
    : '';
  const steps = fig.stages
    .map(
      (s, i) =>
        (fig.tabs ? `<li data-tab="${tabOf(i)}"${tabOf(i) ? ' hidden' : ''}>` : '<li>') +
        `<button type="button" data-stage="${i}" aria-controls="${esc(id)}-stage"${i === 0 ? ' aria-current="step"' : ''}>` +
        `<span class="fig-step-n">${i + 1}</span> ${esc(s.label)}</button></li>`,
    )
    .join('');
  const stills = fig.stages
    .map(
      (s, i) =>
        `<img class="fig-poster fig-still${i === 0 ? ' is-on' : ''}" data-stage="${i}" src="${esc(s.still)}" ` +
        `alt="" width="${w}" height="${h}" loading="lazy" decoding="async">`,
    )
    .join('');
  return (
    `<figure class="fig fig--track" data-fig="${esc(fig.kind)}" data-fig-data='${json}' data-stages='${labels}' ` +
    `aria-label="Fig. ${n}: ${esc(fig.title)}" style="--fig-ar:${w}/${h}">` +
    `<div class="fig-head"><span class="fig-led" aria-hidden="true"></span><span class="fig-n">Fig. ${n}</span>` +
    `<span class="fig-t">${esc(fig.title)}</span><span class="fig-readout" aria-hidden="true"></span></div>` +
    tabs +
    `<ol class="fig-stages" aria-label="Stages">${steps}</ol>` +
    `<div class="fig-stage" id="${esc(id)}-stage" role="img" aria-label="${esc(fig.alt || fig.title)}">${stills}</div>` +
    `<figcaption><strong>${esc(fig.stat)}</strong> <em>${esc(fig.caption)}</em>` +
    (fig.hint ? ` <span class="fig-hint">${esc(fig.hint)}</span>` : '') +
    `</figcaption></figure>`
  );
}

// A project's own links (its live demo, its code), under its tags.
function projectLinks(e) {
  if (!e.links || !e.links.length) return '';
  return `<ul class="project-links">${e.links.map((l) => `<li>${link(l.href, l.label)}</li>`).join('')}</ul>`;
}

// A compact card (README, "How the page is laid out"): the entry layout, text beside one plate, for the
// smaller projects. The plate shows the track's last still and its live figure pinned at that last stage,
// the one the visitor plays with, so there is no rail to scroll through.
function cardFigure(fig, n, id) {
  const [w, h] = fig.size || [1280, 800];
  const json = JSON.stringify(fig.data || {}).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  const labels = JSON.stringify(fig.stages.map((s) => s.label)).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  const last = fig.stages.length - 1;
  return (
    `<figure class="fig fig--card" data-fig="${esc(fig.kind)}" data-fig-data='${json}' data-stages='${labels}' data-pin="${last}" ` +
    `aria-label="Fig. ${n}: ${esc(fig.title)}" style="--fig-ar:${w}/${h}">` +
    `<div class="fig-head"><span class="fig-led" aria-hidden="true"></span><span class="fig-n">Fig. ${n}</span>` +
    `<span class="fig-t">${esc(fig.title)}</span><span class="fig-readout" aria-hidden="true"></span></div>` +
    `<div class="fig-stage" id="${esc(id)}-stage" role="img" aria-label="${esc(fig.alt || fig.title)}">` +
    `<img class="fig-poster" src="${esc(fig.stages[last].still)}" alt="" width="${w}" height="${h}" loading="lazy" decoding="async"></div>` +
    `<figcaption><strong>${esc(fig.stat)}</strong> <em>${esc(fig.caption)}</em>` +
    (fig.hint ? ` <span class="fig-hint">${esc(fig.hint)}</span>` : '') +
    `</figcaption></figure>`
  );
}

function card(e, next) {
  const title = e.href ? link(e.href, e.title) : esc(e.title);
  return (
    `<article class="entry entry--card" id="${esc(e.id)}"><div class="entry-text">` +
    `<h3>${title}</h3>` +
    `<p class="meta"><span>${esc(e.role)}</span><span>${esc(e.dates)}</span></p>` +
    e.body.map((p) => `<p>${p}</p>`).join('') +
    `<p class="tags" translate="no">${esc(e.tags.join(', '))}</p>` +
    projectLinks(e) +
    `</div><div class="entry-fig">${cardFigure(e.fig, next(), e.id)}</div></article>`
  );
}

// BTTRURSLF's lead row, yuzeli's lead work entry: the pitch, the real numbers (src/data/bttr-stats.json,
// a visible TODO for any that could not be measured) and the live iceberg from its start screen.
function lead(e, next, stats) {
  const fmt = (n) => (Number.isFinite(n) && n > 0 ? Number(n).toLocaleString('en-US') : null);
  const nums = [
    [fmt(stats?.routes), 'screens you can open', 'screen count'],
    [fmt(stats?.apiRoutes), 'server routes', 'server route count'],
    [fmt(stats?.tests), 'automated tests', 'test count'],
  ];
  return (
    `<div class="lead"><div class="lead-text">` +
    `<p class="lead-kicker">PROJECT_01 · The one I am building</p>` +
    `<p class="lead-pitch">${esc(e.pitch)}</p>` +
    `<dl class="lead-stats">` +
    nums.map(([n, what, todo]) => `<div><dt>${esc(n || `[TODO: ${todo}]`)}</dt><dd>${esc(what)}</dd></div>`).join('') +
    `</dl>` +
    (stats?.measuredAt ? `<p class="lead-note">Counted from its repository on ${esc(stats.measuredAt)}.</p>` : '') +
    `</div><div class="lead-fig">${figure(e.lead.fig, next())}</div></div>`
  );
}

function track(e, next, stats) {
  const title = e.href ? link(e.href, e.title) : esc(e.title);
  return (
    (e.lead ? lead(e, next, stats) : '') +
    `<article class="track${e.feature ? ' track--feature' : ''}" id="${esc(e.id)}" data-track style="--stages:${e.fig.stages.length}">` +
    `<div class="track-text"><h3>${title}</h3>` +
    `<p class="meta"><span>${esc(e.role)}</span><span>${esc(e.dates)}</span></p>` +
    e.body.map((p) => `<p>${p}</p>`).join('') +
    `<p class="tags" translate="no">${esc(e.tags.join(', '))}</p>` +
    projectLinks(e) +
    `</div><div class="track-rail">${trackFigure(e.fig, next(), e.id)}</div></article>`
  );
}

function contests(c, s, next) {
  const rows = c.contests
    .map(
      (r) =>
        `<li><span class="contest-name">${esc(r.name)}</span>` +
        `<span class="contest-meta">${esc(r.year)}, ${esc(r.result)}</span></li>`,
    )
    .join('');
  // Only tools the projects on the page actually carry in their tags.
  const used = new Set(c.sections.flatMap((x) => (x.entries || []).flatMap((e) => e.tags)));
  const kit = (c.toolkit || [])
    .map(([group, tools]) => [group, tools.filter((t) => used.has(t))])
    .filter(([, tools]) => tools.length)
    .map(([group, tools]) => `<div class="kit-row"><dt>${esc(group)}</dt><dd translate="no">${esc(tools.join(', '))}</dd></div>`)
    .join('');
  return (
    `<div class="entry entry--contests"><div class="entry-text">` +
    `<h3 class="sub">Contests and awards</h3>` +
    (s.lede ? `<p>${esc(s.lede)}</p>` : '') +
    `<ol class="contest-list">${rows}</ol>` +
    (kit ? `<h3 class="sub">Toolkit</h3><dl class="kit">${kit}</dl>` : '') +
    `</div><div class="entry-fig">${figure({ ...s.fig, alt: contestsLabel(c.contests) }, next())}</div></div>`
  );
}

function touch(c, s, next) {
  // Each project that has a ring object morphs the particles into it (data-morph = its object's index).
  const objects = c.touch.fig.data.objects.map((o) => o.slug);
  const projects = c.sections
    .flatMap((sec) => (sec.entries || []).map((e) => ({ id: e.id || sec.id, title: e.title, ring: e.ring })))
    .map((p) => {
      const k = p.ring ? objects.indexOf(p.ring) : -1;
      return `<li><a href="#${esc(p.id)}"${k >= 0 ? ` data-morph="${k}"` : ''}>${esc(p.title)}</a></li>`;
    })
    .join('');
  return (
    `<div class="touch-fig">${figure(c.touch.fig, next())}</div>` +
    `<div class="touch"><div class="touch-text">` +
    `<p class="lede">${c.touch.line}</p>` +
    `<p class="touch-email"><button type="button" class="email-btn email-btn--big" data-copy-email translate="no"><span data-email>${esc(c.email)}</span></button>` +
    `<span class="copy-status copy-status--inline" data-copy-status role="status" aria-live="polite"></span></p>` +
    `<p class="hint">${esc(c.touch.hint)}</p>` +
    linkList(c.links, 'inline-links') +
    `</div><div class="touch-side"><p>${esc(c.touch.projectsLine)}</p>` +
    `<ul class="touch-projects">${projects}</ul></div></div>`
  );
}

function section(c, s, next, total, stats) {
  let inner;
  if (s.id === 'contests') inner = contests(c, s, next);
  else if (s.id === 'contact') inner = touch(c, s, next);
  else inner = s.entries.map((e) => (e.compact ? card(e, next) : e.fig && e.fig.stages ? track(e, next, stats) : entry(e, next))).join('');
  return (
    `<section class="section log" id="${esc(s.id)}"${s.log ? ` data-alt="${s.log.alt}"` : ''} aria-labelledby="${esc(s.id)}-h">` +
    (s.log ? logLine(s.log, total) : '') +
    `<h2 id="${esc(s.id)}-h" class="log-h">${esc(s.title)}</h2>${inner}</section>`
  );
}

function footer(c, updated) {
  const month = updated.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    `<footer class="foot"><div class="foot-in">` +
    `<p>${esc(c.name)}. Last updated ${esc(month)}</p>` +
    linkList(c.links, 'foot-links') +
    `</div></footer>`
  );
}

export function renderPage(content, { updated = new Date(), stats = null } = {}) {
  let n = 0;
  const next = () => ++n;
  const logs = [content.hero.log, content.index.log, ...content.sections.filter((s) => s.log).map((s) => s.log)];
  const total = logs.length;
  return (
    `<a class="skip" href="#main">Skip to content</a>` +
    world(logs) +
    header(content) +
    `<main id="main">` +
    hero(content, total) +
    index(content, total) +
    content.sections.map((s) => section(content, s, next, total, stats)).join('') +
    `</main>` +
    footer(content, updated)
  );
}
