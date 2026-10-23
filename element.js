// One note per picked element. Saving copies all of this page's feedback to the clipboard and keeps picking.
(function() {
  'use strict';
  let session;
  let saving = false;
  // Stored but not yet on the clipboard: Save becomes Copy again, and the background ignores the repeat add.
  let saved = false;
  // Saved and copied; only closing is left.
  let copied = false;
  let count = 0;
  const REPLY_MS = 15000;
  // Proves to the page's content script that a close request comes from this note (see content.js).
  const closeToken = new URLSearchParams(location.search).get('close') || '';
  const form = document.getElementById('capture-form');
  const note = document.getElementById('note');
  const status = document.getElementById('status');
  const save = document.getElementById('save');
  const cancel = document.getElementById('cancel');
  function showError(message) { status.textContent = message; status.classList.add('error'); }
  // Some pages forbid the Clipboard API in every frame (Permissions-Policy: clipboard-write=()).
  // The legacy copy command still works there while the click or Enter is the user's gesture.
  async function copy(text) {
    if (await navigator.clipboard.writeText(text).then(() => true, () => false)) return true;
    const scratch = document.createElement('textarea');
    scratch.value = text;
    document.body.append(scratch);
    scratch.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    scratch.remove();
    return copied;
  }
  // A reply that never arrives must not leave the note stuck with every button disabled.
  function send(message, ms = REPLY_MS) {
    let timer;
    return Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No reply.')), ms); })
    ]).finally(() => clearTimeout(timer));
  }
  // The background forgets the session and resumes picking; then this frame asks the page's content
  // script to remove it. Safari stopped delivering the background's close message to the page while
  // this frame was open, so the close itself never depends on that message.
  async function close() {
    await send({ action:'clear-capture-session', saved, copied, count }, 3000).catch(() => null);
    // The page sees this message too, so it carries nothing but the token.
    window.parent.postMessage({ devFeedback:'close', token:closeToken }, '*');
    // Still here a moment later: the page no longer has the picker (reloaded or navigated).
    setTimeout(() => {
      showError('Could not close the note. Reload the page.');
      saving = false; cancel.disabled = false;
    }, 2000);
  }
  save.disabled = true;
  send({ action:'get-capture-session' }).then(result => {
    if (!result?.ok || !result.session) throw new Error(result?.reason || 'Capture session expired.');
    session = result.session;
    save.disabled = false;
    note.focus();
  }).catch(error => showError(error.message));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!session || saving || copied) return;
    saving = true; save.disabled = cancel.disabled = true;
    try {
      // No reply may still mean it was stored; saving again updates that same note, never adds a second.
      const result = await send({ action:'add-feedback-item', item:{ note:note.value.trim() } }).catch(() => {
        throw new Error(saved ? 'Could not confirm the copy. Press Copy again.' : 'Could not confirm the save. Press Save to try again.');
      });
      if (!result?.ok) throw new Error(result?.reason || 'Could not save.');
      saved = true; note.readOnly = true;
      // Safari's background writes the clipboard natively and reports it; elsewhere the click is
      // still the user's gesture, so this frame writes it.
      copied = typeof result.clipboard === 'string' ? await copy(result.clipboard) : result.copied === true;
      if (!copied) throw new Error('Saved, but the clipboard was blocked. Press Copy again.');
      count = Number.isInteger(result.count) ? result.count : 0;
      await close();
    } catch (error) {
      showError(saved ? error.message : error.message + ' Your note is still here.');
      save.textContent = saved ? 'Copy again' : 'Save';
      saving = false; save.disabled = cancel.disabled = false;
      if (saved) save.focus();
    }
  });
  note.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); cancel.click(); }
  });
  cancel.addEventListener('click', () => {
    if (saving) return;
    saving = true; cancel.disabled = true;
    close();
  });
})();
