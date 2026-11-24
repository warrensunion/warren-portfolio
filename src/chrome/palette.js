// The command palette: Ctrl+K (Cmd+K on a Mac) or the bar's button opens a small dialog listing every
// log, every project and the page's links and actions. Typing filters, arrows move, Enter runs, Esc
// closes and gives focus back. Inside it, `e` is just a letter; outside it, `e` still copies the email.

export function initPalette(root, { tools, content, world, sound }) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bar-tool bar-k';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');
  btn.innerHTML = `<span aria-hidden="true">${isMac ? '⌘' : 'Ctrl'} K</span><span class="vh">Open the command palette</span>`;
  tools.append(btn);

  const dlg = document.createElement('dialog');
  dlg.className = 'palette';
  dlg.setAttribute('aria-label', 'Command palette');
  dlg.innerHTML =
    `<div class="pal-box"><input class="pal-in" type="text" placeholder="Jump to a log, a project, or a link" aria-label="Search commands" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="pal-list">` +
    `<ul class="pal-list" id="pal-list" role="listbox"></ul><p class="pal-foot"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> go <kbd>Esc</kbd> close <kbd>e</kbd> copy email (outside the box)</p></div>`;
  document.body.append(dlg);
  const input = dlg.querySelector('.pal-in');
  const list = dlg.querySelector('.pal-list');

  const go = (id) => () => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + id);
  };
  const logs = [...root.querySelectorAll('[data-alt]')].map((el, i) => ({
    group: 'Logs',
    label: `${String(i + 1).padStart(2, '0')}  ${el.querySelector('.log-name')?.textContent || ''}${el.querySelector('h2') ? ' · ' + el.querySelector('h2').textContent : ''}`,
    run: go(el.id),
  }));
  const projects = content.sections.flatMap((s) => (s.entries || []).map((e) => ({ group: 'Projects', label: e.title, run: go(e.id) })));
  const open = (href) => () => window.open(href, '_blank', 'noopener');
  const actions = [
    { group: 'Links', label: 'Copy email address', hint: 'e', run: () => root.querySelector('[data-copy-email]')?.click() },
    { group: 'Links', label: 'Résumé (PDF)', run: () => (location.href = content.links.resume) },
    { group: 'Links', label: 'GitHub', run: open(content.links.github) },
    { group: 'Links', label: 'LinkedIn', run: open(content.links.linkedin) },
    { group: 'Settings', label: 'Switch theme: blue hour / deep night', run: () => root.querySelector('.bar-theme')?.click() },
    ...(sound ? [{ group: 'Settings', label: 'Sound on / off', run: () => sound.toggle() }] : []),
  ];
  const all = [...logs, ...projects, ...actions];
  let shown = all;
  let sel = 0;
  let opener = null;

  function draw() {
    const q = input.value.trim().toLowerCase();
    shown = q ? all.filter((c) => (c.label + ' ' + c.group).toLowerCase().includes(q)) : all;
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let g = '';
    list.innerHTML = shown
      .map((c, i) => {
        const head = c.group !== g ? `<li class="pal-g" role="presentation">${(g = c.group)}</li>` : '';
        return head + `<li role="option" id="pal-${i}" data-i="${i}"${i === sel ? ' aria-selected="true"' : ''}>${c.label.replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x])}${c.hint ? `<kbd>${c.hint}</kbd>` : ''}</li>`;
      })
      .join('') || '<li class="pal-empty" role="presentation">Nothing matches</li>';
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${sel}` : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function show() {
    if (dlg.open) return;
    opener = document.activeElement;
    input.value = '';
    sel = 0;
    draw();
    dlg.showModal();
    input.focus();
  }
  function hide() {
    if (!dlg.open) return;
    dlg.close();
  }
  dlg.addEventListener('close', () => opener?.focus?.());
  function run(i) {
    const c = shown[i];
    if (!c) return;
    hide();
    c.run();
  }
  btn.addEventListener('click', show);
  input.addEventListener('input', () => {
    sel = 0;
    draw();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      sel = (sel + 1) % Math.max(1, shown.length);
      draw();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      sel = (sel - 1 + shown.length) % Math.max(1, shown.length);
      draw();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      run(sel);
      e.preventDefault();
    }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) run(Number(li.dataset.i));
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) hide(); // the backdrop
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey) {
      e.preventDefault();
      dlg.open ? hide() : show();
    }
  });
  return { show, hide };
}
