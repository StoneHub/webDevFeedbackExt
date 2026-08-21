(function(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.DevFeedbackSessionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const SESSION_SCHEMA_VERSION = 1;
  const SESSION_STORAGE_PREFIX = 'feedback-session-record-';
  const SESSION_INDEX_KEY = 'feedback-session-index';
  const ACTIVE_SESSION_KEY = 'feedback-active-session';
  const MAX_SESSION_EVENTS = 1500;
  const MAX_SESSION_BYTES = 5 * 1024 * 1024;
  const MAX_STORED_SESSIONS = 20;
  const MAX_SESSION_SUMMARY_LENGTH = 2000;
  const MAX_TEXT_LENGTH = 240;
  const ALLOWED_EVENT_TYPES = new Set([
    'session-start',
    'session-pause',
    'session-resume',
    'session-stop',
    'navigation-committed',
    'navigation-completed',
    'navigation-history',
    'navigation-fragment',
    'navigation-error',
    'capture-gap',
    'document-ready',
    'click',
    'change',
    'submit',
    'key',
    'scroll',
    'page-error',
    'unhandled-rejection'
  ]);
  const ALLOWED_KEYS = new Set([
    'Enter',
    'Escape',
    'Tab',
    ' ',
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown'
  ]);

  function buildSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function makeSessionStorageKey(sessionId) {
    return `${SESSION_STORAGE_PREFIX}${String(sessionId || '')}`;
  }

  function createFeedbackSession(tab, now = new Date()) {
    const startedAt = toIsoString(now);
    const sanitizedUrl = sanitizeSessionUrl(tab?.url || tab?.pendingUrl || '');
    const id = buildSessionId();
    const startEvent = sanitizeSessionEvent({
      type: 'session-start',
      timestamp: startedAt,
      pageUrl: sanitizedUrl.url,
      pageTitle: tab?.title || '',
      details: {
        redactions: sanitizedUrl.redactions
      }
    }, {
      startedAt,
      pageUrl: sanitizedUrl.url,
      pageTitle: tab?.title || ''
    });

    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id,
      status: 'recording',
      tabId: Number.isInteger(tab?.id) ? tab.id : null,
      startedAt,
      endedAt: null,
      startUrl: sanitizedUrl.url,
      startTitle: cleanText(tab?.title, MAX_TEXT_LENGTH),
      lastUrl: sanitizedUrl.url,
      lastTitle: cleanText(tab?.title, MAX_TEXT_LENGTH),
      summary: '',
      stopReason: '',
      eventCount: 1,
      truncated: false,
      truncationReason: '',
      privacy: {
        typedValues: 'not-directly-read',
        passwordValues: 'not-directly-read',
        printableKeystrokes: 'not-recorded',
        queryStrings: 'removed',
        fragments: 'removed',
        screenshots: 'not-recorded',
        audio: 'not-recorded',
        video: 'not-recorded',
        storage: 'local-extension-only'
      },
      events: [{
        ...startEvent,
        sequence: 1,
        elapsedMs: 0
      }]
    };
  }

  function appendSessionEvent(rawSession, rawEvent) {
    const session = sanitizeFeedbackSession(rawSession);
    if (!session) {
      return { accepted: false, session: null, event: null };
    }

    if (session.events.length >= MAX_SESSION_EVENTS) {
      return {
        accepted: false,
        session: { ...session, truncated: true, truncationReason: 'event-limit' },
        event: null
      };
    }

    const event = sanitizeSessionEvent(rawEvent, {
      startedAt: session.startedAt,
      pageUrl: session.lastUrl,
      pageTitle: session.lastTitle
    });
    if (!event) {
      return { accepted: false, session, event: null };
    }

    const sequence = session.events.length + 1;
    const elapsedMs = Math.max(0, Date.parse(event.timestamp) - Date.parse(session.startedAt));
    const storedEvent = {
      ...event,
      sequence,
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0
    };

    const nextSession = {
      ...session,
      eventCount: sequence,
      lastUrl: storedEvent.pageUrl || session.lastUrl,
      lastTitle: storedEvent.pageTitle || session.lastTitle,
      events: session.events.concat(storedEvent)
    };
    if (estimateSerializedBytes(nextSession) > MAX_SESSION_BYTES) {
      return {
        accepted: false,
        session: { ...session, truncated: true, truncationReason: 'session-size-limit' },
        event: null
      };
    }

    return {
      accepted: true,
      event: storedEvent,
      session: nextSession
    };
  }

  function sanitizeFeedbackSession(rawSession) {
    if (!rawSession || typeof rawSession !== 'object' || typeof rawSession.id !== 'string') {
      return null;
    }

    const startedAt = isValidDate(rawSession.startedAt)
      ? rawSession.startedAt
      : new Date().toISOString();
    const events = Array.isArray(rawSession.events)
      ? rawSession.events.slice(0, MAX_SESSION_EVENTS).flatMap((event, index) => {
        const sanitized = sanitizeSessionEvent(event, {
          startedAt,
          pageUrl: rawSession.lastUrl || rawSession.startUrl || '',
          pageTitle: rawSession.lastTitle || rawSession.startTitle || ''
        });
        if (!sanitized) {
          return [];
        }
        return [{
          ...sanitized,
          sequence: index + 1,
          elapsedMs: Number.isFinite(event.elapsedMs)
            ? Math.max(0, Math.round(event.elapsedMs))
            : Math.max(0, Date.parse(sanitized.timestamp) - Date.parse(startedAt))
        }];
      })
      : [];
    const startUrl = sanitizeSessionUrl(rawSession.startUrl || events[0]?.pageUrl || '').url;
    const lastUrl = sanitizeSessionUrl(rawSession.lastUrl || events.at(-1)?.pageUrl || startUrl).url;
    const allowedStatuses = new Set(['recording', 'paused', 'completed', 'interrupted']);
    const status = allowedStatuses.has(rawSession.status) ? rawSession.status : 'completed';

    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: rawSession.id,
      status,
      tabId: Number.isInteger(rawSession.tabId) ? rawSession.tabId : null,
      startedAt,
      endedAt: isValidDate(rawSession.endedAt) ? rawSession.endedAt : null,
      startUrl,
      startTitle: cleanText(rawSession.startTitle, MAX_TEXT_LENGTH),
      lastUrl,
      lastTitle: cleanText(rawSession.lastTitle, MAX_TEXT_LENGTH),
      summary: cleanText(rawSession.summary, MAX_SESSION_SUMMARY_LENGTH),
      stopReason: cleanText(rawSession.stopReason, 80),
      eventCount: events.length,
      truncated: Boolean(rawSession.truncated) || (Array.isArray(rawSession.events) && rawSession.events.length > events.length),
      truncationReason: cleanText(rawSession.truncationReason, 40),
      privacy: {
        typedValues: 'not-directly-read',
        passwordValues: 'not-directly-read',
        printableKeystrokes: 'not-recorded',
        queryStrings: 'removed',
        fragments: 'removed',
        screenshots: 'not-recorded',
        audio: 'not-recorded',
        video: 'not-recorded',
        storage: 'local-extension-only'
      },
      events
    };
  }

  function sanitizeSessionEvent(rawEvent, context = {}) {
    if (!rawEvent || typeof rawEvent !== 'object' || !ALLOWED_EVENT_TYPES.has(rawEvent.type)) {
      return null;
    }
    if (rawEvent.type === 'key' && !ALLOWED_KEYS.has(rawEvent.details?.key)) {
      return null;
    }

    const timestamp = isValidDate(rawEvent.timestamp)
      ? rawEvent.timestamp
      : new Date().toISOString();
    const sanitizedUrl = sanitizeSessionUrl(rawEvent.pageUrl || context.pageUrl || '');
    const details = sanitizeEventDetails(rawEvent.type, rawEvent.details, sanitizedUrl.redactions);

    return {
      type: rawEvent.type,
      timestamp,
      pageUrl: sanitizedUrl.url,
      pageTitle: cleanText(rawEvent.pageTitle || context.pageTitle, MAX_TEXT_LENGTH),
      ...(details ? { details } : {})
    };
  }

  function sanitizeEventDetails(type, rawDetails, urlRedactions) {
    const details = rawDetails && typeof rawDetails === 'object' ? rawDetails : {};
    const redactions = Array.from(new Set([
      ...(Array.isArray(details.redactions) ? details.redactions.map((value) => cleanText(value, 40)).filter(Boolean) : []),
      ...urlRedactions
    ]));
    const output = {};

    if (details.target) {
      output.target = sanitizeTarget(details.target);
    }

    if (type === 'click') {
      output.point = sanitizePoint(details.point);
      output.button = Number.isInteger(details.button) ? Math.max(0, Math.min(details.button, 4)) : 0;
    }

    if (type === 'change') {
      output.changeKind = cleanText(details.changeKind, 40) || 'field-edited';
      if (typeof details.checked === 'boolean') {
        output.checked = details.checked;
      }
    }

    if (type === 'submit') {
      output.method = cleanText(details.method, 12).toUpperCase() || 'GET';
      const action = sanitizeSessionUrl(details.action || '');
      if (action.url) {
        output.action = action.url;
        redactions.push(...action.redactions);
      }
    }

    if (type === 'key' && ALLOWED_KEYS.has(details.key)) {
      output.key = details.key === ' ' ? 'Space' : details.key;
      output.modifiers = sanitizeModifiers(details.modifiers);
    }

    if (type === 'scroll') {
      output.scrollX = finiteNumber(details.scrollX, 0);
      output.scrollY = finiteNumber(details.scrollY, 0);
      output.viewportWidth = finiteNumber(details.viewportWidth, 0);
      output.viewportHeight = finiteNumber(details.viewportHeight, 0);
    }

    if (type.startsWith('navigation-')) {
      output.transitionType = cleanText(details.transitionType, 40);
      output.transitionQualifiers = Array.isArray(details.transitionQualifiers)
        ? details.transitionQualifiers.map((value) => cleanText(value, 40)).filter(Boolean).slice(0, 8)
        : [];
      output.documentId = cleanText(details.documentId, 120);
      output.error = cleanText(details.error, MAX_TEXT_LENGTH);
    }

    if (type === 'page-error' || type === 'unhandled-rejection') {
      output.message = type === 'page-error'
        ? 'Script or resource error observed'
        : 'Unhandled promise rejection observed';
      const filename = sanitizeSessionUrl(details.filename || '');
      output.filename = filename.url;
      output.line = finiteNumber(details.line, 0);
      output.column = finiteNumber(details.column, 0);
      redactions.push(...filename.redactions);
    }

    if (type === 'capture-gap') {
      output.reason = cleanText(details.reason, MAX_TEXT_LENGTH);
    }

    if (redactions.length) {
      output.redactions = Array.from(new Set(redactions));
    }

    return Object.keys(output).length ? output : null;
  }

  function sanitizeTarget(rawTarget) {
    if (!rawTarget || typeof rawTarget !== 'object') {
      return null;
    }

    const href = sanitizeSessionUrl(rawTarget.href || '');
    return compactObject({
      tag: cleanText(rawTarget.tag, 32).toLowerCase(),
      role: cleanText(rawTarget.role, 60),
      inputType: cleanText(rawTarget.inputType, 40).toLowerCase(),
      id: cleanText(rawTarget.id, 120),
      name: cleanText(rawTarget.name, 120),
      ariaLabel: cleanText(rawTarget.ariaLabel, 160),
      label: cleanText(rawTarget.label, 160),
      text: cleanText(rawTarget.text, 160),
      selector: cleanText(rawTarget.selector, MAX_TEXT_LENGTH),
      href: href.url,
      hrefRedactions: href.redactions.length ? href.redactions : undefined
    });
  }

  function sanitizePoint(rawPoint) {
    return {
      x: finiteNumber(rawPoint?.x, 0),
      y: finiteNumber(rawPoint?.y, 0),
      pageX: finiteNumber(rawPoint?.pageX, 0),
      pageY: finiteNumber(rawPoint?.pageY, 0)
    };
  }

  function sanitizeModifiers(rawModifiers) {
    const modifiers = rawModifiers && typeof rawModifiers === 'object' ? rawModifiers : {};
    return {
      alt: Boolean(modifiers.alt),
      ctrl: Boolean(modifiers.ctrl),
      meta: Boolean(modifiers.meta),
      shift: Boolean(modifiers.shift)
    };
  }

  function sanitizeSessionUrl(rawUrl) {
    const raw = String(rawUrl || '');
    if (!raw) {
      return { url: '', redactions: [] };
    }

    try {
      const url = new URL(raw);
      const redactions = [];

      if (url.username || url.password) {
        url.username = '';
        url.password = '';
        redactions.push('credentials');
      }
      if (url.search) {
        url.search = '';
        redactions.push('query');
      }
      if (url.hash) {
        url.hash = '';
        redactions.push('fragment');
      }

      return {
        url: url.href.slice(0, 2000),
        redactions
      };
    } catch (error) {
      return {
        url: cleanText(raw.split(/[?#]/, 1)[0], 2000),
        redactions: raw.includes('?') || raw.includes('#') ? ['query-or-fragment'] : []
      };
    }
  }

  function buildSessionExportPayload(sessions, exportedAt = new Date()) {
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      exportedAt: toIsoString(exportedAt),
      product: 'Dev Feedback Capture',
      captureKind: 'structured-feedback-session',
      sessions: (Array.isArray(sessions) ? sessions : [])
        .map(sanitizeFeedbackSession)
        .filter(Boolean)
    };
  }

  function buildSessionMarkdown(rawSession) {
    const session = sanitizeFeedbackSession(rawSession);
    if (!session) {
      return '';
    }

    const lines = [
      `# Feedback Session`,
      '',
      `- Started: ${session.startedAt}`,
      `- Ended: ${session.endedAt || 'Still active'}`,
      `- Status: ${session.status}`,
      `- Start page: ${session.startUrl || 'Unknown'}`,
      `- Events: ${session.eventCount}${session.truncated ? ' (truncated at local safety limit)' : ''}`,
      '- Privacy: form fields and printable keystrokes were not directly read. URL queries/fragments, screenshots, audio, and video were not recorded. Page paths, titles, and element labels may contain sensitive text supplied by the site.',
      ''
    ];

    if (session.summary) {
      lines.push('## Issue summary', '', session.summary, '');
    }

    lines.push('## Timeline', '');
    session.events.forEach((event) => {
      lines.push(`- ${formatElapsed(event.elapsedMs)} — ${getSessionEventLabel(event)}`);
      if (event.pageUrl) {
        lines.push(`  - Page: ${event.pageUrl}`);
      }
      const target = event.details?.target;
      if (target) {
        lines.push(`  - Target: ${describeTarget(target)}`);
      }
      if (event.details?.message) {
        lines.push(`  - Message: ${event.details.message}`);
      }
      if (event.details?.reason) {
        lines.push(`  - Note: ${event.details.reason}`);
      }
    });

    return lines.join('\n');
  }

  function getSessionEventLabel(event) {
    const labels = {
      'session-start': 'Session started',
      'session-pause': 'Recording paused',
      'session-resume': 'Recording resumed',
      'session-stop': 'Session stopped',
      'navigation-committed': 'Navigation committed',
      'navigation-completed': 'Page load completed',
      'navigation-history': 'In-page route changed',
      'navigation-fragment': 'Page fragment changed',
      'navigation-error': 'Navigation failed',
      'capture-gap': 'Interaction detail unavailable',
      'document-ready': 'Interaction recorder attached',
      click: 'Clicked',
      change: 'Changed a field',
      submit: 'Submitted a form',
      key: `Pressed ${event?.details?.key || 'a navigation key'}`,
      scroll: 'Scrolled',
      'page-error': 'Page error observed',
      'unhandled-rejection': 'Unhandled promise rejection observed'
    };

    return labels[event?.type] || cleanText(event?.type, 80) || 'Event';
  }

  function describeTarget(target) {
    return [
      target.tag,
      target.role ? `role=${target.role}` : '',
      target.ariaLabel || target.label || target.text || '',
      target.selector || ''
    ].filter(Boolean).join(' · ');
  }

  function formatElapsed(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(finiteNumber(milliseconds, 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function cleanText(value, maxLength) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
      : '';
  }

  function compactObject(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => (
      value !== '' && value !== null && value !== undefined
    )));
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  function estimateSerializedBytes(value) {
    const serialized = JSON.stringify(value);
    return typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(serialized).byteLength
      : serialized.length * 2;
  }

  function isValidDate(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
  }

  function toIsoString(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  return {
    SESSION_SCHEMA_VERSION,
    SESSION_STORAGE_PREFIX,
    SESSION_INDEX_KEY,
    ACTIVE_SESSION_KEY,
    MAX_SESSION_EVENTS,
    MAX_SESSION_BYTES,
    MAX_STORED_SESSIONS,
    MAX_SESSION_SUMMARY_LENGTH,
    ALLOWED_KEYS,
    buildSessionId,
    makeSessionStorageKey,
    createFeedbackSession,
    appendSessionEvent,
    sanitizeFeedbackSession,
    sanitizeSessionEvent,
    sanitizeSessionUrl,
    estimateSerializedBytes,
    buildSessionExportPayload,
    buildSessionMarkdown,
    getSessionEventLabel,
    formatElapsed
  };
});
