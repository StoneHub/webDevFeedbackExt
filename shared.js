(function(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.DevFeedbackShared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const SUPPORTED_HOSTNAMES = Object.freeze([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1'
  ]);

  const SUPPORTED_MATCH_PATTERNS = Object.freeze([
    'http://localhost/*',
    'https://localhost/*',
    'http://127.0.0.1/*',
    'https://127.0.0.1/*',
    'http://0.0.0.0/*',
    'https://0.0.0.0/*',
    'http://[::1]/*',
    'https://[::1]/*'
  ]);

  const SHORTCUT_LABEL = 'Ctrl+Shift+F';
  const MAC_SHORTCUT_LABEL = 'Command+Shift+F';
  const MAX_NOTE_LENGTH = 2000;

  function normalizeHostname(hostname) {
    return String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  }

  function isLocalDevUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        SUPPORTED_HOSTNAMES.includes(normalizeHostname(url.hostname))
      );
    } catch (error) {
      return false;
    }
  }

  function makeStorageKey(rawUrl) {
    const url = new URL(rawUrl);
    return `dev-feedback-${url.origin}`;
  }

  function escapeCssIdentifier(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  return {
    SUPPORTED_HOSTNAMES,
    SUPPORTED_MATCH_PATTERNS,
    SHORTCUT_LABEL,
    MAC_SHORTCUT_LABEL,
    MAX_NOTE_LENGTH,
    escapeCssIdentifier,
    isLocalDevUrl,
    makeStorageKey,
    normalizeHostname
  };
});
