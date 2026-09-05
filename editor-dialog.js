// Dialogs belong to the private editor frame; no browser-native dialogs are needed.
(function() {
  'use strict';
  globalThis.DevFeedbackDialog = async ({ message, input = false, confirmLabel = 'Discard' }) => {
    if (document.querySelector('dialog[open]')) return null;
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'max-width:340px;border:1px solid #777;border-radius:12px;padding:20px;color:#29263a;background:white;font:14px/1.5 system-ui';
    const form = document.createElement('form'); form.method = 'dialog';
    const label = document.createElement('label'); label.textContent = message;
    const field = document.createElement('input'); field.maxLength = 280;
    field.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:8px';
    if (input) label.appendChild(field);
    const cancel = document.createElement('button'); cancel.value = 'cancel'; cancel.textContent = 'Keep editing';
    const confirm = document.createElement('button'); confirm.value = 'confirm'; confirm.textContent = confirmLabel;
    confirm.style.marginLeft = '8px';
    form.append(label, document.createElement('p'), cancel, confirm); dialog.appendChild(form); document.body.appendChild(dialog);
    const result = new Promise(resolve => dialog.addEventListener('close', () => {
      const value = dialog.returnValue === 'confirm' ? (input ? field.value : true) : null;
      dialog.remove(); resolve(value);
    }, { once:true }));
    dialog.showModal(); (input ? field : cancel).focus();
    return result;
  };
})();
