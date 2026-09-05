(function() {
  'use strict';
  let session;
  let saving = false;
  const note = document.getElementById('note');
  const status = document.getElementById('status');
  const save = document.getElementById('save');
  const cancel = document.getElementById('cancel');
  save.disabled = true;
  chrome.runtime.sendMessage({ action:'get-capture-session' }).then(result => {
    if (!result?.ok || !result.session) throw new Error(result?.reason || 'Capture session expired.');
    session = result.session;
    document.getElementById('source').textContent = session.pageUrl;
    document.getElementById('target').textContent = JSON.stringify(session.snapshot, null, 2);
    save.disabled = false;
    note.focus();
  }).catch(error => { status.textContent = error.message; });
  document.getElementById('capture-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!session || saving || !note.value.trim()) return;
    saving = true; save.disabled = true; cancel.disabled = true;
    status.textContent = 'Saving locally...';
    try {
      const result = await chrome.runtime.sendMessage({ action:'add-feedback-item', item:{
        note:note.value.trim(), acceptance:document.getElementById('acceptance').value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean), timestamp:new Date().toISOString()
      }});
      if (!result?.ok) throw new Error(result?.reason || 'Could not save.');
      status.textContent = 'Saved to History.';
      await chrome.runtime.sendMessage({ action:'clear-capture-session' }).catch(()=>{});
      if (!session?.embedded) window.close();
    } catch (error) {
      status.textContent = error.message + ' Your note is still here; retry when ready.';
      saving = false; save.disabled = false; cancel.disabled = false;
    }
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); cancel.click(); }
  });
  cancel.addEventListener('click', async()=> {
    if (saving) return;
    if ((note.value.trim() || document.getElementById('acceptance').value.trim()) && !await DevFeedbackDialog({message:'Discard this unsaved note?'})) return;
    await chrome.runtime.sendMessage({ action:'clear-capture-session' }).catch(()=>{});
    if (!session?.embedded) window.close();
  });
})();
