// Turns src/content.js into the page's static HTML at dev and build time, so the page reads
// fully without JavaScript and the figure host only upgrades markup that is already there.
// Pure string functions with no DOM, so Node tests and the Vite plugin can both call them.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

import { contestsLabel } from './figures/contests/figure.js';


const ext = (href) => /^https?:/.test(href);
const link = (href, text, attrs = '') =>
  `<a href="${esc(href)}"${attrs}${ext(href) ? ' rel="me noopener"' : ''}>${esc(text)}</a>`;

function linkList(links, cls) {
  return (
    `<ul class="${cls}">` +
    `<li>${link(links.resume, 'Résumé', ' type="application/pdf"')}</li>` +
    `<li>${link(links.github, 'GitHub')}</li>` +
    `<li>${link(links.linkedin, 'LinkedIn')}</li>` +
    `</ul>`
  );
}

// Figures are numbered in document order; the counter is threaded through one render call.
function figure(fig, n, { hero = false } = {}) {
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
    `loading="${hero ? 'eager' : 'lazy'}"${hero ? ' fetchpriority="high"' : ''} decoding="async"></div>` +
    `<figcaption><strong>${esc(fig.stat)}</strong> <em>${esc(fig.caption)}</em>` +
    `</figcaption></figure>`
  );
}

function header(c) {
  return (
    `<header class="bar"><div class="bar-in">` +
    `<a class="bar-name" href="#top" translate="no">${esc(c.name)}</a>` +
    `<nav class="bar-nav" aria-label="Links">${linkList(c.links, 'bar-links')}` +
    `<button type="button" class="email-btn" data-copy-email translate="no"><span data-email>${esc(c.email)}</span></button>` +
    `<span class="copy-status" data-copy-status role="status" aria-live="polite"></span>` +
    `</nav></div></header>`
  );
}

function hero(c, next) {
  return (
    `<div class="hero" id="top"><div class="hero-text">` +
    `<h1 translate="no">${esc(c.name)}</h1>` +
    c.bio.map((p) => `<p class="lede">${p}</p>`).join('') +
    `</div><div class="hero-fig">${figure(c.hero.fig, next(), { hero: true })}</div></div>`
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
    ? `<div class="fig-tabs" role="tablist" aria-label="Screens">` +
      fig.tabs
        .map(
          (t, j) =>
            `<button type="button" role="tab" data-stage="${t.first}" data-tab="${j}" aria-selected="${j === 0}" aria-controls="${esc(id)}-stage">${esc(t.label)}</button>`,
        )
        .join('') +
      `</div>`
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
    `<figcaption><strong>${esc(fig.stat)}</strong> <em>${esc(fig.caption)}</em></figcaption></figure>`
  );
}

function track(e, next) {
  const title = e.href ? link(e.href, e.title) : esc(e.title);
  return (
    `<article class="track${e.feature ? ' track--feature' : ''}" id="${esc(e.id)}" data-track style="--stages:${e.fig.stages.length}">` +
    `<div class="track-text"><h3>${title}</h3>` +
    `<p class="meta"><span>${esc(e.role)}</span><span>${esc(e.dates)}</span></p>` +
    e.body.map((p) => `<p>${p}</p>`).join('') +
    `<p class="tags" translate="no">${esc(e.tags.join(', '))}</p>` +
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
  return (
    `<div class="entry entry--contests"><div class="entry-text">` +
    (s.lede ? `<p>${esc(s.lede)}</p>` : '') +
    `<ol class="contest-list">${rows}</ol>` +
    `</div><div class="entry-fig">${figure({ ...s.fig, alt: contestsLabel(c.contests) }, next())}</div></div>`
  );
}

function touch(c, s, next) {
  const projects = c.sections
    .flatMap((sec) => (sec.entries || []).map((e) => ({ id: sec.id, title: e.title })))
    .map((p, i) => `<li><a href="#${esc(p.id)}" data-morph="${i}">${esc(p.title)}</a></li>`)
    .join('');
  return (
    `<div class="touch"><div class="touch-text">` +
    `<p class="lede">${c.touch.line}</p>` +
    `<p class="touch-email"><button type="button" class="email-btn email-btn--big" data-copy-email translate="no"><span data-email>${esc(c.email)}</span></button>` +
    `<span class="copy-status copy-status--inline" data-copy-status role="status" aria-live="polite"></span></p>` +
    `<p class="hint">${esc(c.touch.hint)}</p>` +
    linkList(c.links, 'inline-links') +
    `</div><div class="touch-side"><p>${esc(c.touch.projectsLine)}</p>` +
    `<ul class="touch-projects">${projects}</ul></div></div>` +
    `<div class="touch-fig">${figure(c.touch.fig, next())}</div>`
  );
}

function section(c, s, next) {
  let inner;
  if (s.id === 'contests') inner = contests(c, s, next);
  else if (s.id === 'contact') inner = touch(c, s, next);
  else inner = s.entries.map((e) => (e.fig && e.fig.stages ? track(e, next) : entry(e, next))).join('');
  return `<section class="section" id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-h">` +
    `<h2 id="${esc(s.id)}-h">${esc(s.title)}</h2>${inner}</section>`;
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

export function renderPage(content, { updated = new Date() } = {}) {
  let n = 0;
  const next = () => ++n;
  return (
    `<a class="skip" href="#main">Skip to content</a>` +
    header(content) +
    `<main id="main">` +
    hero(content, next) +
    content.sections.map((s) => section(content, s, next)).join('') +
    `</main>` +
    footer(content, updated)
  );
}
