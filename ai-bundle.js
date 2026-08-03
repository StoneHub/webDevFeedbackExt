(function(root, factory) {
  const api = factory(root);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.DevFeedbackBundle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  const IMAGE_MIME_EXTENSIONS = Object.freeze({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp'
  });

  function buildAiBundle(histories, options) {
    const shared = getShared();
    const settings = options || {};
    const exportedAt = normalizeExportedAt(settings.exportedAt);
    const normalized = normalizeHistories(histories, shared, settings);
    const allItems = normalized.flatMap((history) => history.items.map((record) => record.item));
    const imageEntries = [];
    const feedbackHistories = [];
    const pageContexts = new Map();
    let globalIndex = 0;

    normalized.forEach((history) => {
      const feedbackItems = history.items.map((record) => {
        globalIndex += 1;
        const number = String(globalIndex).padStart(Math.max(2, String(allItems.length).length), '0');
        const imagePaths = buildImageEntries(record, number, globalIndex, settings, imageEntries);
        const feedbackItem = buildFeedbackItem(record.item, imagePaths);
        const context = buildItemContext(feedbackItem, globalIndex, shared);
        const contextKey = context.pageUrl || `untitled:${context.pageTitle}`;

        if (!pageContexts.has(contextKey)) {
          pageContexts.set(contextKey, {
            pageUrl: context.pageUrl,
            pageTitle: context.pageTitle,
            sourceKind: context.sourceKind,
            items: []
          });
        }
        pageContexts.get(contextKey).items.push(context.item);

        return feedbackItem;
      });

      feedbackHistories.push({ storageKey: history.storageKey, items: feedbackItems });
    });

    const feedbackPayload = {
      schemaVersion: 3,
      exportedAt,
      histories: feedbackHistories
    };
    const pageContextPayload = {
      schemaVersion: 2,
      exportedAt,
      pages: Array.from(pageContexts.values())
    };
    const prompt = buildPrompt(feedbackPayload);
    const report = buildReport(feedbackPayload, exportedAt);
    const entries = [
      { name: 'prompt.md', data: prompt },
      { name: 'feedback.json', data: JSON.stringify(feedbackPayload, null, 2) },
      { name: 'page-context.json', data: JSON.stringify(pageContextPayload, null, 2) },
      { name: 'report.html', data: report },
      ...imageEntries
    ];
    const bytes = createZipArchive(entries);

    return {
      bytes,
      filename: settings.filename || `dev-feedback-ai-bundle-${safeTimestamp(exportedAt)}.zip`,
      entryNames: entries.map((entry) => entry.name)
    };
  }

  function normalizeHistories(histories, shared, options) {
    if (!Array.isArray(histories)) {
      return [];
    }

    return histories.map((history) => {
      const rawItems = Array.isArray(history?.items) ? history.items : [];
      const items = rawItems.flatMap((rawItem) => {
        const normalized = shared.sanitizeFeedbackItems(
          [rawItem],
          rawItem?.pageUrl || options.fallbackUrl,
          rawItem?.pageTitle || options.fallbackTitle
        );
        return normalized.length ? [{ item: normalized[0], rawItem }] : [];
      });
      return {
        storageKey: typeof history?.storageKey === 'string' ? history.storageKey : '',
        items
      };
    });
  }

  function buildImageEntries(record, number, globalIndex, options, entries) {
    const imagePaths = {};

    if (record.item.type !== 'region') {
      addElementEvidenceEntry(record, 'before', number, imagePaths, entries);
      addElementEvidenceEntry(record, 'proposed', number, imagePaths, entries);
      return imagePaths;
    }

    const before = decodeImageSource(record.item.screenshot);
    if (record.item.screenshot?.dataUrl && !before) {
      throw new Error(`Invalid before image data for feedback item ${record.item.id}.`);
    }
    if (before) {
      imagePaths.before = `${number}-before.${before.extension}`;
      entries.push({ name: imagePaths.before, data: before.bytes });
    }

    const annotatedSource = resolveAnnotatedImage(record.rawItem, record.item, globalIndex, options);
    const annotated = decodeImageSource(annotatedSource);
    if (annotatedSource && !annotated) {
      throw new Error(`Invalid annotated image data for feedback item ${record.item.id}.`);
    }
    if (annotated) {
      imagePaths.annotated = `${number}-annotated.${annotated.extension}`;
      entries.push({ name: imagePaths.annotated, data: annotated.bytes });
    }

    return imagePaths;
  }

  function addElementEvidenceEntry(record, kind, number, imagePaths, entries) {
    const item = record.item;
    const source = item.evidence?.[kind];
    const rawEvidence = record.rawItem?.evidence;
    const rawSource = rawEvidence && typeof rawEvidence === 'object'
      ? rawEvidence[kind] ?? rawEvidence[`${kind}DataUrl`]
      : null;
    if (!source?.dataUrl) {
      if (rawSource) {
        throw new Error(`Invalid ${kind} image data for feedback item ${item.id}.`);
      }
      return;
    }

    const decoded = decodeImageSource(source);
    if (!decoded || decoded.extension !== 'png') {
      throw new Error(`Invalid ${kind} image data for feedback item ${item.id}.`);
    }

    imagePaths[kind] = `${number}-${kind}.png`;
    entries.push({ name: imagePaths[kind], data: decoded.bytes });
  }

  function resolveAnnotatedImage(rawItem, item, globalIndex, options) {
    const configured = options.annotatedImages;
    let supplied;

    if (configured instanceof Map) {
      supplied = configured.get(item.id) || configured.get(globalIndex) || configured.get(String(globalIndex));
    } else if (Array.isArray(configured)) {
      supplied = configured[globalIndex - 1];
    } else if (configured && typeof configured === 'object') {
      supplied = configured[item.id] || configured[globalIndex] || configured[String(globalIndex)];
    }

    return supplied
      || rawItem?.annotatedScreenshot
      || rawItem?.annotatedImage
      || rawItem?.screenshot?.annotated
      || rawItem?.screenshot?.annotatedDataUrl
      || rawItem?.annotation?.screenshot
      || null;
  }

  function buildFeedbackItem(item, imagePaths) {
    if (item.type === 'region') {
      return {
        ...item,
        screenshot: { mimeType: item.screenshot?.mimeType || 'image/png' },
        imagePaths
      };
    }

    const { evidence, ...feedbackItem } = item;
    const bundledEvidence = buildBundledEvidence(evidence, imagePaths);
    return {
      ...feedbackItem,
      ...(bundledEvidence ? { evidence: bundledEvidence } : {}),
      ...(Object.keys(imagePaths).length ? { imagePaths } : {})
    };
  }

  function buildBundledEvidence(evidence, imagePaths) {
    if (!evidence || typeof evidence !== 'object') {
      return null;
    }

    const result = {};
    ['before', 'proposed'].forEach((kind) => {
      const asset = evidence[kind];
      if (!asset || !imagePaths[kind]) {
        return;
      }
      result[kind] = {
        mimeType: 'image/png',
        source: asset.source || { kind: 'unknown' },
        path: imagePaths[kind]
      };
    });
    return Object.keys(result).length ? result : null;
  }

  function buildItemContext(item, number, shared) {
    const pageContext = item.pageContext || {};
    const pageUrl = pageContext.url || item.tabContext?.url || item.pageUrl || '';
    const pageTitle = pageContext.title || item.tabContext?.title || item.pageTitle || '';
    const sourceKind = pageContext.sourceKind || item.sourceKind || shared.detectSourceKind(pageUrl);
    const contextItem = {
      number,
      id: item.id,
      type: item.type,
      capturedAt: item.timestamp,
      note: item.note,
      changeRequest: item.changeRequest,
      acceptance: item.acceptance || [],
      pageContext
    };

    if (item.type === 'region') {
      contextItem.viewportRect = item.viewportRect;
      contextItem.devicePixelRatio = item.devicePixelRatio;
      contextItem.imagePaths = item.imagePaths;
      contextItem.annotationCount = item.annotations?.length || 0;
    } else {
      contextItem.selector = item.selector;
      contextItem.elementInfo = item.elementInfo;
      contextItem.proposedElementInfo = item.proposedElementInfo;
      contextItem.position = item.position;
      contextItem.imagePaths = item.imagePaths || {};
    }

    return { pageUrl, pageTitle, sourceKind, pageContext, item: contextItem };
  }

  function buildPrompt(feedbackPayload) {
    const lines = [
      '# Dev Feedback Implementation Bundle',
      '',
      'Implement the requested changes using `feedback.json` as the canonical item data and `page-context.json` for source-page grouping.',
      'Region captures are viewport crops, not full-page or source-code snapshots. Do not infer unseen page state.',
      ''
    ];
    let number = 0;

    feedbackPayload.histories.forEach((history) => {
      history.items.forEach((item) => {
        number += 1;
        lines.push(`## Item ${number}`, '');
        lines.push(`Source: ${escapeMarkdownText(item.pageContext?.url || item.tabContext?.url || item.pageUrl || 'unknown')}`);
        lines.push(`Type: ${escapeMarkdownText(item.type)}`);
        lines.push(`Request kind: ${getRequestKindLabel(item)}`);
        if (item.changeRequest?.kind === 'requested-mutation') {
          lines.push('Requested mutations:');
          item.changeRequest.requestedMutations.forEach((mutation) => {
            lines.push(`- ${escapeMarkdownText(formatMutationSummary(mutation))}`);
          });
        } else {
          lines.push(`Visual suggestion: ${escapeMarkdownText(item.changeRequest?.summary || item.note)}`);
        }
        lines.push(`Before evidence: ${formatPromptEvidence(item.imagePaths?.before)}`);
        lines.push(`Proposed evidence: ${formatPromptEvidence(item.imagePaths?.proposed)}`);
        lines.push(`Annotated guidance: ${formatPromptEvidence(item.imagePaths?.annotated)}`);
        if (item.type === 'region') {
          lines.push(`Viewport rect: x=${item.viewportRect.x}, y=${item.viewportRect.y}, width=${item.viewportRect.width}, height=${item.viewportRect.height}`);
          item.annotations.forEach((annotation, annotationIndex) => {
            const anchor = annotation.target?.selectors?.join(' or ');
            lines.push(`Annotation ${annotationIndex + 1}: ${escapeMarkdownText(annotation.type)}${anchor ? ` anchored to ${escapeMarkdownText(anchor)}` : ' (visual only)'}`);
          });
        } else {
          lines.push(`Selector: ${escapeMarkdownText(item.selector)}`);
          lines.push(`Original element: ${escapeMarkdownText(item.elementInfo.tag)}${item.elementInfo.role ? `, role=${escapeMarkdownText(item.elementInfo.role)}` : ''}`);
          if (item.proposedElementInfo) {
            lines.push(`Proposed element: ${escapeMarkdownText(item.proposedElementInfo.tag)}${item.proposedElementInfo.role ? `, role=${escapeMarkdownText(item.proposedElementInfo.role)}` : ''}`);
          }
        }
        lines.push(`Summary: ${escapeMarkdownText(item.changeRequest?.summary || item.note)}`);
        lines.push('Acceptance criteria (unverified):');
        if (item.acceptance.length) {
          item.acceptance.forEach((criterion) => lines.push(`- [ ] ${escapeMarkdownText(criterion)}`));
        } else {
          lines.push('- None supplied');
        }
        lines.push('');
      });
    });
    return `${lines.join('\n').trim()}\n`;
  }

  function buildReport(feedbackPayload, exportedAt) {
    let globalIndex = 0;
    const sections = feedbackPayload.histories.map((history) => {
      const items = history.items.map((item) => {
        globalIndex += 1;
        const images = buildBundleEvidenceFigures(item, globalIndex);
        const locator = item.type === 'region'
          ? formatRect(item.viewportRect)
          : item.selector;
        const request = buildRequestHtml(item);
        const evidence = buildEvidenceSummaryHtml(item);
        const acceptance = buildAcceptanceHtml(item.acceptance);
        return `<article><h3>Item ${globalIndex}: ${escapeHtml(item.type)}</h3>${request}${images}${evidence}${acceptance}<dl><dt>Source</dt><dd>${escapeHtml(item.pageContext?.url || item.tabContext?.url || item.pageUrl)}</dd><dt>Locator</dt><dd>${escapeHtml(locator)}</dd><dt>Captured</dt><dd>${escapeHtml(item.timestamp)}</dd></dl></article>`;
      }).join('');
      return `<section><h2>${escapeHtml(getHistoryLabel(history))}</h2>${items}</section>`;
    }).join('');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dev Feedback AI Bundle</title><style>body{max-width:1040px;margin:40px auto;padding:0 20px;font:16px/1.5 system-ui;color:#182019}section{margin:36px 0}article{border:1px solid #ccd7ce;border-radius:10px;padding:18px;margin:14px 0}.evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:16px 0}figure{margin:0}img{display:block;width:100%;max-height:560px;object-fit:contain;border-radius:7px;background:#eef2ef}figcaption{margin-top:6px;color:#526056;font-size:14px}.request-kind{font-weight:700}.mutation-list,.acceptance-list{padding-left:22px}dl{display:grid;grid-template-columns:140px 1fr;gap:6px}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}</style></head><body><h1>Dev Feedback AI Bundle</h1><p>Exported ${escapeHtml(exportedAt)}. Image files are stored beside this report.</p>${sections}</body></html>`;
  }

  function buildBundleEvidenceFigures(item, itemNumber) {
    const kinds = item.type === 'region'
      ? [['before', 'Original (Before)'], ['annotated', 'Annotated guidance']]
      : [['before', 'Original (Before)'], ['proposed', 'Proposed']];
    const figures = kinds.flatMap(([kind, label]) => {
      const path = item.imagePaths?.[kind];
      return path
        ? [`<figure><img src="${escapeHtml(path)}" alt="Item ${itemNumber} ${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`]
        : [];
    });
    return figures.length ? `<div class="evidence-grid">${figures.join('')}</div>` : '';
  }

  function buildRequestHtml(item) {
    const summary = escapeHtml(item.changeRequest?.summary || item.note);
    if (item.changeRequest?.kind !== 'requested-mutation') {
      return `<p class="request-kind">Visual suggestion</p><p>${summary}</p>`;
    }
    const mutations = item.changeRequest.requestedMutations
      .map((mutation) => `<li>${escapeHtml(formatMutationSummary(mutation))}</li>`)
      .join('');
    return `<p class="request-kind">Requested mutation</p><p>${summary}</p><ul class="mutation-list">${mutations}</ul>`;
  }

  function buildEvidenceSummaryHtml(item) {
    return `<dl><dt>Before evidence</dt><dd>${escapeHtml(item.imagePaths?.before || 'Not supplied')}</dd><dt>Proposed evidence</dt><dd>${escapeHtml(item.imagePaths?.proposed || 'Not supplied')}</dd><dt>Annotated guidance</dt><dd>${escapeHtml(item.imagePaths?.annotated || 'Not supplied')}</dd></dl>`;
  }

  function buildAcceptanceHtml(acceptance) {
    const criteria = Array.isArray(acceptance) ? acceptance : [];
    if (!criteria.length) {
      return '<h4>Acceptance criteria (unverified)</h4><p>None supplied.</p>';
    }
    return `<h4>Acceptance criteria (unverified)</h4><ul class="acceptance-list">${criteria.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join('')}</ul>`;
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
      || formatRect(target.rect);
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

  function formatPromptEvidence(path) {
    return path ? `\`${path}\`` : 'not supplied';
  }

  function escapeMarkdownText(value) {
    return String(value || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getHistoryLabel(history) {
    const first = history.items[0];
    const rawUrl = first?.tabContext?.url || first?.pageUrl || '';
    try {
      const url = new URL(rawUrl);
      return url.protocol === 'file:'
        ? decodeURIComponent(url.pathname.split('/').pop() || url.href)
        : url.origin;
    } catch (error) {
      return first?.pageTitle || history.storageKey || 'Saved feedback';
    }
  }

  function formatRect(rect) {
    return `x=${rect?.x || 0}, y=${rect?.y || 0}, width=${rect?.width || 0}, height=${rect?.height || 0}`;
  }

  function decodeImageSource(source) {
    const dataUrl = typeof source === 'string' ? source : source?.dataUrl;
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl || '');
    if (!match) {
      return null;
    }

    try {
      const mimeType = match[1].toLowerCase();
      const bytes = decodeBase64(match[2].replace(/\s/g, ''));
      if (!hasExpectedImageSignature(bytes, mimeType)) {
        return null;
      }
      return { bytes, extension: IMAGE_MIME_EXTENSIONS[mimeType] };
    } catch (error) {
      return null;
    }
  }

  function decodeBase64(value) {
    if (!value || value.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(value)) {
      throw new Error('Invalid base64 image data');
    }
    if (typeof root.atob === 'function') {
      const binary = root.atob(value);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    if (typeof Buffer !== 'undefined') {
      const buffer = Buffer.from(value, 'base64');
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    throw new Error('No base64 decoder is available');
  }

  function hasExpectedImageSignature(bytes, mimeType) {
    if (mimeType === 'image/png') {
      if (
        bytes.length < 45
        || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
        || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
        || readUint32(bytes, 8, false) !== 13
        || ascii(bytes, 12, 16) !== 'IHDR'
        || readUint32(bytes, 16, false) === 0
        || readUint32(bytes, 20, false) === 0
      ) {
        return false;
      }

      let offset = 8;
      let seenIdat = false;
      while (offset + 12 <= bytes.length) {
        const chunkLength = readUint32(bytes, offset, false);
        const chunkEnd = offset + 12 + chunkLength;
        if (chunkEnd > bytes.length) {
          return false;
        }
        const chunkType = ascii(bytes, offset + 4, offset + 8);
        const expectedCrc = readUint32(bytes, offset + 8 + chunkLength, false);
        const actualCrc = crc32(bytes.slice(offset + 4, offset + 8 + chunkLength));
        if (expectedCrc !== actualCrc) {
          return false;
        }
        if (chunkType === 'IDAT') {
          seenIdat = seenIdat || chunkLength > 0;
        }
        if (chunkType === 'IEND') {
          return seenIdat && chunkLength === 0 && chunkEnd === bytes.length;
        }
        offset = chunkEnd;
      }
      return false;
    }
    if (mimeType === 'image/jpeg') {
      return isStructurallyValidJpeg(bytes);
    }
    return isStructurallyValidWebp(bytes);
  }

  function isStructurallyValidJpeg(bytes) {
    if (
      bytes.length < 20
      || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
    ) {
      return false;
    }
    let offset = 2;
    let seenFrame = false;
    let seenScan = false;
    while (offset < bytes.length - 2) {
      if (bytes[offset] !== 0xff) {
        return false;
      }
      while (bytes[offset] === 0xff) {
        offset += 1;
      }
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd9) {
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      const segmentLength = readUint16(bytes, offset, false);
      const segmentEnd = offset + segmentLength;
      if (segmentLength < 2 || segmentEnd > bytes.length) {
        return false;
      }
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        seenFrame = segmentLength >= 8
          && readUint16(bytes, offset + 3, false) > 0
          && readUint16(bytes, offset + 5, false) > 0;
      }
      if (marker === 0xda) {
        seenScan = true;
        break;
      }
      offset = segmentEnd;
    }
    return seenFrame && seenScan;
  }

  function isStructurallyValidWebp(bytes) {
    if (
      bytes.length < 30
      || ascii(bytes, 0, 4) !== 'RIFF'
      || ascii(bytes, 8, 12) !== 'WEBP'
      || readUint32(bytes, 4, true) + 8 !== bytes.length
    ) {
      return false;
    }
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkType = ascii(bytes, offset, offset + 4);
      const chunkLength = readUint32(bytes, offset + 4, true);
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkLength;
      if (dataEnd > bytes.length) {
        return false;
      }
      if (
        chunkType === 'VP8 '
        && chunkLength >= 10
        && bytes[dataStart + 3] === 0x9d && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2a
        && (bytes[dataStart + 6] | bytes[dataStart + 7]) !== 0
        && (bytes[dataStart + 8] | bytes[dataStart + 9]) !== 0
      ) {
        return true;
      }
      if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[dataStart] === 0x2f) {
        return true;
      }
      offset = dataEnd + (chunkLength % 2);
    }
    return false;
  }

  function readUint32(bytes, offset, littleEndian) {
    if (offset + 4 > bytes.length) {
      return -1;
    }
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, littleEndian);
  }

  function readUint16(bytes, offset, littleEndian) {
    if (offset + 2 > bytes.length) {
      return -1;
    }
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, littleEndian);
  }

  function ascii(bytes, start, end) {
    return String.fromCharCode(...bytes.slice(start, end));
  }

  function createZipArchive(rawEntries) {
    const entries = (Array.isArray(rawEntries) ? rawEntries : []).map((entry) => {
      const name = normalizeEntryName(entry?.name);
      const nameBytes = encodeUtf8(name);
      const data = toBytes(entry?.data);
      return { name, nameBytes, data, crc: crc32(data) };
    });
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const local = new Uint8Array(30);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint32(14, entry.crc, true);
      localView.setUint32(18, entry.data.length, true);
      localView.setUint32(22, entry.data.length, true);
      localView.setUint16(26, entry.nameBytes.length, true);
      localParts.push(local, entry.nameBytes, entry.data);

      const central = new Uint8Array(46);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint32(16, entry.crc, true);
      centralView.setUint32(20, entry.data.length, true);
      centralView.setUint32(24, entry.data.length, true);
      centralView.setUint16(28, entry.nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralParts.push(central, entry.nameBytes);
      offset += local.length + entry.nameBytes.length + entry.data.length;
    });

    const centralDirectory = concatBytes(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);
    return concatBytes([...localParts, centralDirectory, end]);
  }

  function normalizeEntryName(value) {
    const name = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name || name.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error(`Invalid ZIP entry name: ${value}`);
    }
    return name;
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return encodeUtf8(String(value ?? ''));
  }

  function encodeUtf8(value) {
    if (typeof root.TextEncoder === 'function') {
      return new root.TextEncoder().encode(value);
    }
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(value, 'utf8'));
    }
    throw new Error('No UTF-8 encoder is available');
  }

  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function normalizeExportedAt(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function safeTimestamp(isoString) {
    return isoString.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function getShared() {
    const shared = root.DevFeedbackShared;
    if (!shared || typeof shared.sanitizeFeedbackItems !== 'function' || typeof shared.buildAiPromptExport !== 'function') {
      throw new Error('DevFeedbackShared must be loaded before building an AI bundle');
    }
    return shared;
  }

  return {
    buildAiBundle,
    createZipArchive
  };
});
