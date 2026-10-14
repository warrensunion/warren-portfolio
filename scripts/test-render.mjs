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
  assert.deepEqual(ids, ['building', 'projects', 'work', 'contests', 'contact']);
});

test('hero bio links into building, projects and work', () => {
  const hero = html.slice(html.indexOf('class="hero'), html.indexOf('id="building"'));
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
  const figs = html.split(/<figure class="fig[" ]/).slice(1);
  assert.ok(figs.length >= 6, `expected at least 6 figures, got ${figs.length}`);
  for (const f of figs) {
    const body = f.slice(0, f.indexOf('</figure>'));
    assert.match(body, /<img class="fig-poster[" ]/);
    assert.match(body, /<span class="fig-readout" aria-hidden="true"><\/span>/);
    assert.match(body, /<figcaption><strong>/);
  }
  const ns = [...html.matchAll(/<span class="fig-n">Fig\. (\d+)<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(ns, figs.map((_, i) => i + 1));
});

test('figure data is valid JSON in data-fig-data', () => {
  const blobs = [...html.matchAll(/data-fig-data='([^']*)'/g)].map((m) => m[1]);
  assert.equal(blobs.length, count(html, /<figure class="fig[" ]/g));
  for (const b of blobs) JSON.parse(b.replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
});

test('every entry renders a title, tags and a figure', () => {
  const entries = html.split(/<article class="(?:entry|track)[" ]/).slice(1);
  const expected = content.sections.reduce((n, s) => n + (s.entries || []).length, 0);
  assert.equal(entries.length, expected);
  assert.ok(expected >= 3);
  for (const e of entries) {
    const body = e.slice(0, e.indexOf('</article>'));
    assert.match(body, /<h3[\s>]/);
    assert.match(body, /class="tags"/);
    assert.match(body, /<figure class="fig[" ]/);
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
  // The description says what the page lists, no more.
  assert.doesNotMatch(head, /Websites|Roblox games/);
  assert.match(head, /University of Waterloo/);
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
  const morphs = [...contact.matchAll(/data-morph="(\d+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(morphs, [['0', 'BTTRURSLF'], ['1', 'Drift'], ['2', 'Stress Test'], ['3', 'Raingarden'], ['4', 'Ghostline'], ['5', 'Terrarium'], ['6', 'HowPolluted'], ['7', 'Archer Hero'], ['8', 'BC Window Coverings']]);
  // No tab stop in the static markup: a still cannot be played; the host adds one once a scene is live.
  assert.equal(count(html, /tabindex=/g), 0);

  // Relative, so the page works at / and under GitHub Pages' /warren-portfolio/.
  assert.match(html, /data-fig="iceberg"[^>]*data-poster-under="posters\/iceberg-under\.webp"/);
  assert.match(html, /<img class="fig-poster" src="posters\/iceberg\.webp"[^>]*loading="eager"/);
});

test('the ring carries its per-project stills for the reduced-motion cross-fade, in morph-link order', () => {
  const ring = html.match(/<figure class="fig"[^>]*data-fig="ring"[^>]*>/)[0];
  const list = ring.match(/data-poster-morph="([^"]+)"/)[1].split(' ');
  assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `posters/ws-${i}.webp`));
  assert.equal(list.length, content.touch.fig.data.objects.length);
});

