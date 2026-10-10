// The HowPolluted track figure (spec 5.4): a demo of Warren's HowPolluted, walked by scroll through five
// stages, then handed to the visitor. x = progress * 4:
//   0..1  the globe turns from its idle spin to the demo point (Richmond, BC) and dollies in;
//   1..1.4 the pin drops; the ground there is read from HowPolluted's land mask (mask.js);
//   1.6..2 the globe fades to the painted scene of that ground;
//   2..3  trash falls into a pile (planPile, seeded) or, on water, a slick spreads and pieces bob;
//   2.85+ the result card slides in with HowPolluted's grade for the demo coverage;
//   stage 5 (index 4): the visitor drags, flicks and picks up pieces and the grade follows. Land / Water
//   switch the ground; Globe brings the globe back to spin and click, and the mask decides the ground.
// Every number is a fixed demo value, labelled "Demo, not a measurement". Nothing calls /api.
//
// One WebGL context (the globe) plus one 2D canvas (the scene). The globe's renderer stays alive, hidden,
// while the scene shows. Poster hook: ctx.data.posterState = { stage: i } draws stage i at the end of its
// own stretch, with no motion, for scripts/posters.mjs.
import { Texture } from 'three';
import { createGlobe } from './globe.js';
import { createScene } from './scene.js';
import { createModel } from './model.js';
import { renderCard } from './card.js';
import { groundAt, loadMask } from './mask.js';
import { gradeFor } from './grades.js';
import { pileCoverage } from './litter-sim.js';
import './figure.css';

const BASE = '/howpolluted/';
const DEMO = { lat: 49.17, lon: -123.14, label: 'Richmond, BC' };
const VALUES = { land: 9, water: 6 }; // demo coverage, % (spec 5.4)
const DROP_MS = 1400; // a new pile falls over this long after a switch
// Stills: each stage at the end of its own stretch (x = i is where stage i's motion starts).
const STILL_X = [0, 1.5, 2.5, 3.5, 4];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + src));
    img.src = src;
  });

// HowPolluted's two faces (OFL), added once per page and only when this figure loads, never by the page
// CSS. A slow or failed font is ignored: the card falls back to the system faces in figure.css.
let fontsP = null;
function loadFonts() {
  if (fontsP) return fontsP;
  if (typeof FontFace !== 'function' || !document.fonts) return (fontsP = Promise.resolve());
  const faces = [
    new FontFace('Archivo Expanded', `url(${BASE}fonts/archivo-expanded-latin.woff2) format('woff2')`, { weight: '800 900', stretch: '125%', display: 'swap' }),
    new FontFace('Montserrat', `url(${BASE}fonts/montserrat-latin.woff2) format('woff2')`, { weight: '400 700', display: 'swap' }),
  ];
  const all = Promise.all(
    faces.map((f) =>
      f.load().then(
        () => document.fonts.add(f),
        () => {},
      ),
    ),
  );
  return (fontsP = Promise.race([all, new Promise((r) => setTimeout(r, 2500))]));
}

const fmtPoint = ({ lat, lon }) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

