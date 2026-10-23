// Safari only, loaded before background.js. Safari cannot close storage.local to content scripts,
// so History lives in the app extension's sandbox and is reached only from the background page.
// The native side accepts these four requests and nothing else (safari/NativeBridge.swift).
(function() {
  'use strict';

  // Safari ignores the application id and always talks to this extension's own native handler.
  async function native(request) {
    let response;
    try {
      response = await browser.runtime.sendNativeMessage('app.stonehub.dev-feedback-capture', request);
    } catch (error) {
      console.error('Native request failed:', error.message);
      throw new Error('Dev Feedback Capture could not reach its saved notes. Quit and reopen Safari, then try again.');
    }
    if (!response?.ok) throw new Error(response?.reason || 'Saved notes are unavailable.');
    return response;
  }

  globalThis.DevFeedbackPlatform = {
    ready:Promise.resolve(),
    history:{
      async read(storageKey) {
        const { items } = await native({ action:'history.read', key:storageKey });
        return typeof items === 'string' ? JSON.parse(items) : [];
      },
      async write(storageKey, items) {
        await native({ action:'history.write', key:storageKey, items:JSON.stringify(items) });
      },
      async usage(storageKey) {
        const { total, key } = await native({ action:'history.usage', key:storageKey });
        return { total, key };
      }
    },
    // Resolves true only when the system pasteboard accepted the text.
    async writeClipboard(text) {
      return (await native({ action:'clipboard.write', text })).copied === true;
    }
  };
})();
