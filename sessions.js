(function() {
  'use strict';

  const {
    MAX_SESSION_SUMMARY_LENGTH,
    buildSessionExportPayload,
    buildSessionMarkdown,
    getSessionEventLabel,
    formatElapsed
  } = globalThis.DevFeedbackSessionModel;
  const sessionsElement = document.getElementById('sessions');
  const noticeElement = document.getElementById('notice');
  const selectedSessionId = new URLSearchParams(window.location.search).get('session') || '';
  let sessions = [];
  let reloadTimer = null;
  let hasRendered = false;
  const summaryDrafts = new Map();
  const openSessionIds = new Set();

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('history-btn').addEventListener('click', openFeedbackHistory);
    document.getElementById('download-all-btn').addEventListener('click', downloadAllSessions);
    document.getElementById('clear-all-btn').addEventListener('click', clearAllSessions);
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === 'local' &&
        Object.keys(changes).some((key) => key === 'feedback-session-index' || key.startsWith('feedback-session-record-'))
      ) {
        window.clearTimeout(reloadTimer);
        reloadTimer = window.setTimeout(() => loadSessions().catch(showError), 500);
      }
    });
    loadSessions().catch(showError);
  });

  async function loadSessions() {
    const response = await chrome.runtime.sendMessage({ action: 'list-feedback-sessions' });
    if (!response?.ok) {
      throw new Error(response?.reason || 'Unable to load Feedback Sessions.');
    }
    sessions = Array.isArray(response.sessions) ? response.sessions : [];
    renderSessions();
  }

  function renderSessions() {
    sessionsElement.querySelectorAll('details.session[open]').forEach((details) => {
      openSessionIds.add(details.dataset.sessionId);
    });
    sessionsElement.replaceChildren();
    document.getElementById('download-all-btn').disabled = sessions.length === 0;
    document.getElementById('clear-all-btn').disabled = sessions.length === 0;

    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No Feedback Sessions yet. Start one from the extension popup on the page you want to reproduce.';
      sessionsElement.appendChild(empty);
      return;
    }

    sessions.forEach((session, index) => {
      sessionsElement.appendChild(createSessionCard(session, index));
    });
    hasRendered = true;
  }

  function createSessionCard(session, index) {
    const details = document.createElement('details');
    details.className = 'session';
    details.dataset.sessionId = session.id;
    details.open = openSessionIds.has(session.id) ||
      (!hasRendered && (session.id === selectedSessionId || (!selectedSessionId && index === 0)));
    details.addEventListener('toggle', () => {
      if (details.open) {
        openSessionIds.add(session.id);
      } else {
        openSessionIds.delete(session.id);
      }
    });

    const summary = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = `status-dot ${session.status}`;
    dot.setAttribute('aria-hidden', 'true');

    const title = document.createElement('div');
    title.className = 'session-title';
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = session.summary || session.startTitle || getUrlLabel(session.startUrl) || 'Feedback Session';
    const titleMeta = document.createElement('span');
    titleMeta.textContent = `${formatDate(session.startedAt)} · ${session.status}`;
    title.append(titleStrong, titleMeta);

    const metrics = document.createElement('div');
    metrics.className = 'session-metrics';
    metrics.textContent = `${formatDuration(session)} · ${session.eventCount} event${session.eventCount === 1 ? '' : 's'}${session.truncated ? ' · limit reached' : ''}`;
    summary.append(dot, title, metrics);

    const body = document.createElement('div');
    body.className = 'session-body';
    body.appendChild(createSessionActions(session));
    body.appendChild(createSummaryEditor(session, titleStrong));

    const timelineLabel = document.createElement('div');
    timelineLabel.className = 'section-label';
    timelineLabel.textContent = 'Timeline';
    body.appendChild(timelineLabel);
    body.appendChild(createTimeline(session));
    details.append(summary, body);
    return details;
  }

  function createSessionActions(session) {
    const actions = document.createElement('div');
    actions.className = 'session-actions';
    actions.append(
      createButton('Download JSON', 'secondary', () => downloadSession(session)),
      createButton('Copy Markdown', 'secondary', () => copySessionMarkdown(session)),
      createButton('Delete Session', 'danger', () => deleteSession(session))
    );
    return actions;
  }

  function createSummaryEditor(session, titleElement) {
    const editor = document.createElement('div');
    editor.className = 'summary-editor';
    const label = document.createElement('label');
    const textareaId = `session-summary-${session.id}`;
    label.htmlFor = textareaId;
    label.textContent = 'What went wrong / expected outcome';
    const textarea = document.createElement('textarea');
    textarea.id = textareaId;
    textarea.maxLength = MAX_SESSION_SUMMARY_LENGTH;
    textarea.placeholder = 'Example: Saving the edited item returned an error after navigating from the dashboard to the detail form.';
    textarea.value = summaryDrafts.has(session.id) ? summaryDrafts.get(session.id) : session.summary || '';
    textarea.addEventListener('input', () => {
      summaryDrafts.set(session.id, textarea.value);
    });
    const save = createButton('Save Summary', 'secondary', async () => {
      save.disabled = true;
      const response = await chrome.runtime.sendMessage({
        action: 'update-feedback-session-summary',
        sessionId: session.id,
        summary: textarea.value
      });
      save.disabled = false;
      if (!response?.ok) {
        showError(new Error(response?.reason || 'Unable to save the session summary.'));
        return;
      }
      session.summary = response.session.summary;
      summaryDrafts.delete(session.id);
      titleElement.textContent = session.summary || session.startTitle || getUrlLabel(session.startUrl) || 'Feedback Session';
      showNotice('Session summary saved.');
    });
    editor.append(label, textarea, save);
    return editor;
  }

  function createTimeline(session) {
    const timeline = document.createElement('div');
    timeline.className = 'timeline';

    session.events.forEach((event) => {
      const item = document.createElement('div');
      item.className = 'event';
      const time = document.createElement('div');
      time.className = 'event-time';
      time.textContent = formatElapsed(event.elapsedMs);
      const copy = document.createElement('div');
      copy.className = 'event-copy';
      const label = document.createElement('strong');
      label.textContent = getSessionEventLabel(event);
      copy.appendChild(label);

      const targetDescription = describeTarget(event.details?.target);
      const detailLines = [
        event.pageUrl,
        targetDescription,
        event.details?.message,
        event.details?.error,
        event.details?.reason,
        event.details?.key ? `Key: ${event.details.key}` : ''
      ].filter(Boolean);
      detailLines.forEach((line) => {
        const detail = document.createElement('span');
        detail.textContent = line;
        copy.appendChild(detail);
      });

      item.append(time, copy);
      timeline.appendChild(item);
    });

    return timeline;
  }

  function createButton(label, variant, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${variant || ''}`.trim();
    button.textContent = label;
    button.addEventListener('click', () => {
      Promise.resolve(onClick()).catch(showError);
    });
    return button;
  }

  async function openFeedbackHistory() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  }

  function downloadAllSessions() {
    downloadJson('dev-feedback-sessions.json', buildSessionExportPayload(sessions));
    showNotice('Feedback Sessions JSON downloaded.');
  }

  function downloadSession(session) {
    const timestamp = session.startedAt.replace(/[:.]/g, '-');
    downloadJson(`dev-feedback-session-${timestamp}.json`, buildSessionExportPayload([session]));
    showNotice('Feedback Session JSON downloaded.');
  }

  async function copySessionMarkdown(session) {
    await navigator.clipboard.writeText(buildSessionMarkdown(session));
    showNotice('Feedback Session timeline copied as Markdown.');
  }

  async function deleteSession(session) {
    if (!window.confirm('Delete this Feedback Session and its local timeline?')) {
      return;
    }
    const response = await chrome.runtime.sendMessage({
      action: 'delete-feedback-session',
      sessionId: session.id
    });
    if (!response?.ok) {
      throw new Error(response?.reason || 'Unable to delete the Feedback Session.');
    }
    showNotice('Feedback Session deleted.');
    await loadSessions();
  }

  async function clearAllSessions() {
    if (!window.confirm(`Delete all ${sessions.length} saved Feedback Sessions?`)) {
      return;
    }
    const response = await chrome.runtime.sendMessage({ action: 'clear-feedback-sessions' });
    if (!response?.ok) {
      throw new Error(response?.reason || 'Unable to clear Feedback Sessions.');
    }
    showNotice('All saved Feedback Sessions were deleted.');
    await loadSessions();
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showNotice(message) {
    noticeElement.textContent = message;
    noticeElement.classList.remove('error');
    noticeElement.style.display = 'block';
  }

  function showError(error) {
    noticeElement.textContent = error?.message || 'Feedback Session operation failed.';
    noticeElement.classList.add('error');
    noticeElement.style.display = 'block';
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString()
      : 'Unknown time';
  }

  function formatDuration(session) {
    const started = Date.parse(session.startedAt);
    const ended = session.endedAt ? Date.parse(session.endedAt) : Date.now();
    if (!Number.isFinite(started) || !Number.isFinite(ended)) {
      return 'Unknown duration';
    }
    return formatElapsed(Math.max(0, ended - started));
  }

  function getUrlLabel(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return `${url.hostname}${url.pathname}`;
    } catch (error) {
      return rawUrl || '';
    }
  }

  function describeTarget(target) {
    if (!target) {
      return '';
    }
    return [
      target.tag,
      target.role ? `role=${target.role}` : '',
      target.ariaLabel || target.label || target.text,
      target.selector
    ].filter(Boolean).join(' · ');
  }
})();
