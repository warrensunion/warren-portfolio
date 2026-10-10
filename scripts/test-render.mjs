// The page is static HTML rendered from src/content.js, so these checks pin the promises
// the markup makes to readers and to later tasks: one h1, the section order the bio links
// into, gap-free Fig. numbers the figure host relies on, and visible TODO markers instead
// of invented facts.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';
import { content } from '../src/content.js';

const html = renderPage(content, { updated: new Date('2026-10-10') });

const count = (s, re) => (s.match(re) || []).length;

test('exactly one h1', () => {
  assert.equal(count(html, /<h1[\s>]/g), 1);
});

test('sections appear with the expected ids in order', () => {
  const ids = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['work', 'building', 'projects', 'contests', 'contact']);
});

test('hero bio links into work, building and projects', () => {
  const hero = html.slice(html.indexOf('class="hero'), html.indexOf('id="work"'));
  for (const id of ['work', 'building', 'projects']) assert.match(hero, new RegExp(`href="#${id}"`));
});

test('hero bio is one paragraph of at most 220 visible characters', () => {
  const hero = html.slice(html.indexOf('class="hero-text'), html.indexOf('class="hero-fig'));
  const paras = [...hero.matchAll(/<p[\s>][\s\S]*?<\/p>/g)].map((m) => m[0]);
  assert.equal(content.bio.length, 1);
  assert.equal(paras.length, 1);
  const visible = paras[0].replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, 'x');
  assert.ok(visible.length <= 220, `bio is ${visible.length} visible characters`);
});

test('every figure has a poster and Fig. numbers run 1..N with no gaps', () => {
  const figs = html.split('<figure class="fig"').slice(1);
  assert.ok(figs.length >= 6, `expected at least 6 figures, got ${figs.length}`);
  for (const f of figs) {
    const body = f.slice(0, f.indexOf('</figure>'));
    assert.match(body, /<img class="fig-poster"/);
    assert.match(body, /<span class="fig-readout" aria-hidden="true"><\/span>/);
    assert.match(body, /<figcaption><strong>/);
  }
  const ns = [...html.matchAll(/<span class="fig-n">Fig\. (\d+)<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(ns, figs.map((_, i) => i + 1));
});

test('figure data is valid JSON in data-fig-data', () => {
  const blobs = [...html.matchAll(/data-fig-data='([^']*)'/g)].map((m) => m[1]);
  assert.equal(blobs.length, count(html, /<figure class="fig"/g));
  for (const b of blobs) JSON.parse(b.replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
});

test('every entry renders a title, tags and a figure', () => {
  const entries = html.split('<article class="entry"').slice(1);
  const expected = content.sections.reduce((n, s) => n + (s.entries || []).length, 0);
  assert.equal(entries.length, expected);
  assert.ok(expected >= 3);
  for (const e of entries) {
    const body = e.slice(0, e.indexOf('</article>'));
    assert.match(body, /<h3[\s>]/);
    assert.match(body, /class="tags"/);
    assert.match(body, /<figure class="fig"/);
  }
});

test('github, linkedin and resume links appear in header and footer', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
  for (const href of Object.values(content.links)) {
    assert.ok(header.includes(`href="${href}"`), `header missing ${href}`);
    assert.ok(footer.includes(`href="${href}"`), `footer missing ${href}`);
  }
});

test('index.html <head> (title, meta description) has no em or en dashes', () => {
  const head = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<head>([\s\S]*?)<\/head>/)[1];
  assert.equal(count(head, /[—–]/g), 0);
  // The description says what the page lists (one website, one game, one Roblox game), no more.
  assert.doesNotMatch(head, /Websites|Roblox games/);
  const desc = head.match(/<meta name="description" content="([^"]*)"/);
  assert.ok(desc && desc[1].length > 0, 'meta description present');
});

test('no em or en dashes anywhere', () => {
  assert.equal(count(html, /[—–]/g), 0);
});

test('footer carries the build month', () => {
  assert.match(html, /Last updated October 2026/);
});

test('placeholders are visible', () => {
  assert.match(html, /\[TODO:/);
});

test('controller rulings: copy email, live status, morph links, drag hint, under poster', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.match(header, new RegExp(`<button[^>]*data-copy-email[^>]*><span data-email>${content.email}</span></button>`));
  assert.match(html, /data-copy-status[^>]*aria-live="polite"|aria-live="polite"[^>]*data-copy-status/);
  assert.match(html, /Click to copy, or press e anywhere\./);

  const contact = html.slice(html.indexOf('id="contact"'));
  const morphs = [...contact.matchAll(/data-morph="(\d)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(morphs, [['0', 'BC Window Coverings'], ['1', 'BTTRURSLF'], ['2', 'Archer Hero']]);

  const blocks = [...html.matchAll(/<figure class="fig"[^>]*data-fig="iceblock"[^>]*>/g)];
  assert.equal(blocks.length, 3);
  // No tab stop in the static markup: without JS (or as a poster) the block cannot be turned; the host adds it.
  for (const b of blocks) assert.doesNotMatch(b[0], /tabindex/);
  assert.equal(count(html, /tabindex=/g), 0);
  assert.equal(count(html, /Drag or use arrow keys to turn it\./g), 3);

  assert.match(html, /data-fig="iceberg"[^>]*data-poster-under="\/posters\/iceberg-under\.webp"/);
  assert.match(html, /<img class="fig-poster" src="\/posters\/iceberg\.webp"[^>]*loading="eager"/);
});

test('the ring carries its per-project stills for the reduced-motion cross-fade, in morph-link order', () => {
  const ring = html.match(/<figure class="fig"[^>]*data-fig="ring"[^>]*>/)[0];
  const list = ring.match(/data-poster-morph="([^"]+)"/)[1].split(' ');
  assert.deepEqual(list, ['/posters/ws-0.webp', '/posters/ws-1.webp', '/posters/ws-2.webp']);
  assert.equal(list.length, content.touch.fig.data.objects.length);
});
