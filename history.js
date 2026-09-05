(function() {
  'use strict';
  if (window.top !== window) document.documentElement.classList.add('overlay-history');
  if (new URLSearchParams(window.location.search).get('surface') === 'popup') document.documentElement.classList.add('popup-history');
  document.getElementById('close-history').addEventListener('click', async () => {
    if (window.top === window) { window.close(); return; }
    const result = await chrome.runtime.sendMessage({action:'close-history'});
    if (!result?.ok) setError(result?.reason || 'Could not close History.');
  });


  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      document.getElementById('close-history').click();
    }
  });

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
  const selected = new Set();
  let exportSnapshot = [];
  let exportBusy = false;
  const identity = (history, item) => JSON.stringify([history.storageKey, item.id]);

  const groupsElement = document.getElementById('history-groups');
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error');
  const searchElement = document.getElementById('history-search');

  document.getElementById('download-json').addEventListener('click', () => startExport(downloadCodexHandoff));
  document.getElementById('download-ai-bundle').addEventListener('click', () => startExport(downloadAiBundle));
  document.getElementById('download-html').addEventListener('click', () => startExport(downloadHtmlReport));
  document.getElementById('copy-markdown').addEventListener('click', () => startExport(copyMarkdown));
  document.getElementById('copy-ai').addEventListener('click', () => startExport(copyAiPrompt));
  document.getElementById('clear-all').addEventListener('click', clearAllHistory);
  searchElement.addEventListener('input', () => {
    searchQuery = searchElement.value.trim().toLowerCase();
    selected.clear();
    render();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !Object.keys(changes).some((key) => key.startsWith('dev-feedback-'))) {
      return;
    }
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(loadHistory, 120);
  });

  document.getElementById('select-shown').addEventListener('click', () => {
    getFilteredHistories().forEach(history => history.items.forEach(item => selected.add(identity(history, item)))); render();
  });
  document.getElementById('select-none').addEventListener('click', () => { selected.clear(); render(); });
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
      document.getElementById('storage-usage').textContent = `${(response.bytesUsed / 1048576).toFixed(1)} MiB used · ${(response.byteLimit / 1048576).toFixed(0)} MiB capture budget`;
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
    const count = getSelectedHistories().reduce((sum, history) => sum + history.items.length, 0);
    document.getElementById('selection-summary').textContent = `${count} selected for sharing or deletion`;
    setActionAvailability(count > 0 && !exportBusy);
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
    clearButton.textContent = `Delete shown (${history.items.length})`;
    clearButton.setAttribute('aria-label', `Delete these ${history.items.length} visible items for ${label}`);
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
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = selected.has(identity(history, item));
    checkbox.setAttribute('aria-label', `Select ${item.note}`);
    checkbox.addEventListener('change', () => {
      checkbox.checked ? selected.add(identity(history, item)) : selected.delete(identity(history, item));
      const count = getSelectedHistories().reduce((sum, group) => sum + group.items.length, 0);
      document.getElementById('selection-summary').textContent = `${count} selected for sharing or deletion`;
      setActionAvailability(count > 0 && !exportBusy);
    });
    label.append(checkbox, document.createTextNode(' Select')); article.appendChild(label);
    article.appendChild(createEvidencePreview(item, groupLabel));

    const body = document.createElement('div');
    const type = document.createElement('div');
    type.className = 'type';
    const captureLabel = item.type === CAPTURE_TYPE_REGION
      ? `Region · ${item.annotations.length} annotation${item.annotations.length === 1 ? '' : 's'}`
      : 'Element';
    type.textContent = `${captureLabel} · ${getRequestKindLabel(item)}`;
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = item.changeRequest?.summary || item.note;
    const mutationList = createMutationList(item);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const detail = item.type === CAPTURE_TYPE_REGION ? item.pageUrl : `${item.selector} · ${item.pageUrl}`;
    meta.textContent = `${formatTimestamp(item.timestamp)} · ${detail}`;
    body.append(type, note);
    if (mutationList) {
      body.appendChild(mutationList);
    }
    if (item.acceptance?.length) {
      const acceptance = document.createElement('p');
      acceptance.className = 'acceptance';
      acceptance.textContent = `Acceptance criteria (unverified): ${item.acceptance.join(' · ')}`;
      body.appendChild(acceptance);
    }
    body.appendChild(meta);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'danger';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete feedback: ${item.note.slice(0, 80)}`);
    deleteButton.addEventListener('click', () => deleteItem(history, item));
    const editButton = document.createElement('button');
    editButton.className = 'secondary'; editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit feedback: ${item.note.slice(0, 80)}`);
    editButton.addEventListener('click', () => editItem(history, item));
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(editButton, deleteButton);
    article.append(body, actions);
    return article;
  }

  function createEvidencePreview(item, groupLabel) {
    const preview = document.createElement('div');
    preview.className = 'evidence-preview';
    const evidence = item.type === CAPTURE_TYPE_REGION
      ? [
          ['Original', item.screenshot?.dataUrl, 'captured region'],
          ['Annotated', item.screenshot?.annotatedDataUrl, 'annotated region']
        ]
      : [
          ['Original', item.evidence?.before?.dataUrl, 'original element'],
          ['Proposed', item.evidence?.proposed?.dataUrl, 'proposed element']
        ];

    evidence.forEach(([label, dataUrl, description]) => {
      if (!dataUrl) {
        return;
      }
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.className = 'thumbnail';
      image.loading = 'lazy';
      image.src = dataUrl;
      image.alt = `${description} for ${item.pageTitle || groupLabel}`;
      const caption = document.createElement('figcaption');
      caption.textContent = label;
      figure.append(image, caption);
      preview.appendChild(figure);
    });

    if (!preview.childElementCount) {
      const placeholder = document.createElement('div');
      placeholder.className = 'thumbnail placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      preview.appendChild(placeholder);
    }
    return preview;
  }

  function createMutationList(item) {
    if (item.changeRequest?.kind !== 'requested-mutation' || !item.changeRequest.requestedMutations.length) {
      return null;
    }
    const list = document.createElement('ul');
    list.className = 'mutation-list';
    item.changeRequest.requestedMutations.forEach((mutation) => {
      const entry = document.createElement('li');
      entry.textContent = formatMutationSummary(mutation);
      list.appendChild(entry);
    });
    return list;
  }

  function getFilteredHistories() {
    if (!searchQuery) {
      return histories;
    }
    return histories.flatMap((history) => {
      const items = history.items.filter((item) => [
        item.note,
        item.changeRequest?.kind,
        item.changeRequest?.summary,
        buildMutationSearchText(item),
        item.pageTitle,
        item.pageUrl,
        item.selector,
        item.tabContext?.url
      ].some((value) => String(value || '').toLowerCase().includes(searchQuery)));
      return items.length ? [{ ...history, items }] : [];
    });
  }

  function editItem(history, item) {
    const dialog = document.getElementById('edit-feedback');
    const form = document.getElementById('edit-feedback-form');
    const note = document.getElementById('edit-note');
    const acceptance = document.getElementById('edit-acceptance');
    const save = document.getElementById('edit-save');
    const cancel = document.getElementById('edit-cancel');
    const error = document.getElementById('edit-error');
    let saving = false;
    note.value = item.note; acceptance.value = (item.acceptance || []).join('\n'); error.textContent = '';
    save.disabled = cancel.disabled = false;
    cancel.onclick = () => dialog.close();
    dialog.oncancel = event => { if (saving) event.preventDefault(); };
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving || !note.value.trim()) return;
      saving = true; save.disabled = cancel.disabled = true; error.textContent = '';
      try {
        const result = await chrome.runtime.sendMessage({action:'edit-feedback-note', storageKey:history.storageKey, itemId:item.id, note:note.value.trim(), acceptance:acceptance.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)});
        if (!result?.ok) throw new Error(result?.reason || 'Could not save this note.');
        dialog.close(); await loadHistory(); setStatus('Note updated.');
      } catch (failure) { error.textContent = failure.message + ' Your changes are still here.'; }
      finally { saving = false; save.disabled = cancel.disabled = false; }
    };
    dialog.showModal(); note.focus();
  }

  async function deleteItem(history, item) {
    if (!window.confirm('Delete this feedback item?')) {
      return;
    }
    await mutate({ action: 'delete-feedback-items', storageKey: history.storageKey, itemIds: [item.id] }, 'Feedback item deleted.');
  }

  async function clearHistoryGroup(history) {
    if (!window.confirm(`Delete these ${history.items.length} shown items for ${getGroupLabel(history)}? Hidden items will remain.`)) {
      return;
    }
    await mutate({ action: 'delete-feedback-items', storageKey: history.storageKey, itemIds: history.items.map(item => item.id) }, 'Shown items deleted.');
  }

  async function clearAllHistory() {
    const groups = getSelectedHistories();
    const count = groups.reduce((sum, group) => sum + group.items.length, 0);
    if (!count || !window.confirm(`Delete exactly ${count} selected items? Other items will remain.`)) return;
    try {
      for (const history of groups) {
        const response = await chrome.runtime.sendMessage({ action:'delete-feedback-items', storageKey:history.storageKey, itemIds:history.items.map(item=>item.id) });
        if (!response?.ok) throw new Error(response?.reason || 'Could not delete the selection.');
      }
      selected.clear();
      setStatus('Selected items deleted.');
    } catch (error) { setError(error.message); }
    await loadHistory();
  }

  function getSelectedHistories() {
    return getFilteredHistories().flatMap(history => {
      const items = history.items.filter(item => selected.has(identity(history, item)));
      return items.length ? [{ ...history, items }] : [];
    });
  }

  async function startExport(action) {
    if (exportBusy) return;
    const groups = getSelectedHistories();
    if (!groups.length) { setError('Select the items you want to share first.'); return; }
    exportBusy = true; setActionAvailability(false);
    try {
      exportSnapshot = await globalThis.DevFeedbackShared.prepareExportHistories(groups);
      const dialog = document.getElementById('export-preview');
      document.getElementById('export-preview-content').textContent = JSON.stringify(exportSnapshot, (key, value) => typeof value === 'string' && value.startsWith('data:image/') ? '[Image attached: inspect its preview in History]' : value, 2);
      document.getElementById('export-preview-count').textContent = `${exportSnapshot.reduce((sum, group) => sum + group.items.length, 0)} items from ${groups.length} sites/files`;
      const previews = document.getElementById('export-preview-images');
      previews.replaceChildren();
      exportSnapshot.forEach(group => group.items.forEach(item => {
        const label = document.createElement('p'); label.textContent = item.note;
        previews.append(label, createEvidencePreview(item, getGroupLabel(group)));
      }));
      dialog.returnValue = 'cancel';
      const confirmation = new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'export'), { once:true }));
      dialog.showModal();
      if (await confirmation) await action();
    } catch (error) { setError(error.message || 'Export failed.'); }
    finally { exportSnapshot = []; exportBusy = false; render(); }
  }

  async function mutate(message, successMessage) {
    setError('');
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) throw new Error(response?.reason || 'Unable to update feedback history.');
      setStatus(successMessage);
      await loadHistory();
    } catch (error) { setError(error.message || 'Unable to update feedback history.'); }
  }

  function downloadCodexHandoff() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(`dev-feedback-codex-inbox-${timestamp}.json`, JSON.stringify(buildExportPayload(), null, 2), 'application/json');
    setStatus('Codex handoff downloaded through your browser. The local MCP companion can import the newest valid capture when the browser download location matches the configured inbox.');
  }

  async function downloadAiBundle() {
    setError('');
    const button = document.getElementById('download-ai-bundle');
    button.disabled = true;
    setStatus('Building local AI bundle...');
    try {
      await validateHistoryImages();
      const annotatedImages = await collectAnnotatedImages();
      const bundle = globalThis.DevFeedbackBundle.buildAiBundle(exportSnapshot, {
        exportedAt: new Date().toISOString(),
        annotatedImages
      });
      downloadBlob(bundle.filename, new Blob([bundle.bytes], { type: 'application/zip' }));
      setStatus(`AI bundle downloaded with ${bundle.entryNames.length} files.`);
    } catch (error) {
      setError(error.message || 'Unable to build the AI bundle.');
    } finally {
      button.disabled = false;
    }
  }

  async function validateHistoryImages() {
    for (const history of exportSnapshot) {
      for (const item of history.items) {
        if (item.type === CAPTURE_TYPE_REGION) {
          if (item.screenshot?.dataUrl) {
            await decodeEvidenceImage(item.screenshot.dataUrl, `${item.id} before`);
          }
          if (item.screenshot?.annotatedDataUrl) {
            await decodeEvidenceImage(item.screenshot.annotatedDataUrl, `${item.id} annotated`);
          }
        } else {
          if (item.evidence?.before?.dataUrl) {
            await decodeEvidenceImage(item.evidence.before.dataUrl, `${item.id} before`);
          }
          if (item.evidence?.proposed?.dataUrl) {
            await decodeEvidenceImage(item.evidence.proposed.dataUrl, `${item.id} proposed`);
          }
        }
      }
    }
  }

  async function collectAnnotatedImages() {
    const annotatedImages = new Map();
    for (const history of exportSnapshot) {
      for (const item of history.items) {
        if (item.type === CAPTURE_TYPE_REGION && item.screenshot?.dataUrl && !item.screenshot.annotatedDataUrl) {
          annotatedImages.set(item.id, await renderAnnotatedEvidence(item));
        }
      }
    }
    return annotatedImages;
  }

  function decodeEvidenceImage(dataUrl, label) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to decode ${label} evidence image.`));
      image.src = dataUrl;
    });
  }

  function renderAnnotatedEvidence(item) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const rect = item.viewportRect;
          const scaleX = image.naturalWidth / Math.max(1, rect.width);
          const scaleY = image.naturalHeight / Math.max(1, rect.height);
          item.annotations
            .filter((annotation) => annotation.type === 'blur')
            .forEach((annotation) => redactEvidenceRect(context, annotation.rect, rect, scaleX, scaleY));
          context.save();
          context.scale(scaleX, scaleY);
          context.translate(-rect.x, -rect.y);
          item.annotations.forEach((annotation) => drawEvidenceAnnotation(context, annotation));
          context.restore();
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error(`Unable to decode evidence image for ${item.id}.`));
      image.src = item.screenshot.dataUrl;
    });
  }

  function redactEvidenceRect(context, annotationRect, cropRect, scaleX, scaleY) {
    const left = Math.max(cropRect.x, annotationRect.x);
    const top = Math.max(cropRect.y, annotationRect.y);
    const right = Math.min(cropRect.x + cropRect.width, annotationRect.x + annotationRect.width);
    const bottom = Math.min(cropRect.y + cropRect.height, annotationRect.y + annotationRect.height);
    const x = Math.round((left - cropRect.x) * scaleX);
    const y = Math.round((top - cropRect.y) * scaleY);
    const width = Math.round((right - left) * scaleX);
    const height = Math.round((bottom - top) * scaleY);
    if (width <= 0 || height <= 0) {
      return;
    }

    context.save();
    context.fillStyle = '#191919';
    context.fillRect(x, y, width, height);
    context.restore();
  }

  function drawEvidenceAnnotation(context, annotation) {
    const color = annotation.color || '#ff3b30';
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 4;
    context.lineCap = 'round';

    if (annotation.type === 'arrow') {
      context.beginPath();
      context.moveTo(annotation.start.x, annotation.start.y);
      context.lineTo(annotation.end.x, annotation.end.y);
      context.stroke();
      const angle = Math.atan2(annotation.end.y - annotation.start.y, annotation.end.x - annotation.start.x);
      context.beginPath();
      context.moveTo(annotation.end.x, annotation.end.y);
      context.lineTo(annotation.end.x - 14 * Math.cos(angle - Math.PI / 6), annotation.end.y - 14 * Math.sin(angle - Math.PI / 6));
      context.lineTo(annotation.end.x - 14 * Math.cos(angle + Math.PI / 6), annotation.end.y - 14 * Math.sin(angle + Math.PI / 6));
      context.closePath();
      context.fill();
    } else if (annotation.type === 'rectangle') {
      context.strokeRect(annotation.rect.x, annotation.rect.y, annotation.rect.width, annotation.rect.height);
    } else if (annotation.type === 'ellipse') {
      context.beginPath();
      context.ellipse(annotation.rect.x + annotation.rect.width / 2, annotation.rect.y + annotation.rect.height / 2, annotation.rect.width / 2, annotation.rect.height / 2, 0, 0, Math.PI * 2);
      context.stroke();
    } else if (annotation.type === 'blur') {
      context.save();
      context.setLineDash([8, 5]);
      context.strokeRect(annotation.rect.x, annotation.rect.y, annotation.rect.width, annotation.rect.height);
      context.restore();
      context.fillStyle = '#fff';
      context.font = '800 14px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('REDACTED', annotation.rect.x + annotation.rect.width / 2, annotation.rect.y + annotation.rect.height / 2);
    } else if (annotation.type === 'pin') {
      context.beginPath();
      context.arc(annotation.point.x, annotation.point.y, 15, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff';
      context.font = '800 15px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(annotation.number), annotation.point.x, annotation.point.y + 1);
    } else if (annotation.type === 'text') {
      context.font = '800 18px system-ui';
      context.lineWidth = 4;
      context.strokeStyle = '#fff';
      context.strokeText(annotation.text, annotation.point.x, annotation.point.y);
      context.fillStyle = color;
      context.fillText(annotation.text, annotation.point.x, annotation.point.y);
    }
  }

  async function downloadHtmlReport() {
    setError('');
    const button = document.getElementById('download-html');
    button.disabled = true;
    setStatus('Building self-contained HTML report...');
    try {
      await validateHistoryImages();
      const annotatedImages = await collectAnnotatedImages();
      downloadFile('dev-feedback-report.html', buildHtmlReport(annotatedImages), 'text/html');
      setStatus('Self-contained HTML report downloaded.');
    } catch (error) {
      setError(error.message || 'Unable to build the HTML report.');
    } finally {
      button.disabled = false;
    }
  }

  async function copyMarkdown() {
    const markdown = exportSnapshot.map((history) => buildMarkdownExport(getGroupSource(history), history.items)).join('\n');
    await copyText(markdown, 'Markdown copied.');
  }

  async function copyAiPrompt() {
    const allItems = exportSnapshot.flatMap((history) => history.items);
    const prompt = buildAiPromptExport(getGroupSource(exportSnapshot[0]), allItems);
    await copyText(prompt, 'AI prompt copied. Download the AI Bundle to include evidence images.');
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
      histories: exportSnapshot.map((history) => ({ storageKey: history.storageKey, items: history.items }))
    };
  }

  function buildHtmlReport(annotatedImages = new Map()) {
    const sections = exportSnapshot.map((history) => {
      const items = history.items.map((item, index) => {
        const evidence = buildStandaloneEvidenceHtml(item, index + 1, annotatedImages);
        const locator = item.type === CAPTURE_TYPE_REGION ? item.pageUrl : item.selector;
        const request = buildStandaloneRequestHtml(item);
        const acceptance = buildStandaloneAcceptanceHtml(item.acceptance);
        return `<article><h3>${index + 1}. ${escapeHtml(item.type)}</h3>${request}${evidence}${acceptance}<dl><dt>Source</dt><dd>${escapeHtml(item.pageUrl)}</dd><dt>Locator</dt><dd>${escapeHtml(locator)}</dd><dt>Captured</dt><dd>${escapeHtml(formatTimestamp(item.timestamp))}</dd></dl></article>`;
      }).join('');
      return `<section><h2>${escapeHtml(getGroupLabel(history))}</h2>${items}</section>`;
    }).join('');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dev Feedback Report</title><style>body{max-width:1040px;margin:40px auto;padding:0 20px;font:16px/1.5 system-ui;color:#182019}section{margin:36px 0}article{border:1px solid #ccd7ce;border-radius:10px;padding:18px;margin:14px 0}.evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:16px 0}figure{margin:0}img{display:block;width:100%;max-height:560px;object-fit:contain;border-radius:7px;background:#eef2ef}figcaption{margin-top:6px;color:#526056;font-size:14px}.request-kind{font-weight:700}.mutation-list,.acceptance-list{padding-left:22px}dl{display:grid;grid-template-columns:100px 1fr;gap:6px}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}</style></head><body><h1>Dev Feedback Report</h1><p>Exported ${escapeHtml(new Date().toLocaleString())}. Original, proposed, and annotated evidence remain explicitly labeled.</p>${sections}</body></html>`;
  }

  function buildStandaloneEvidenceHtml(item, itemNumber, annotatedImages) {
    const evidence = item.type === CAPTURE_TYPE_REGION
      ? [
          ['Original (Before)', item.screenshot?.dataUrl],
          ['Annotated guidance', item.screenshot?.annotatedDataUrl || annotatedImages.get(item.id)]
        ]
      : [
          ['Original (Before)', item.evidence?.before?.dataUrl],
          ['Proposed', item.evidence?.proposed?.dataUrl]
        ];
    const figures = evidence.flatMap(([label, dataUrl]) => dataUrl
      ? [`<figure><img src="${escapeHtml(dataUrl)}" alt="Item ${itemNumber} ${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`]
      : []);
    return figures.length ? `<div class="evidence-grid">${figures.join('')}</div>` : '';
  }

  function buildStandaloneRequestHtml(item) {
    const summary = escapeHtml(item.changeRequest?.summary || item.note);
    if (item.changeRequest?.kind !== 'requested-mutation') {
      return `<p class="request-kind">Visual suggestion</p><p>${summary}</p>`;
    }
    const mutations = item.changeRequest.requestedMutations
      .map((mutation) => `<li>${escapeHtml(formatMutationSummary(mutation))}</li>`)
      .join('');
    return `<p class="request-kind">Requested mutation</p><p>${summary}</p><ul class="mutation-list">${mutations}</ul>`;
  }

  function buildStandaloneAcceptanceHtml(acceptance) {
    if (!acceptance?.length) {
      return '<h4>Acceptance criteria (unverified)</h4><p>None supplied.</p>';
    }
    return `<h4>Acceptance criteria (unverified)</h4><ul class="acceptance-list">${acceptance.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join('')}</ul>`;
  }

  function getRequestKindLabel(item) {
    return item.changeRequest?.kind === 'requested-mutation'
      ? 'Requested mutation'
      : 'Visual suggestion';
  }

  function formatMutationSummary(mutation) {
    const target = mutation?.target || {};
    const identity = target.selectors?.[0]
      || target.role
      || target.tag
      || target.text
      || formatMutationRect(target.rect);
    if (mutation?.action === 'insert') {
      const content = mutation.parameters?.content || {};
      const placement = mutation.parameters?.placement || 'after';
      const details = [content.title, content.body, content.support].filter(Boolean).join(' | ');
      return `insert ${content.type || 'content'} ${placement} ${identity || 'unknown target'}${details ? `; ${details}` : ''}`;
    }
    const parameters = mutation?.parameters && Object.keys(mutation.parameters).length
      ? `; parameters=${JSON.stringify(mutation.parameters)}`
      : '';
    return `${mutation?.action || 'change'} -> ${identity || 'unknown target'}${parameters}`;
  }

  function formatMutationRect(rect) {
    return rect?.width > 0 && rect?.height > 0
      ? `rect(${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`
      : '';
  }

  function buildMutationSearchText(item) {
    if (!Array.isArray(item.changeRequest?.requestedMutations)) {
      return '';
    }
    return item.changeRequest.requestedMutations.map((mutation) => [
      mutation.id,
      mutation.action,
      mutation.target?.selectors?.join(' '),
      mutation.target?.tag,
      mutation.target?.role,
      mutation.target?.text,
      mutation.target?.surroundingText,
      JSON.stringify(mutation.parameters || {})
    ].join(' ')).join(' ');
  }

  function downloadFile(filename, contents, type) {
    downloadBlob(filename, new Blob([contents], { type }));
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
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
    ['download-ai-bundle', 'download-json', 'download-html', 'copy-markdown', 'copy-ai', 'clear-all'].forEach((id) => {
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