const tracks = [...html.matchAll(/<article class="track[^"]*" id="([^"]+)" data-track style="--stages:(\d+)">([\s\S]*?)<\/article>/g)];

test('tracks render in page order', () => {
  assert.deepEqual(tracks.map((m) => m[1]), ['bttrurslf', 'drift', 'stress-test', 'raingarden', 'ghostline', 'terrarium', 'bcwc']);
});

test('each track has --stages equal to its stage buttons and stills', () => {
  const want = { bttrurslf: 15, drift: 4, 'stress-test': 4, raingarden: 4, ghostline: 4, terrarium: 5, bcwc: 5 };
  for (const [, id, n, body] of tracks) {
    assert.equal(Number(n), want[id], id + ' --stages');
    const list = body.slice(body.indexOf('<ol class="fig-stages"'), body.indexOf('</ol>'));
    assert.equal(count(list, /<button type="button" data-stage="\d+"/g), want[id], id + ' buttons');
    assert.equal(count(body, /<img class="fig-poster fig-still[^"]*" data-stage="\d+"/g), want[id], id + ' stills');
    assert.equal(count(body, /class="fig-poster fig-still is-on"/g), 1, id + ' one still on');
    assert.equal(count(body, /aria-current="step"/g), 1, id + ' one current step');
  }
});

test('BTTRURSLF is the only feature track', () => {
  const feats = [...html.matchAll(/<article class="track track--feature" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(feats, ['bttrurslf']);
});

test('no iceblock figure remains', () => {
  assert.doesNotMatch(html, /data-fig="iceblock"/);
});

test('track role and dates render, as visible TODOs until supplied', () => {
  for (const sec of content.sections) {
    for (const e of sec.entries || []) {
      assert.ok(html.includes(e.role.replace(/&/g, '&amp;')), e.title + ' role');
      assert.ok(html.includes(e.dates.replace(/&/g, '&amp;')), e.title + ' dates');
    }
  }
});

test('BTTRURSLF renders a tab row whose tabs jump to each tab\'s first stage', () => {
  const body = tracks.find((m) => m[1] === 'bttrurslf')[3];
  // Plain buttons, not ARIA tabs: they jump to a stage like the stage list does, with no tab keyboard model.
  assert.match(body, /<nav class="fig-tabs" aria-label="Screens">/);
  assert.doesNotMatch(body, /role="tab/);
  const tabs = [...body.matchAll(/<button type="button" data-stage="(\d+)" data-tab="(\d+)"( aria-current="true")?[^>]*>([^<]+)</g)];
  assert.deepEqual(tabs.map((t) => [Number(t[1]), t[4]]), [[0, 'Climb'], [3, 'Mereum'], [6, 'Face scan'], [9, 'BTTRmap'], [11, 'BTTRshop'], [13, 'Pro'], [14, 'Stats']]);
  assert.deepEqual(tabs.map((t) => !!t[3]), [true, false, false, false, false, false, false]);
  const lis = [...body.matchAll(/<li data-tab="(\d+)"(?: hidden)?><button type="button" data-stage="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(lis.length, 15);
  assert.deepEqual(lis.filter(([t]) => t === 1).map(([, s]) => s), [3, 4, 5]);
  // Only the first tab's stages show before any script runs.
  assert.equal(count(body, /<li data-tab="\d+" hidden>/g), 12);
});

test('tracks without tabs render no tab row', () => {
  for (const [, id, , body] of tracks) if (id !== 'bttrurslf') assert.doesNotMatch(body, /class="fig-tabs"/);
});

const cards = [...html.matchAll(/<article class="entry entry--card" id="([^"]+)">([\s\S]*?)<\/article>/g)];

test('the smaller projects render as compact cards, their figure pinned at its last stage', () => {
  assert.deepEqual(cards.map((m) => m[1]), ['howpolluted', 'archer-hero']);
  for (const [, id, body] of cards) {
    const fig = body.match(/<figure class="fig fig--card"[^>]*>/)?.[0] || '';
    const stages = JSON.parse(fig.match(/data-stages='([^']*)'/)[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    assert.equal(fig.match(/data-pin="(\d+)"/)?.[1], String(stages.length - 1), id + ' pin');
    // Its poster is the last stage's still, and it has no rail, stage list or stills to walk.
    assert.match(body, new RegExp(`<img class="fig-poster" src="stills/${id}-s${stages.length - 1}\\.webp"`));
    assert.doesNotMatch(body, /fig-stages|fig-still|track-rail/);
  }
});

test('every new project links its live demo and its code', () => {
  for (const id of ['drift', 'stress-test', 'raingarden', 'ghostline']) {
    const body = tracks.find((m) => m[1] === id)[3];
    assert.match(body, new RegExp(`<ul class="project-links"><li><a href="https://warrensunion\\.github\\.io/${id}/"[^>]*>Live demo</a></li><li><a href="https://github\\.com/warrensunion/${id}"[^>]*>Code</a></li></ul>`), id);
  }
});

test('nothing links to the private BTTRURSLF or bcwc repositories', () => {
  assert.doesNotMatch(html, /github\.com\/warrensunion\/(BTTRURSLF|bcwc)\b/i);
});
