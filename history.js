(function() {
  'use strict';

  const {
    CAPTURE_TYPE_REGION,
    buildAiPromptExport,
    buildMarkdownExport,
    formatTimestamp,
    sanitizeFeedbackItems
  } = globalThis.DevFeedbackShared;

  let histories = [];
  let searchQuery = '';
  let refreshTimer = 0;

  const groupsElement = document.getElementById('history-groups');
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error');
  const searchElement = document.getElementById('history-search');

  document.getElementById('download-json').addEventListener('click', downloadJson);
  document.getElementById('download-html').addEventListener('click', downloadHtmlReport);
  document.getElementById('copy-markdown').addEventListener('click', copyMarkdown);
  document.getElementById('copy-ai').addEventListener('click', copyAiPrompt);
  document.getElementById('clear-all').addEventListener('click', clearAllHistory);
  searchElement.addEventListener('input', () => {
    searchQuery = searchElement.value.trim().toLowerCase();
    render();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !Object.keys(changes).some((key) => key.startsWith('dev-feedback-'))) {
      return;
    }
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(loadHistory, 120);
  });

  loadHistory();

  async function loadHistory() {
    setError('');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'list-feedback-history' });
      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to load feedback history.');
      }
      histories = (response.histories || [])
        .map((history) => ({ ...history, items: sanitizeFeedbackItems(history.items) }))
        .filter((history) => history.items.length > 0)
        .sort((left, right) => getNewestTimestamp(right) - getNewestTimestamp(left));
      render();
    } catch (error) {
      setError(error.message || 'Unable to load feedback history.');
    }
  }

  function render() {
    const filtered = getFilteredHistories();
    const totalItems = histories.reduce((sum, history) => sum + history.items.length, 0);
    document.getElementById('item-total').textContent = String(totalItems);
    document.getElementById('group-total').textContent = String(histories.length);
    setActionAvailability(totalItems > 0);
    groupsElement.replaceChildren();

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = histories.length ? 'No saved feedback matches this filter.' : 'No feedback has been saved yet.';
      groupsElement.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((history) => fragment.appendChild(createGroup(history)));
    groupsElement.appendChild(fragment);
  }

  function createGroup(history) {
    const section = document.createElement('section');
    section.className = 'group';
    const label = getGroupLabel(history);

    const header = document.createElement('header');
    header.className = 'group-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'group-title';
    const title = document.createElement('h2');
    title.textContent = label;
    const count = document.createElement('p');
    count.textContent = `${history.items.length} saved item${history.items.length === 1 ? '' : 's'} · site-wide history`;
    titleWrap.append(title, count);
    const clearButton = document.createElement('button');
    clearButton.className = 'danger';
    clearButton.textContent = 'Clear Site/File';
    clearButton.setAttribute('aria-label', `Clear all feedback for ${label}`);
    clearButton.addEventListener('click', () => clearHistoryGroup(history));
    header.append(titleWrap, clearButton);

    const items = document.createElement('div');
    items.className = 'items';
    history.items.forEach((item) => items.appendChild(createItem(history, item, label)));
    section.append(header, items);
    return section;
  }

  function createItem(history, item, groupLabel) {
    const article = document.createElement('article');
    article.className = 'item';

    if (item.type === CAPTURE_TYPE_REGION && item.screenshot?.dataUrl) {
      const image = document.createElement('img');
      image.className = 'thumbnail';
      image.loading = 'lazy';
      image.src = item.screenshot.dataUrl;
      image.alt = `Captured region for ${item.pageTitle || groupLabel}`;
      article.appendChild(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'thumbnail';
      placeholder.setAttribute('aria-hidden', 'true');
      article.appendChild(placeholder);
    }

    const body = document.createElement('div');
    const type = document.createElement('div');
    type.className = 'type';
    type.textContent = item.type === CAPTURE_TYPE_REGION ? 'Region' : 'Element';
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = item.note;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const detail = item.type === CAPTURE_TYPE_REGION ? item.pageUrl : `${item.selector} · ${item.pageUrl}`;
    meta.textContent = `${formatTimestamp(item.timestamp)} · ${detail}`;
    body.append(type, note, meta);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'danger';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete feedback: ${item.note.slice(0, 80)}`);
    deleteButton.addEventListener('click', () => deleteItem(history, item));
    article.append(body, deleteButton);
    return article;
  }

  function getFilteredHistories() {
    if (!searchQuery) {
      return histories;
    }
    return histories.flatMap((history) => {
      const items = history.items.filter((item) => [
        item.note,
        item.pageTitle,
        item.pageUrl,
        item.selector,
        item.tabContext?.url
      ].some((value) => String(value || '').toLowerCase().includes(searchQuery)));
      return items.length ? [{ ...history, items }] : [];
    });
  }

  async function deleteItem(history, item) {
    if (!window.confirm('Delete this feedback item?')) {
      return;
    }
    await mutate({ action: 'delete-feedback-item', storageKey: history.storageKey, itemId: item.id }, 'Feedback item deleted.');
  }

  async function clearHistoryGroup(history) {
    if (!window.confirm(`Delete all ${history.items.length} items for ${getGroupLabel(history)}?`)) {
      return;
    }
    await mutate({ action: 'clear-feedback-items', storageKey: history.storageKey }, 'Site/file history cleared.');
  }

  async function clearAllHistory() {
    const totalItems = histories.reduce((sum, history) => sum + history.items.length, 0);
    if (!totalItems || !window.confirm(`Delete all ${totalItems} saved feedback items?`)) {
      return;
    }
    setStatus('Clearing all feedback...');
    for (const history of histories) {
      const response = await chrome.runtime.sendMessage({ action: 'clear-feedback-items', storageKey: history.storageKey });
      if (!response?.ok) {
        setError(response?.reason || 'Unable to clear all feedback.');
        return;
      }
    }
    setStatus('All feedback cleared.');
    await loadHistory();
  }

  async function mutate(message, successMessage) {
    setError('');
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      setError(response?.reason || 'Unable to update feedback history.');
      return;
    }
    setStatus(successMessage);
    await loadHistory();
  }

  function downloadJson() {
    downloadFile('dev-feedback-history.json', JSON.stringify(buildExportPayload(), null, 2), 'application/json');
    setStatus('JSON export downloaded.');
  }

  function downloadHtmlReport() {
    downloadFile('dev-feedback-report.html', buildHtmlReport(), 'text/html');
    setStatus('Self-contained HTML report downloaded.');
  }

  async function copyMarkdown() {
    const markdown = histories.map((history) => buildMarkdownExport(getGroupSource(history), history.items)).join('\n');
    await copyText(markdown, 'Markdown copied.');
  }

  async function copyAiPrompt() {
    const prompt = histories.map((history) => buildAiPromptExport(getGroupSource(history), history.items)).join('\n\n---\n\n');
    await copyText(prompt, 'AI prompt copied. Use the HTML or JSON export for companion crops.');
  }

  async function copyText(value, successMessage) {
    setError('');
    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage);
    } catch (error) {
      setError('Unable to write to the clipboard.');
    }
  }

  function buildExportPayload() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      histories: histories.map((history) => ({ storageKey: history.storageKey, items: history.items }))
    };
  }

  function buildHtmlReport() {
    const sections = histories.map((history) => {
      const items = history.items.map((item, index) => {
        const image = item.type === CAPTURE_TYPE_REGION && item.screenshot?.dataUrl
          ? `<img src="${item.screenshot.dataUrl}" alt="Captured region ${index + 1}">`
          : '';
        const locator = item.type === CAPTURE_TYPE_REGION ? item.pageUrl : item.selector;
        return `<article><h3>${index + 1}. ${escapeHtml(item.type)}</h3>${image}<p>${escapeHtml(item.note)}</p><dl><dt>Source</dt><dd>${escapeHtml(item.pageUrl)}</dd><dt>Locator</dt><dd>${escapeHtml(locator)}</dd><dt>Captured</dt><dd>${escapeHtml(formatTimestamp(item.timestamp))}</dd></dl></article>`;
      }).join('');
      return `<section><h2>${escapeHtml(getGroupLabel(history))}</h2>${items}</section>`;
    }).join('');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dev Feedback Report</title><style>body{max-width:960px;margin:40px auto;padding:0 20px;font:16px/1.5 system-ui;color:#182019}section{margin:36px 0}article{border:1px solid #ccd7ce;border-radius:10px;padding:18px;margin:14px 0}img{display:block;max-width:100%;max-height:560px;border-radius:7px}dl{display:grid;grid-template-columns:100px 1fr;gap:6px}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}</style></head><body><h1>Dev Feedback Report</h1><p>Exported ${escapeHtml(new Date().toLocaleString())}. Region images are embedded in this file.</p>${sections}</body></html>`;
  }

  function downloadFile(filename, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getGroupLabel(history) {
    const first = history.items[0];
    try {
      const url = new URL(first?.pageUrl || first?.tabContext?.url || '');
      return url.protocol === 'file:' ? decodeURIComponent(url.pathname.split('/').pop() || url.href) : url.origin;
    } catch (error) {
      return first?.pageTitle || history.storageKey;
    }
  }

  function getGroupSource(history) {
    return history.items[0]?.pageUrl || history.items[0]?.tabContext?.url || history.storageKey;
  }

  function getNewestTimestamp(history) {
    return Math.max(...history.items.map((item) => Date.parse(item.timestamp) || 0), 0);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function setActionAvailability(enabled) {
    ['download-json', 'download-html', 'copy-markdown', 'copy-ai', 'clear-all'].forEach((id) => {
      document.getElementById(id).disabled = !enabled;
    });
  }

  function setStatus(message) {
    statusElement.textContent = message;
  }

  function setError(message) {
    errorElement.textContent = message;
  }
})();
