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
    // Only a Debug native build says so; it turns on the background's metadata trace.
    platform.trace = response?.debug === true;
    if (platform.trace) console.info('[dev-feedback]', 'native', request.action, response?.ok ? 'ok' : 'refused', response?.copied === undefined ? '' : `copied=${response.copied}`);
    if (!response?.ok) throw new Error(response?.reason || 'Saved notes are unavailable.');
    return response;
  }

  const platform = globalThis.DevFeedbackPlatform = {
    // One cheap request when the background page loads, so a Debug build traces from its first message.
    // A failure here is reported by the request that needs History.
    // Bounded, so a native side that never answers cannot hold every request behind it.
    ready:Promise.race([
      Promise.resolve().then(() => native({ action:'history.usage', key:'dev-feedback-' })),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]).then(() => {}, () => {}),
    trace:false,
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
