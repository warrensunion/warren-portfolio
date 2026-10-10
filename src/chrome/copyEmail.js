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

function selectText(node) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function initCopyEmail(root, email) {
  const buttons = [...root.querySelectorAll('[data-copy-email]')];
  const status = root.querySelector('[data-copy-status]');
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  let timer = 0;

  const say = (text, ms) => {
    if (!status) return;
    clearTimeout(timer);
    status.textContent = text;
    if (ms) timer = setTimeout(() => { status.textContent = ''; }, ms);
  };

  // Prefer a button that is actually displayed (the bar one is hidden on narrow screens).
  const visibleButton = () => buttons.find((b) => b.getClientRects().length > 0) || buttons[0];

  async function copy(btn) {
    try {
      await navigator.clipboard.writeText(email);
      say('Copied', 1600);
    } catch {
      if (btn) selectText(btn);
      say(`Press ${isMac ? 'Cmd' : 'Ctrl'}+C to copy`, 4000);
    }
  }

  const onClick = (ev) => copy(ev.currentTarget);
  buttons.forEach((b) => b.addEventListener('click', onClick));

  const onKey = (e) => {
    if (!shouldCopyOnKey(e)) return;
    copy(visibleButton());
  };
  document.addEventListener('keydown', onKey);

  return () => {
    clearTimeout(timer);
    buttons.forEach((b) => b.removeEventListener('click', onClick));
    document.removeEventListener('keydown', onKey);
  };
}
