// The "press e to copy" shortcut must never hijack typing or browser shortcuts, so the
// guard is a pure function tested with plain objects instead of a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCopyOnKey } from '../src/chrome/copyEmail.js';

test('e and E trigger copy', () => {
  assert.equal(shouldCopyOnKey({ key: 'e' }), true);
  assert.equal(shouldCopyOnKey({ key: 'E' }), true);
});

test('other keys do not', () => {
  assert.equal(shouldCopyOnKey({ key: 'x' }), false);
});

test('modifier chords and key repeat do not', () => {
  assert.equal(shouldCopyOnKey({ key: 'e', ctrlKey: true }), false);
  assert.equal(shouldCopyOnKey({ key: 'e', metaKey: true }), false);
  assert.equal(shouldCopyOnKey({ key: 'e', altKey: true }), false);
  assert.equal(shouldCopyOnKey({ key: 'e', repeat: true }), false);
});

test('typing targets do not', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(shouldCopyOnKey({ key: 'e', target: { tagName } }), false);
  }
  assert.equal(shouldCopyOnKey({ key: 'e', target: { isContentEditable: true } }), false);
  assert.equal(shouldCopyOnKey({ key: 'e', target: { tagName: 'BODY' } }), true);
});
