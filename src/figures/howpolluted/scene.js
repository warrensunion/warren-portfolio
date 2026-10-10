// Ported from HowPolluted src/screens/scene/litter.js at 80f6d06 (Warren's own project). Changes: driven by
// scroll, not time (draw({ fall, spill, t }) is a pure picture of where the track is: piece i starts falling
// at fall = it.t * 0.8 and lands 0.2 later, and spill is the slick's radius factor); the plate and the
// foreground layer are drawn into the one 2D canvas (cover-fit as the source's CSS placed them, the
// foreground sliding up from 12% as the pile falls) instead of being <img> layers, so the figure holds
// exactly two canvases; the pile comes from the demo model (model.js), which plans it with the source's
// planPile and lets the visitor move and pick pieces; the slick's area follows the remaining coverage;
// no router, hint, tally, parallax, skip-on-click or window listeners; the card column is reserved only
// on a wide stage. The drawing rules (fall curve, spin, contact shadow, ripple ring, bobbing, the
// wobbling oil and chemical slick) are the source's.
//
// The painted plate (land or water) with its foreground layer in front and, between them, litter that
// falls and piles up until it covers the demo share of the ground. On water the pieces float and bob,
// and an oil and chemical slick spreads under them.

const FALL_START = 0.8; // share of the fall stretch over which pieces start
const FALL_TIME = 0.2; // share of the fall stretch from the sky to the ground

// The card's column at the right of a wide stage (figure.css: right 16px, width min(300px, 40%)).
export const CARD_RESERVE = (w) => (w >= 480 ? Math.min(300, w * 0.4) + 28 : 0);

// The wobbling outline of the source's slick.
function blob(g, cx, cy, rx, ry, seed) {
  g.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
    const wob = 1 + 0.13 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 + seed * 2) + 0.05 * Math.sin(a * 9 + seed * 3);
    const x = cx + Math.cos(a) * rx * wob;
    const y = cy + Math.sin(a) * ry * wob;
    a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
}

export function createScene(host, { manifest, images, model, ground, tier = 'high' }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hp-scene';
  host.appendChild(canvas);
  const g = canvas.getContext('2d');
  const dprMax = tier === 'high' ? 2 : 1;
  const patterns = { oil: g.createPattern(images.oil, 'repeat'), chem: g.createPattern(images.chem, 'repeat') };
  let w = 1;
  let h = 1;
  let dpr = 1;
  let plateBox = null;

  function layout() {
    const img = images.plates[ground];
    const meta = manifest[`plates/${ground}-1280.webp`];
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const pw = img.naturalWidth * k;
    const ph = img.naturalHeight * k;
    plateBox = { x: (w - pw) / 2, y: (h - ph) * 0.6, w: pw, h: ph };
    // The pile stays where it can be seen: below the horizon, above the foreground foliage's lowest line
    // (~78% of the height), and left of the card's column on a wide stage.
    const horizon = plateBox.y + meta.horizon * ph;
    model.layout({ w: w - CARD_RESERVE(w), top: horizon + h * 0.03, bottom: h * 0.8 });
  }

  function resize(cw, ch) {
    w = Math.max(1, Math.round(cw));
    h = Math.max(1, Math.round(ch));
    dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    layout();
  }

  function drawSlick(k, t) {
    const rect = model.rect();
    const cover = model.coverage();
    if (!rect || !(k > 0) || !(cover > 0)) return;
    const span = rect.bottom - rect.top;
    // Spill area = the remaining coverage's share of the water band.
    const area = Math.min(1, cover / 100) * rect.w * span;
    const ry = Math.sqrt(area / (Math.PI * (rect.w / span) * 0.9));
    const rx = ry * (rect.w / span) * 0.9;
    const cx = rect.w * 0.55;
    const cy = rect.top + span * 0.45;
    const seed = 1.7;
    g.save();
    blob(g, cx, cy, rx * k, ry * k, seed);
    g.clip();
    g.globalAlpha = 0.85;
    g.fillStyle = patterns.oil;
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.translate(-cx + ((t * 12) % 512), -cy);
    g.fillRect(cx - rx * 2, cy - rx * 4, rx * 4 + 1024, rx * 8);
    g.restore();
    g.globalAlpha = 0.45;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = patterns.chem;
    g.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
    g.restore();
    g.save();
    g.globalAlpha = 0.7;
    g.strokeStyle = '#2b2d3a';
    g.lineWidth = 1.5;
    blob(g, cx, cy, rx * k, ry * k, seed);
    g.stroke();
    g.restore();
  }

  function drawFg(fgIn) {
    const img = images.fg[ground];
    // The source's CSS: 80 px wider than the plate, its bottom 30 px below it, at least 70% tall,
    // cover-fit to the centre bottom, sliding up from 12% of its height.
    const W = w + 80;
    const H = Math.max((W * img.naturalHeight) / img.naturalWidth, h * 0.7);
    const top = h + 30 - H + 0.12 * H * (1 - fgIn);
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const iw = img.naturalWidth * k;
    const ih = img.naturalHeight * k;
    g.save();
    g.beginPath();
    g.rect(-40, top, W, H);
    g.clip();
    g.drawImage(img, -40 + (W - iw) / 2, top + H - ih, iw, ih);
    g.restore();
  }

  // Which pieces are on the ground at this point of the fall.
  const landed = (it, fall) => fall >= it.t * FALL_START + FALL_TIME;

  function draw({ fall = 1, spill = 1, t = 0 } = {}) {
    const water = ground === 'water';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const plate = images.plates[ground];
    g.drawImage(plate, plateBox.x, plateBox.y, plateBox.w, plateBox.h);
    if (water) drawSlick(Math.min(1, Math.max(0, spill)), t);
    for (const it of model.items()) {
      const start = it.t * FALL_START;
      const s = (fall - start) / FALL_TIME;
      if (s <= 0) continue;
      const dw = it.sprite.w * it.scale;
      const dh = it.sprite.h * it.scale;
      let y = it.y;
      let rot = it.rot;
      if (s < 1) {
        // gravity: y from above the plate, accelerating
        y = -dh - 40 + (it.y + dh + 40) * s * s;
        rot = it.rot + (1 - s) * (it.flip ? 2.2 : -2.2);
      } else if (water) {
        y += Math.sin(t * 1.6 + it.x * 0.05) * 2.2;
      }
      g.save();
      g.translate(it.x, y);
      if (s >= 1) {
        // contact shadow, or a ripple ring on water
        g.save();
        g.scale(1, 0.28);
        g.beginPath();
        g.ellipse(0, 0, dw * 0.46, dw * 0.46, 0, 0, Math.PI * 2);
        if (water) {
          g.strokeStyle = 'rgba(241,237,229,0.55)';
          g.lineWidth = 2.5;
          g.stroke();
        } else {
          g.fillStyle = 'rgba(43,45,58,0.16)';
          g.fill();
        }
        g.restore();
      }
      g.rotate(rot);
      if (it.flip) g.scale(-1, 1);
      g.drawImage(it.sprite.img, -it.sprite.anchor[0] * it.scale, -it.sprite.anchor[1] * it.scale, dw, dh);
      g.restore();
    }
    drawFg(Math.min(1, Math.max(0, fall / 0.3)));
  }

  return {
    canvas,
    draw,
    resize,
    landed,
    // A new pile (the Land / Water switch, or a globe pick) on its own ground.
    set(next) {
      model = next.model;
      ground = next.ground;
      layout();
    },
    destroy() {
      canvas.remove();
    },
  };
}
