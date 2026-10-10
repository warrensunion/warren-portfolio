// The Appearance tab's interactive end (spec 5.2): BTTRURSLF's dashboard cards rebuilt here as new code,
// over the last frame of the clip, so the visitor can flip them. Each card is a button laid over the spot
// its card has in the recording; its two faces are crops of that recording (the piece closed, the card
// open). Hover, focus or tap flips it to the closed piece and back. Pixels only; no BTTRURSLF code.

export function createPuzzle(host, { base, cards }) {
  const layer = document.createElement('div');
  layer.className = 'bp';
  layer.hidden = true;
  for (const c of cards) {
    const [x, y, w, h] = c.rect;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bp-card';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `Flip the ${c.kind} card`);
    b.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`;
    b.innerHTML =
      `<span class="bp-face bp-face--open"><img src="${base}/${c.open}" alt="" draggable="false"></span>` +
      `<span class="bp-face bp-face--closed"><img src="${base}/${c.closed}" alt="" draggable="false"></span>`;
    const set = (on) => b.setAttribute('aria-pressed', String(on));
    let touched = false;
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && set(true));
    b.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && set(false));
    b.addEventListener('pointerdown', (e) => (touched = e.pointerType !== 'mouse'));
    b.addEventListener('focus', () => !touched && set(true));
    b.addEventListener('blur', () => set(false));
    b.addEventListener('click', () => {
      if (touched) set(b.getAttribute('aria-pressed') !== 'true');
      touched = false;
    });
    layer.append(b);
  }
  host.append(layer);
  return {
    show(on) {
      if (layer.hidden === !on) return;
      layer.hidden = !on;
      if (!on) for (const b of layer.children) b.setAttribute('aria-pressed', 'false');
    },
    destroy: () => layer.remove(),
  };
}
