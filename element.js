// One note per picked element. Saving copies this picking run to the clipboard and keeps picking.
(function() {
  'use strict';
  let session;
  let saving = false;
  const form = document.getElementById('capture-form');
  const note = document.getElementById('note');
  const status = document.getElementById('status');
  const save = document.getElementById('save');
  const cancel = document.getElementById('cancel');
  function showError(message) { status.textContent = message; status.classList.add('error'); }
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
      // The click is still the user's gesture, so this frame can write the clipboard.
      const copied = await navigator.clipboard.writeText(result.clipboard).then(() => true, () => false);
      await chrome.runtime.sendMessage({ action:'clear-capture-session', saved:true, copied, count:result.count }).catch(() => {});
    } catch (error) {
      showError(error.message + ' Your note is still here.');
      saving = false; save.disabled = cancel.disabled = false;
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
    chrome.runtime.sendMessage({ action:'clear-capture-session' }).catch(() => {});
  });
})();
