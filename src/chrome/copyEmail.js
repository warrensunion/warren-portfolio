// Email is the page's one call to action, so copying must work from the button and from the
// "e" key, and must degrade to a visible manual-copy prompt where the async clipboard API is
// missing or denied (insecure origins, some embedded browsers). The key guard is a pure
// function so it can be tested without a DOM.

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function shouldCopyOnKey(e) {
  if (!e || (e.key !== 'e' && e.key !== 'E')) return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  const t = e.target;
  if (t && (TYPING_TAGS.has(t.tagName) || t.isContentEditable)) return false;
  return true;
}

// Each copy button owns a status region; the e key reports in the first one a reader can see
// (the bar's on wide screens, the contact section's when the bar button is hidden).
export function pickStatus(statuses, isVisible) {
  return statuses.find(isVisible) || statuses[0] || null;
}

function selectText(node) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function initCopyEmail(root, email) {
  const buttons = [...root.querySelectorAll('[data-copy-email]')];
  const statuses = [...root.querySelectorAll('[data-copy-status]')];
  const visible = (el) => el.getClientRects().length > 0;
  // A status is only useful when its own button is shown (the bar nav stays, its button hides).
  const statusVisible = (s) => { const b = s.parentElement.querySelector('[data-copy-email]'); return !!b && visible(b); };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  let timer = 0;

  const say = (status, text, ms) => {
    if (!status) return;
    clearTimeout(timer);
    statuses.forEach((s) => { if (s !== status) s.textContent = ''; });
    status.textContent = text;
    if (ms) timer = setTimeout(() => { status.textContent = ''; }, ms);
  };

  // Prefer a button that is actually displayed (the bar one is hidden on narrow screens).
  const visibleButton = () => buttons.find(visible) || buttons[0];
  const statusFor = (btn) => btn.parentElement.querySelector('[data-copy-status]') || pickStatus(statuses, statusVisible);

  async function copy(btn, status) {
    try {
      await navigator.clipboard.writeText(email);
      say(status, 'Copied', 1600);
    } catch {
      if (btn) selectText(btn);
      say(status, `Press ${isMac ? 'Cmd' : 'Ctrl'}+C to copy`, 4000);
    }
  }

  const onClick = (ev) => copy(ev.currentTarget, statusFor(ev.currentTarget));
  buttons.forEach((b) => b.addEventListener('click', onClick));

  const onKey = (e) => {
    if (!shouldCopyOnKey(e)) return;
    copy(visibleButton(), pickStatus(statuses, statusVisible));
  };
  document.addEventListener('keydown', onKey);

  return () => {
    clearTimeout(timer);
    buttons.forEach((b) => b.removeEventListener('click', onClick));
    document.removeEventListener('keydown', onKey);
  };
}
