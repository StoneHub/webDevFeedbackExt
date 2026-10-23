// One note per picked element. Saving copies all of this page's feedback to the clipboard and keeps picking.
(function() {
  'use strict';
  let session;
  let saving = false;
  // Stored but not yet on the clipboard: Save becomes Copy again, and the background ignores the repeat add.
  let saved = false;
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
  save.disabled = true;
  chrome.runtime.sendMessage({ action:'get-capture-session' }).then(result => {
    if (!result?.ok || !result.session) throw new Error(result?.reason || 'Capture session expired.');
    session = result.session;
    save.disabled = false;
    note.focus();
  }).catch(error => showError(error.message));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!session || saving) return;
    saving = true; save.disabled = cancel.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ action:'add-feedback-item', item:{ note:note.value.trim() } });
      if (!result?.ok) throw new Error(result?.reason || 'Could not save.');
      saved = true; note.readOnly = true;
      // Safari's background writes the clipboard natively and reports it; elsewhere the click is
      // still the user's gesture, so this frame writes it.
      const copied = typeof result.clipboard === 'string' ? await copy(result.clipboard) : result.copied === true;
      if (!copied) throw new Error('Saved, but the clipboard was blocked. Press Copy again.');
      await chrome.runtime.sendMessage({ action:'clear-capture-session', saved:true, copied:true, count:result.count }).catch(() => {});
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
    chrome.runtime.sendMessage({ action:'clear-capture-session', saved }).catch(() => {});
  });
})();
