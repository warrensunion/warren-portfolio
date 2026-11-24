// Sound, off by default: wind (filtered noise whose level and pitch follow the HUD's wind), a crunch of
// snow as the page scrolls, and a clink of ice when a block of the igloo lands. All synthesised with
// WebAudio, no files. The audio context is made only on the first switch-on (a user gesture), and is
// suspended again when switched off. The bar's button says Sound: Off / On.
import { subscribe, state } from '../world/boot.js';
import { windAt } from '../world/climb.js';

export function initSound({ tools, reduced }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'bar-tool bar-sound';
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<span class="bar-sound-t">Sound: Off</span><span class="bar-sound-bar" aria-hidden="true"><i></i></span>';
  tools.append(b);
  const label = b.querySelector('.bar-sound-t');
  const meter = b.querySelector('.bar-sound-bar i');

  let ac = null;
  let on = false;
  let wind = null;
  let noiseBuf = null;
  let lastY = scrollY;
  let crunchAcc = 0;
  let lastClink = 0;

  function makeNoise(ctx) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: softer than white, like wind
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }
  function boot() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = makeNoise(ac);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(ac.destination);
    src.start();
    wind = { bp, g };
  }
  function crunch(k) {
    if (!ac || !on) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 + Math.random() * 1500;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * k, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(hp).connect(g).connect(ac.destination);
    src.start(t, Math.random() * 1.5, 0.12);
  }
  function clink(n = 1) {
    if (!ac || !on) return;
    const now = ac.currentTime;
    if (now - lastClink < 0.06) return;
    lastClink = now;
    const base = 1700 + Math.random() * 900;
    for (const [mul, amp] of [[1, 0.07], [2.76, 0.035], [5.4, 0.015]]) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * mul;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp * Math.min(1.5, n), now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 / mul + 0.08);
      o.connect(g).connect(ac.destination);
      o.start(now);
      o.stop(now + 0.6);
    }
  }
  function set(v) {
    on = v;
    if (on && !ac) boot();
    if (ac) on ? ac.resume() : ac.suspend();
    b.setAttribute('aria-pressed', String(on));
    label.textContent = on ? 'Sound: On' : 'Sound: Off';
  }
  b.addEventListener('click', () => set(!on));

  subscribe((st, dt) => {
    const w = windAt(st.alt, st.motion ? st.time : 0);
    meter.style.transform = `scaleX(${on ? Math.min(1, w / 80).toFixed(3) : 0.15})`;
    if (!ac || !on) return;
    const t = ac.currentTime;
    wind.g.gain.setTargetAtTime(Math.min(0.22, 0.03 + w / 450), t, 0.3);
    wind.bp.frequency.setTargetAtTime(260 + w * 9, t, 0.4);
    // a crunch every ~70 px of scroll, louder when quick
    const dy = Math.abs(scrollY - lastY);
    lastY = scrollY;
    crunchAcc += dy;
    if (crunchAcc > 70 && !reduced) {
      crunchAcc = 0;
      crunch(Math.min(1, 0.4 + st.speed / 3000));
    }
    void dt;
  });
  void state;
  return {
    clink,
    toggle: () => set(!on),
    get on() {
      return on;
    },
  };
}