export async function create(stage, ctx) {
  const data = ctx.data || {};
  const poster = data.posterState ? (typeof data.posterState === 'object' ? data.posterState : { stage: 0 }) : null;
  const tier = ctx.tier === 'low' ? 'low' : 'high';
  const debug = new URLSearchParams(location.search).get('debug') === '1';

  // Everything first, so a missing file fails the figure (its stills stay) before a context is spent.
  const [manifest, mask, earth, plateLand, plateWater, fgLand, fgWater, oil, chem] = await Promise.all([
    fetch(BASE + 'art/manifest.json').then((r) => {
      if (!r.ok) throw new Error('manifest: HTTP ' + r.status);
      return r.json();
    }),
    loadMask(BASE + 'globe/land-mask.png'),
    loadImg(BASE + 'globe/earth-2k.webp'),
    loadImg(BASE + 'art/plates/land-1280.webp'),
    loadImg(BASE + 'art/plates/water-1280.webp'),
    loadImg(BASE + 'art/layers/fg-land.webp'),
    loadImg(BASE + 'art/layers/fg-water.webp'),
    loadImg(BASE + 'art/fx/oil.webp'),
    loadImg(BASE + 'art/fx/chemical.webp'),
    loadFonts(),
  ]);
  const keys = Object.keys(manifest).filter((k) => k.startsWith('trash/'));
  const imgs = await Promise.all(keys.map((k) => loadImg(BASE + 'art/' + k).catch(() => null)));
  const sprites = keys.map((k, i) => ({ ...manifest[k], img: imgs[i] })).filter((s) => s.img);
  if (!sprites.length) throw new Error('no trash sprites');
  const images = { plates: { land: plateLand, water: plateWater }, fg: { land: fgLand, water: fgWater }, oil, chem };

  // The ground at the demo point is whatever the mask says there: a real lookup, never hard-coded.
  let place = { ...DEMO };
  let ground = groundAt(mask, place.lat, place.lon);
  let groundFrom = 'mask'; // or 'switch' (the Land / Water buttons)
  const makeModel = (gr) => createModel({ ground: gr, sprites, value: VALUES[gr] });
  let model = makeModel(ground);
  let initialGrade = null;

  // ── DOM: one layer over the stills, holding both canvases (globe first: it is the WebGL one) ──
  const root = document.createElement('div');
  root.className = 'hp';
  const globeCanvas = document.createElement('canvas');
  globeCanvas.className = 'hp-globe';
  root.append(globeCanvas);
  stage.append(root);
  const role = stage.getAttribute('role');
  stage.setAttribute('role', 'group'); // its buttons must stay reachable (role=img hides its children)

  let globe = null;
  let scene = null;
  try {
    const texture = new Texture(earth);
    texture.needsUpdate = true;
    globe = createGlobe(globeCanvas, { texture, tier, onPick: (p) => onPick(p) });
    scene = createScene(root, { manifest, images, model, ground, tier });
  } catch (err) {
    globe?.destroy();
    root.remove();
    if (role) stage.setAttribute('role', role);
    throw err;
  }

  const chip = document.createElement('p');
  chip.className = 'hp-chip';
  const card = renderCard(root, { ground, coverage: VALUES[ground], grade: gradeFor('litter', VALUES[ground]), initialGrade: null, where: '' });
  const controls = document.createElement('div');
  controls.className = 'hp-controls';
  controls.innerHTML =
    '<button type="button" class="hp-btn" data-act="land"><span>Land</span></button>' +
    '<button type="button" class="hp-btn" data-act="water"><span>Water</span></button>' +
    '<button type="button" class="hp-btn hp-btn--ghost" data-act="globe"><span>Globe</span></button>';
  root.append(chip, controls);
  const buttons = Object.fromEntries([...controls.querySelectorAll('button')].map((b) => [b.dataset.act, b]));

  let w = 1;
  let h = 1;
  let compact = false;
  function resize(cw, ch) {
    w = Math.max(1, Math.round(cw));
    h = Math.max(1, Math.round(ch));
    compact = w < 480;
    root.classList.toggle('hp--compact', compact);
    globe.resize(w, h);
    scene.resize(w, h);
    if (!initialGrade) initialGrade = gradeFor('litter', Number(model.coverage().toFixed(1)));
  }
  resize(stage.clientWidth || 800, stage.clientHeight || 500);

  // ── State ──
  let mode = 'scene'; // or 'globe' (stage 5's Globe button)
  let picked = false; // a globe click is showing its pin before the scene comes back
  let dropAt = -Infinity; // when a switched-in pile started falling
  let interactive = false;
  let lastCover = 0;
  let pickTimer = 0;

  function setGround(gr, from) {
    ground = gr;
    groundFrom = from;
    model = makeModel(gr);
    scene.set({ model, ground });
    initialGrade = gradeFor('litter', Number(model.coverage().toFixed(1)));
    dropAt = performance.now();
    press = null;
  }

  function enterGlobe() {
    mode = 'globe';
    picked = false;
    press = null;
    globe.interactive(true);
  }
  function leaveGlobe() {
    mode = 'scene';
    picked = false;
    clearTimeout(pickTimer);
    globe.interactive(false);
  }
  function onPick(p) {
    if (mode !== 'globe' || picked) return;
    picked = true;
    place = { lat: p.lat, lon: p.lon, label: fmtPoint(p) };
    const gr = groundAt(mask, p.lat, p.lon);
    // Show the pin on the picked point for a moment, then the scene of the mask's ground there.
    pickTimer = setTimeout(() => {
      if (destroyed) return;
      leaveGlobe();
      setGround(gr, 'mask');
    }, 700);
  }

  controls.addEventListener('click', (e) => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    if (!act || !interactive) return;
    if (act === 'globe') return mode === 'globe' ? leaveGlobe() : enterGlobe();
    if (mode === 'globe') leaveGlobe();
    setGround(act, 'switch');
  });

  // ── Pointer: grab, drag, flick, click to pick (stage 5 only). No wheel listener anywhere. ──
  let press = null;
  const local = (e) => {
    const r = root.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onDown = (e) => {
    if (!interactive || e.button > 0 || e.target.closest('button, .hp-card')) return;
    if (mode === 'globe') {
      if (globe.pointer.down(e)) root.setPointerCapture?.(e.pointerId);
      return;
    }
    const [x, y] = local(e);
    const id = model.grabAt(x, y);
    if (id == null) return;
    const now = performance.now();
    press = { id, pointerId: e.pointerId, x0: x, y0: y, t0: now, dragging: false, samples: [[now, x, y]] };
    root.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (mode === 'globe') return globe.pointer.move(e);
    if (!press || e.pointerId !== press.pointerId) return;
    const [x, y] = local(e);
    if (!press.dragging && Math.hypot(x - press.x0, y - press.y0) > 6) press.dragging = true;
    if (!press.dragging) return;
    model.drag(press.id, x, y);
    const now = performance.now();
    press.samples.push([now, x, y]);
    while (press.samples.length > 2 && now - press.samples[0][0] > 80) press.samples.shift();
  };
  const onUp = (e) => {
    if (mode === 'globe') return globe.pointer.up(e);
    if (!press || e.pointerId !== press.pointerId) return;
    const p = press;
    press = null;
    const quick = performance.now() - p.t0 < 250;
    if (!p.dragging && quick && e.type === 'pointerup') {
      model.pickAt(p.x0, p.y0);
      return;
    }
    let vx = 0;
    let vy = 0;
    if (p.dragging) {
      const [t0, x0, y0] = p.samples[0];
      const [t1, x1, y1] = p.samples[p.samples.length - 1];
      if (t1 - t0 > 0 && performance.now() - t1 < 80) {
        vx = ((x1 - x0) / (t1 - t0)) * 1000;
        vy = ((y1 - y0) / (t1 - t0)) * 1000;
      }
    }
    model.release(p.id, vx, vy);
  };
  const listeners = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onUp],
  ];
  for (const [type, fn] of listeners) root.addEventListener(type, fn);

  // ── Frame ──
  let raf = 0;
  let running = false;
  let last = 0;
  let clock = 0;
  let readyFired = false;
  let destroyed = false;
  let cardK = -1;

  function paint(rawMs) {
    const dt = Math.min(rawMs, 100) / 1000;
    const stageIx = poster ? Math.min(4, poster.stage || 0) : ctx.stage();
    const x = poster ? STILL_X[stageIx] : clamp01(ctx.progress()) * 4;
    if (!poster) clock += dt;
    const was = interactive;
    interactive = !poster && stageIx === 4;
    if (was && !interactive) {
      if (mode === 'globe') leaveGlobe();
      if (press) {
        model.release(press.id, 0, 0);
        press = null;
      }
    }
    root.classList.toggle('is-interactive', interactive);
    root.classList.toggle('is-globe', mode === 'globe');

    // The globe: aimed by scroll, or the visitor's in globe mode.
    const fade = mode === 'globe' ? 0 : clamp01((x - 1.6) / 0.4);
    if (mode !== 'globe') {
      globe.aim(place, clamp01(x));
      globe.setPin(place, clamp01(x - 1) / 0.4);
    } else {
      globe.setPin(place, 1);
    }
    globe.setVisible(fade < 1 || !readyFired);
    globe.render(poster ? 0 : rawMs);
    globeCanvas.style.opacity = String(1 - fade);

    // The scene: the pile falls with scroll (and again, briefly, after a switch).
    if (interactive) model.step(dt); // a held piece is skipped by the model
    const drop = clamp01((performance.now() - dropAt) / DROP_MS);
    const fall = Math.min(clamp01(x - 2), poster ? 1 : drop);
    if (fade > 0 || !readyFired) scene.draw({ fall, spill: fall, t: poster ? 0 : clock });
    scene.canvas.style.opacity = String(fade);

    // What is on the ground now: the tally the card and the readout show.
    const rect = model.rect();
    const down = model.items().filter((it) => scene.landed(it, fall));
    const cover = rect && down.length ? pileCoverage(down, rect) : 0;
    lastCover = cover;
    const shown = Number(cover.toFixed(1));

    // The card: from x 2.85, sliding in over 0.15.
    const k = mode === 'globe' ? 0 : clamp01((x - 2.85) / 0.15);
    if (k !== cardK) {
      cardK = k;
      card.el.style.opacity = String(k);
      card.el.style.visibility = k > 0 ? 'visible' : 'hidden';
      card.el.style.setProperty('--hp-slide', `${((1 - k) * 40).toFixed(1)}px`);
    }
    card.el.classList.toggle('is-mini', compact && stageIx === 4);
    if (k > 0) {
      const where =
        groundFrom === 'switch'
          ? `Ground: ${ground}, switched by you.`
          : `${place.label === DEMO.label ? 'Demo point: Richmond, BC' : 'Your point: ' + place.label}. Ground: ${ground}, from the land mask.`;
      card.update({ ground, coverage: shown, grade: gradeFor('litter', shown), initialGrade, where });
    }

    // The chip: what the globe is showing, until the card takes over.
    let chipText = '';
    if (mode === 'globe') chipText = picked ? `${place.label}: ${groundAt(mask, place.lat, place.lon)}, from the land mask` : 'Drag to spin. Click a place: the land mask says land or water.';
    else if (x < 1) chipText = `Demo point: ${DEMO.label}, ${fmtPoint(DEMO)}`;
    else if (x < 2.85) chipText = `Ground: ${ground}, ${groundFrom === 'mask' ? 'from the land mask' : 'switched by you'} (demo)`;
    if (chip.textContent !== chipText) chip.textContent = chipText;
    chip.hidden = !chipText;

    controls.hidden = stageIx !== 4;
    buttons.land.setAttribute('aria-pressed', String(mode !== 'globe' && ground === 'land'));
    buttons.water.setAttribute('aria-pressed', String(mode !== 'globe' && ground === 'water'));
    buttons.globe.setAttribute('aria-pressed', String(mode === 'globe'));
  }

  const frame = (now) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(frame);
    const rawMs = last ? now - last : 16.7;
    last = now;
    paint(rawMs);
    ctx.frame?.(rawMs);
    if (!readyFired) {
      readyFired = true;
      stage.dispatchEvent(new Event('fig:ready'));
    }
  };

  if (debug) {
    window.__hp = {
      items: () => model.items(),
      coverage: () => model.coverage(),
      ground: () => ground,
      interactive: () => interactive,
    };
  }

  return {
    start() {
      if (running || destroyed) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      if (press) {
        model.release(press.id, 0, 0);
        press = null;
      }
    },
    resize(cw, ch) {
      if (destroyed || !cw || !ch) return;
      resize(cw, ch);
    },
    readout() {
      if (!readyFired) return '';
      const s = ctx.stage();
      const n = ctx.stages || 5;
      // A phone plate's head has room for about 15 characters; the chip and the card carry the rest.
      if (compact) {
        if (mode === 'globe') return `${s + 1}/${n}, globe`;
        if (s === 0) return `1/${n}, demo point`;
        if (s === 1) return `2/${n}, ${ground}`;
        return `${s + 1}/${n}, ${lastCover.toFixed(1)}% demo`;
      }
      if (mode === 'globe') return `stage ${s + 1} of ${n}, globe: click a place, demo`;
      if (s === 0) return `stage 1 of ${n}, demo point: ${DEMO.label}`;
      // The ground stage names its source; later stages have the number instead (the card names the source).
      if (s === 1) return `stage 2 of ${n}, ground: ${ground}, ${groundFrom === 'mask' ? 'from the land mask' : 'switched by you'}`;
      return `stage ${s + 1} of ${n}, ground: ${ground}, ${lastCover.toFixed(1)}% demo`;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(pickTimer);
      for (const [type, fn] of listeners) root.removeEventListener(type, fn);
      if (debug) delete window.__hp;
      try {
        scene.destroy();
        globe.destroy();
      } catch {}
      root.remove();
      if (role) stage.setAttribute('role', role);
    },
  };
}

