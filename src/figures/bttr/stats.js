// The Stats tab (spec 5.2): real numbers only, each with when and how it was counted, in the manner of
// yuzeli.ca's big readouts. They come from src/data/bttr-stats.json, which scripts/bttr-stats.mjs writes
// at build time. A number that could not be measured shows as a visible [TODO], never a guess.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');

export function statRows(s) {
  return [
    s.accounts != null
      ? { n: fmt(s.accounts), what: s.accounts === 1 ? 'account' : 'accounts', how: `As of ${s.accountsAsOf}. ${s.methods.accounts}` }
      : { n: '[TODO: account count]', what: '', how: s.methods?.accounts || '' },
    { n: fmt(s.routes), what: 'screens you can open', how: s.methods.routes },
    { n: fmt(s.apiRoutes), what: 'server routes, each rate limited', how: s.methods.apiRoutes },
    { n: fmt(s.tests), what: `automated tests in ${fmt(s.testFiles)} files`, how: s.methods.tests },
  ];
}

export function renderStats(host, s) {
  const el = document.createElement('div');
  el.className = 'bs';
  el.innerHTML =
    `<dl class="bs-grid">` +
    statRows(s)
      .map((r) => `<div class="bs-row"><dt class="bs-n">${esc(r.n)}</dt><dd><span class="bs-what">${esc(r.what)}</span><span class="bs-how">${esc(r.how)}</span></dd></div>`)
      .join('') +
    `</dl><p class="bs-foot">Counted from the BTTRURSLF repository and its Supabase project on ${esc(s.measuredAt)}.</p>`;
  el.hidden = true;
  host.append(el);
  return { el, show: (on) => (el.hidden = !on), destroy: () => el.remove() };
}
