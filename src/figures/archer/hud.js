// The game's HUD in DOM over the canvas, laid out like the game's own (original styling, no copied UI
// art): "Stage 1" and "N left" at the top, coins top left, a bottom panel with health and "Your level",
// the Q (Dodge) and E (arrow rain) buttons bottom right with cooldown rings, and per enemy a projected
// "Lv. N" tag with a health bar, plus damage numbers that rise and fade. Everything here ignores the
// pointer except the Q and E buttons, the "Click to play" prompt and the end panel. Sizes scale with the
// stage through --ah-s, so the HUD fits the plate from a phone to a wide desktop.
import * as THREE from 'three';
import { DODGE, RAIN, HIT_LIFE, XP } from './sim.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

const ICON = {
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f6c443" stroke="#b9861d" stroke-width="2"/><path d="M12 6.5v11M9 9.5h4.5a2 2 0 0 1 0 4H10.5a2 2 0 0 0 0 4H15" fill="none" stroke="#b9861d" stroke-width="1.6" stroke-linecap="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.8 12 21 12 21z" fill="#ff4d5e" stroke="#9e1f2e" stroke-width="1.4"/></svg>',
  foe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-4.4 0-8 3-8 7.2 0 2.4 1.2 4 2.8 5v3.3h2.6V20h1.6v-1.5h2V20h1.6v-1.5h2.6v-3.3c1.6-1 2.8-2.6 2.8-5C20 6 16.4 3 12 3z" fill="#fff"/><circle cx="9" cy="11" r="2" fill="#2a2f35"/><circle cx="15" cy="11" r="2" fill="#2a2f35"/></svg>',
  dodge: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 30c8-2 15-7 22-16M8 36c10-1 19-6 27-16M16 38c8 0 15-3 22-10" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>',
  rain: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 22a8 8 0 0 1 1-15.6A10 10 0 0 1 34 9a6.5 6.5 0 0 1 0 13z" fill="#fff"/><path d="M17 26v14M24 26v14M31 26v14" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M13.5 36.5 17 41l3.5-4.5M20.5 36.5 24 41l3.5-4.5M27.5 36.5 31 41l3.5-4.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

function cooldownRing() {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'ah-ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVGNS, 'circle');
  const arc = document.createElementNS(SVGNS, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('cx', '24');
    c.setAttribute('cy', '24');
    c.setAttribute('r', String(RING_R));
    svg.append(c);
  }
  track.setAttribute('class', 'ah-ring-track');
  arc.setAttribute('class', 'ah-ring-arc');
  arc.setAttribute('stroke-dasharray', RING_C.toFixed(2));
  arc.setAttribute('transform', 'rotate(-90 24 24)');
  return { svg, arc };
}

export function createHud(el, { onPlay = () => {}, onSkill = () => {} } = {}) {
  const hud = h('div', 'ah-hud');
  hud.setAttribute('aria-hidden', 'true'); // the figure's readout carries the state for assistive tech

  const top = h('div', 'ah-top');
  const stageName = h('div', 'ah-stage-name', '<span class="ah-rule"></span><span>Stage 1</span><span class="ah-rule"></span>');
  const left = h('div', 'ah-left', ICON.foe + '<span class="ah-left-n">8 left</span>');
  top.append(stageName, left);
  const leftN = left.querySelector('.ah-left-n');

  const coins = h('div', 'ah-coins', ICON.coin + '<span class="ah-num ah-coins-n">0</span>');
  const coinsN = coins.querySelector('.ah-coins-n');

  const panel = h('div', 'ah-panel');
  panel.innerHTML =
    '<div class="ah-row">' + ICON.heart + '<div class="ah-bar ah-bar--hp"><i></i></div><span class="ah-num ah-hp-n">100/100</span></div>' +
    '<div class="ah-row ah-row--lv"><span class="ah-diamond"><b>1</b></span>' +
    '<div class="ah-lv"><span class="ah-lv-label">Your level</span><div class="ah-bar ah-bar--xp"><i></i></div></div></div>';
  const hpBar = panel.querySelector('.ah-bar--hp i');
  const hpN = panel.querySelector('.ah-hp-n');
  const xpBar = panel.querySelector('.ah-bar--xp i');
  const lvN = panel.querySelector('.ah-diamond b');

  // Q and E: plain divs, not buttons, so a tap leaves focus on the figure (a focused button would blur it
  // and release every held key). The keyboard has Q and E themselves.
  const skills = h('div', 'ah-skills');
  const skill = (cls, key, name, icon, action) => {
    const b = h('div', 'ah-skill ' + cls);
    const ring = cooldownRing();
    b.append(ring.svg, h('span', 'ah-skill-icon', icon), h('span', 'ah-key', key));
    if (name) b.append(h('span', 'ah-skill-name', name));
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSkill(action);
    });
    skills.append(b);
    return ring.arc;
  };
  const qArc = skill('ah-skill--q', 'Q', 'Dodge', ICON.dodge, 'dodge');
  const eArc = skill('ah-skill--e', 'E', '', ICON.rain, 'rain');

  const tags = h('div', 'ah-tags');
  const dmg = h('div', 'ah-dmgs');
  const stick = h('div', 'ah-stick', '<div class="ah-stick-knob"></div>');

  hud.append(tags, dmg, top, coins, panel, skills, stick);

  // The prompt and the end panel take the pointer and the keyboard, so they live outside aria-hidden.
  const overlay = h('div', 'ah-overlay');
  const prompt = h('button', 'ah-prompt');
  prompt.type = 'button';
  prompt.textContent = 'Click to play';
  prompt.hidden = true;
  prompt.addEventListener('click', () => onPlay());
  const end = h('div', 'ah-end');
  end.hidden = true;
  end.setAttribute('role', 'dialog');
  end.setAttribute('aria-label', 'Stage over');
  overlay.append(prompt, end);

  el.append(hud, overlay);

  // Pools for the projected tags and numbers.
  const tagPool = [];
  const dmgPool = [];
  const tagFor = (i) => {
    while (tagPool.length <= i) {
      const t = h('div', 'ah-tag', '<span class="ah-tag-lv"></span><span class="ah-tag-bar"><i></i></span>');
      tags.append(t);
      tagPool.push({ el: t, lv: t.querySelector('.ah-tag-lv'), bar: t.querySelector('i'), text: '', on: false });
    }
    return tagPool[i];
  };
  const dmgFor = (i) => {
    while (dmgPool.length <= i) {
      const d = h('div', 'ah-dmg');
      dmg.append(d);
      dmgPool.push({ el: d, text: '', on: false });
    }
    return dmgPool[i];
  };
  const show = (item, on) => {
    if (item.on !== on) {
      item.on = on;
      item.el.style.display = on ? '' : 'none';
    }
  };

  const v = new THREE.Vector3();
  const project = (x, y, z, camera, size) => {
    v.set(x, y, z).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * size.w, (-v.y * 0.5 + 0.5) * size.h];
  };

  let last = { left: '', coins: '', hp: '', lv: '', hpW: -1, xpW: -1, q: -1, e: -1, s: '' };
  const set = (key, value, fn) => {
    if (last[key] !== value) {
      last[key] = value;
      fn(value);
    }
  };

  return {
    hud,
    stick,
    sync(state, camera, size) {
      const s = Math.max(0.6, Math.min(1.5, size.w / 760)).toFixed(3);
      set('s', s, (x) => hud.style.setProperty('--ah-s', x));
      const a = state.archer;
      set('left', state.left + ' left', (t) => (leftN.textContent = t));
      set('coins', String(state.coins), (t) => (coinsN.textContent = t));
      set('hp', `${Math.ceil(a.hp)}/${a.maxHp}`, (t) => (hpN.textContent = t));
      set('hpW', Math.round((a.hp / a.maxHp) * 1000), (k) => (hpBar.style.transform = `scaleX(${k / 1000})`));
      set('xpW', Math.round((state.xp / XP.perLevel) * 1000), (k) => (xpBar.style.transform = `scaleX(${k / 1000})`));
      set('lv', String(state.level), (t) => (lvN.textContent = t));
      set('q', Math.round((a.dodgeCd / DODGE.cooldown) * 200), (k) => {
        qArc.style.strokeDashoffset = ((k / 200) * RING_C).toFixed(2);
        qArc.parentNode.parentNode.classList.toggle('is-cooling', k > 0);
      });
      set('e', Math.round((a.rainCd / RAIN.cooldown) * 200), (k) => {
        eArc.style.strokeDashoffset = ((k / 200) * RING_C).toFixed(2);
        eArc.parentNode.parentNode.classList.toggle('is-cooling', k > 0);
      });

      // Tags over each enemy: "Lv. N" and a health bar.
      let i = 0;
      for (const e of state.enemies) {
        const p = camera && project(e.x, e.boss ? 4.4 : 1.95, e.z, camera, size);
        if (!p || p[0] < -40 || p[0] > size.w + 40 || p[1] < -20 || p[1] > size.h + 20) continue;
        const t = tagFor(i++);
        show(t, true);
        const text = 'Lv. ' + e.level;
        if (t.text !== text) t.lv.textContent = t.text = text;
        t.el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
        t.bar.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp).toFixed(3)})`;
        t.el.classList.toggle('is-boss', e.boss);
      }
      for (let k = i; k < tagPool.length; k++) show(tagPool[k], false);

      // Damage numbers: rise 30 px and fade over their life.
      let j = 0;
      for (const hit of state.hits) {
        const p = camera && project(hit.x, hit.y, hit.z, camera, size);
        if (!p) continue;
        const d = dmgFor(j++);
        show(d, true);
        const text = String(hit.amount);
        if (d.text !== text) d.el.textContent = d.text = text;
        const k = hit.age / HIT_LIFE;
        d.el.style.transform = `translate(${p[0].toFixed(1)}px, ${(p[1] - 30 * k * Number(s)).toFixed(1)}px)`;
        d.el.style.opacity = Math.min(1, (1 - k) / 0.4).toFixed(3); // full, then fading over the last 40%
      }
      for (let k = j; k < dmgPool.length; k++) show(dmgPool[k], false);
    },
    /** 0..1: the HUD fades in during the fly-in. */
    setFade(k) {
      set('fade', k.toFixed(2), (x) => (hud.style.opacity = x));
    },
    setPlaying(on) {
      hud.classList.toggle('is-playing', !!on);
    },
    showPrompt(text = 'Click to play') {
      end.hidden = true;
      prompt.textContent = text;
      prompt.hidden = false;
    },
    hidePrompt() {
      prompt.hidden = true;
      end.hidden = true;
    },
    showEnd(status, robloxUrl, onAgain) {
      prompt.hidden = true;
      end.innerHTML = '';
      const title = h('p', 'ah-end-title');
      title.textContent = status === 'won' ? 'Stage cleared' : 'The archer fell';
      const again = h('button', 'ah-again');
      again.type = 'button';
      again.textContent = 'Play again';
      again.addEventListener('click', () => onAgain?.());
      end.append(title, again);
      if (robloxUrl) {
        const link = h('a', 'ah-roblox');
        link.href = robloxUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Play the full game on Roblox';
        end.append(link);
      }
      end.hidden = false;
    },
    get endShown() {
      return !end.hidden;
    },
    get promptShown() {
      return !prompt.hidden;
    },
    destroy() {
      hud.remove();
      overlay.remove();
    },
  };
}
