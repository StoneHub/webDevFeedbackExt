import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createDevFeedbackServer } from '../mcp/server.mjs';
import { constants, createProjectStore } from '../mcp/store.mjs';

const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const VALID_PNG_BYTES = Buffer.from(VALID_PNG_DATA_URL.split(',')[1], 'base64');
const VALID_WEBP_BYTES = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA', 'base64');
const execFileAsync = promisify(execFile);
const PACKAGE_VERSION = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

test('project store supports agent feedback, revisions, evidence, and briefs', async (t) => {
  const fixture = await createFixture(t);
  const store = await createProjectStore(inboxOptions(fixture, { clock: sequenceClock() }));

  const initial = await store.getProjectStatus();
  assert.equal(initial.itemCount, 0);
  assert.equal(initial.statusCounts.open, 0);
  assert.equal(initial.allowedImportRoots.includes(await fs.realpath(fixture.inboxRoot)), true);

  const created = await store.createFeedback({
    clientRequestId: 'agent-session/create-header-feedback',
    subject: { kind: 'file', path: 'src/header.js' },
    request: {
      kind: 'visual-suggestion',
      summary: 'Reduce the header height',
      acceptance: ['Header uses less vertical space']
    }
  }, { kind: 'agent', name: 'test-agent', version: '1.0.0' });
  assert.equal(created.created, true);
  assert.match(created.item.id, /^dfb_[a-f0-9]{24}$/);
  assert.equal(created.item.revision, 1);

  const duplicate = await store.createFeedback({
    clientRequestId: 'agent-session/create-header-feedback',
    subject: { kind: 'file', path: 'src/header.js' },
    request: {
      kind: 'visual-suggestion',
      summary: 'Reduce the header height',
      acceptance: ['Header uses less vertical space']
    }
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.item.id, created.item.id);
  await assert.rejects(() => store.createFeedback({
    clientRequestId: 'agent-session/create-header-feedback',
    subject: { kind: 'project' },
    request: { summary: 'This conflicting retry must be rejected' }
  }), /clientRequestId conflict/);

  await assert.rejects(
    () => store.createFeedback({
      clientRequestId: 'invalid-mutation',
      subject: { kind: 'element', url: 'http://localhost:5173', selector: '#save' },
      request: { kind: 'requested-mutation', summary: 'Run arbitrary code', requestedMutations: [{ action: 'execute-script' }] }
    }),
    /valid canonical mutation/
  );
  await assert.rejects(
    () => store.createFeedback({
      clientRequestId: 'mixed-mutation',
      subject: { kind: 'element', url: 'http://localhost:5173', selector: '#save' },
      request: {
        kind: 'requested-mutation',
        summary: 'Do one safe and one unsafe action',
        requestedMutations: [
          { action: 'hide', target: { selectors: ['#save'], tag: 'button' }, parameters: { hidden: true } },
          { action: 'execute-script' }
        ]
      }
    }),
    /Every requested mutation/
  );
  await assert.rejects(
    () => store.createFeedback({
      clientRequestId: 'unlocated-region',
      subject: { kind: 'region' },
      request: { summary: 'Change this unknown region' }
    }),
    /region subjects require url and a positive rect/
  );

  const inProgress = await store.updateStatus({
    feedbackId: created.item.id,
    expectedRevision: 1,
    status: 'in-progress',
    note: 'Working on the header.'
  }, { kind: 'agent', name: 'test-agent' });
  assert.equal(inProgress.item.revision, 2);
  assert.equal(inProgress.item.status, 'in-progress');
  await assert.rejects(
    () => store.updateStatus({ feedbackId: created.item.id, expectedRevision: 1, status: 'implemented' }),
    /Revision conflict/
  );

  const evidencePath = path.join(fixture.inboxRoot, 'header-before.png');
  await fs.writeFile(evidencePath, VALID_PNG_BYTES);
  const attached = await store.attachEvidence({
    feedbackId: created.item.id,
    expectedRevision: 2,
    kind: 'before',
    path: evidencePath,
    redactionState: 'not-required'
  }, { kind: 'agent', name: 'test-agent' });
  assert.equal(attached.item.revision, 3);
  assert.equal(attached.evidence.mimeType, 'image/png');
  assert.equal(attached.evidence.bytes, VALID_PNG_BYTES.length);
  assert.match(attached.evidence.uri, /^dev-feedback:\/\/feedback\//);

  const evidence = await store.readEvidence(created.item.id, 'before');
  assert.deepEqual(evidence.bytes, VALID_PNG_BYTES);

  const implemented = await store.updateStatus({
    feedbackId: created.item.id,
    expectedRevision: 3,
    status: 'implemented',
    note: 'Header spacing updated.',
    implementation: {
      commit: 'abc1234',
      files: ['src/header.js'],
      checks: [{ name: 'npm test', result: 'pass', details: 'green' }]
    }
  });
  assert.equal(implemented.item.status, 'implemented');
  const verified = await store.updateStatus({
    feedbackId: created.item.id,
    expectedRevision: 4,
    status: 'verified',
    implementation: { checks: [{ name: 'manual review', result: 'pass' }] }
  });
  assert.equal(verified.item.status, 'verified');

  const list = await store.listFeedback({ query: 'header', status: ['verified'] });
  assert.equal(list.items.length, 1);
  const brief = await store.buildImplementationBrief({ status: ['verified'] });
  assert.match(brief.markdown, /Reduce the header height/);
  assert.match(brief.markdown, /Header uses less vertical space/);
});

test('History JSON import is idempotent and strips embedded evidence', async (t) => {
  const fixture = await createFixture(t);
  const exportPath = path.join(fixture.inboxRoot, 'dev-feedback-history.json');
  await fs.writeFile(exportPath, JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-07-18T12:00:00.000Z',
    histories: [{
      storageKey: 'dev-feedback-http%3A%2F%2Flocalhost%3A5173',
      items: [{
        id: 'source-element-id',
        type: 'element',
        selector: '#save',
        pageUrl: 'http://localhost:5173/settings?tab=profile',
        pageTitle: 'Settings',
        note: 'Increase the save button contrast',
        timestamp: '2026-07-18T11:00:00.000Z',
        elementInfo: { tag: 'button', text: 'Save', styles: { color: '#777777' } },
        position: { x: 20, y: 30 },
        evidence: {
          before: { mimeType: 'image/png', dataUrl: VALID_PNG_DATA_URL, source: { kind: 'captured' } },
          proposed: { mimeType: 'image/png', dataUrl: VALID_PNG_DATA_URL, source: { kind: 'rendered-preview' } }
        },
        changeRequest: {
          kind: 'requested-mutation',
          summary: 'Increase the save button contrast',
          requestedMutations: [{
            action: 'restyle',
            target: { selectors: ['#save'], tag: 'button' },
            parameters: { styles: { color: '#111111' } }
          }]
        },
        acceptance: ['Text passes contrast review']
      }, {
        id: 'source-region-id',
        type: 'region',
        pageUrl: 'http://localhost:5173/',
        pageTitle: 'Home',
        note: 'Move the card higher',
        timestamp: '2026-07-18T11:05:00.000Z',
        viewportRect: { x: 0, y: 0, width: 1, height: 1 },
        devicePixelRatio: 1,
        screenshot: { mimeType: 'image/png', dataUrl: VALID_PNG_DATA_URL },
        annotations: [],
        acceptance: []
      }]
    }]
  }));

  const store = await createProjectStore(inboxOptions(fixture, { clock: sequenceClock() }));
  const first = await store.importFeedbackExport({ path: exportPath });
  assert.equal(first.imported.length, 2);
  assert.equal(first.updated.length, 0);

  const second = await store.importFeedbackExport({ path: exportPath });
  assert.equal(second.imported.length, 0);
  assert.equal(second.updated.length, 0);
  assert.equal(second.skipped.length, 2);

  const list = await store.listFeedback({ limit: 10 });
  assert.equal(list.items.length, 2);
  const elementSummary = list.items.find((item) => item.subject.kind === 'element');
  assert.deepEqual(elementSummary.evidenceKinds.sort(), ['before', 'proposed']);
  const element = await store.getFeedback(elementSummary.id);
  assert.equal(JSON.stringify(element.capture).includes('data:image'), false);
  assert.equal(element.request.kind, 'requested-mutation');
  assert.equal(element.implementation.status, 'open');

  const outsidePath = path.join(os.tmpdir(), `outside-feedback-${Date.now()}.json`);
  await fs.writeFile(outsidePath, '{"histories":[]}');
  t.after(() => fs.rm(outsidePath, { force: true }));
  await assert.rejects(() => store.importFeedbackExport({ path: outsidePath }), /outside the configured/);
});

test('inbox discovery lists only valid captures and latest import needs no path', async (t) => {
  const fixture = await createFixture(t);
  const validExports = [
    ['older.json', '2026-07-18T12:00:00.000Z', 'older-item', 'Older'],
    ['tie-b.json', '2026-07-18T12:02:00.000Z', 'tie-b-item', 'Tie B'],
    ['tie-a.json', '2026-07-18T12:02:00.000Z', 'tie-a-item', 'Tie A'],
    ['newest.json', '2026-07-18T12:03:00.000Z', 'newest-item', 'Newest']
  ];
  for (const [fileName, modifiedAt, id, note] of validExports) {
    const filePath = path.join(fixture.inboxRoot, fileName);
    await fs.writeFile(filePath, JSON.stringify(historyExport('inbox-site', id, note)));
    const time = new Date(modifiedAt);
    await fs.utimes(filePath, time, time);
  }
  await fs.writeFile(path.join(fixture.inboxRoot, 'invalid.json'), '{not-json');
  await fs.writeFile(path.join(fixture.inboxRoot, 'not-a-capture.json'), JSON.stringify({ version: 1 }));
  await fs.writeFile(path.join(fixture.inboxRoot, 'empty-capture.json'), JSON.stringify({ histories: [] }));
  await fs.writeFile(path.join(fixture.projectRoot, 'project-root-capture.json'), JSON.stringify(historyExport('project-site', 'project-item', 'Project')));

  const store = await createProjectStore(inboxOptions(fixture));
  const projectBeforeImport = await snapshotOutsideSidecar(fixture.projectRoot);
  const listed = await store.listInboxCaptures();
  assert.equal(listed.total, 4);
  assert.deepEqual(listed.captures.map((capture) => capture.fileName), [
    'newest.json',
    'tie-a.json',
    'tie-b.json',
    'older.json'
  ]);
  const inboxRoot = await fs.realpath(fixture.inboxRoot);
  assert.equal(listed.captures.every((capture) => capture.path.startsWith(`${inboxRoot}${path.sep}`)), true);

  const imported = await store.importLatestInboxCapture();
  assert.equal(imported.sourceFile, 'newest.json');
  assert.deepEqual(imported.imported.length, 1);
  assert.equal((await store.listFeedback()).total, 1);
  assert.deepEqual(await snapshotOutsideSidecar(fixture.projectRoot), projectBeforeImport);

  const repeated = await store.importLatestInboxCapture();
  assert.deepEqual(repeated.skipped, imported.imported);
  assert.equal((await store.listFeedback()).total, 1);
});

test('inbox latest import rejects when no valid capture JSON exists', async (t) => {
  const fixture = await createFixture(t);
  await fs.writeFile(path.join(fixture.inboxRoot, 'invalid.json'), '{not-json');
  await fs.writeFile(path.join(fixture.inboxRoot, 'not-a-capture.json'), JSON.stringify({ histories: [] }));
  const store = await createProjectStore(inboxOptions(fixture));

  assert.deepEqual((await store.listInboxCaptures()).captures, []);
  await assert.rejects(() => store.importLatestInboxCapture(), /No valid feedback capture JSON files found/);
});

test('latest inbox import never falls back when the newest capture needs a storageKey', async (t) => {
  const fixture = await createFixture(t);
  const olderPath = path.join(fixture.inboxRoot, 'older.json');
  await fs.writeFile(olderPath, JSON.stringify(historyExport('older-site', 'older-item', 'Older')));

  const newestPath = path.join(fixture.inboxRoot, 'newest-multiple.json');
  await fs.writeFile(newestPath, JSON.stringify({
    histories: [
      { storageKey: 'site-a', items: [{ id: 'a', type: 'element', pageUrl: 'https://a.test/', selector: '#a', note: 'A' }] },
      { storageKey: 'site-b', items: [{ id: 'b', type: 'element', pageUrl: 'https://b.test/', selector: '#b', note: 'B' }] }
    ]
  }));
  await fs.utimes(olderPath, new Date('2026-07-18T12:00:00.000Z'), new Date('2026-07-18T12:00:00.000Z'));
  await fs.utimes(newestPath, new Date('2026-07-18T12:01:00.000Z'), new Date('2026-07-18T12:01:00.000Z'));

  const store = await createProjectStore(inboxOptions(fixture));
  const listed = await store.listInboxCaptures();
  assert.equal(listed.captures[0].fileName, 'newest-multiple.json');
  assert.equal(listed.captures[0].requiresStorageKey, true);
  await assert.rejects(() => store.importLatestInboxCapture(), /multiple site\/file groups/);
  await assert.rejects(() => store.importLatestInboxCapture({ storageKey: 'missing' }), /storageKey was not found/);
  assert.equal((await store.listFeedback()).total, 0);

  const imported = await store.importLatestInboxCapture({ storageKey: 'site-b' });
  assert.equal(imported.sourceFile, 'newest-multiple.json');
  assert.equal((await store.listFeedback()).items[0].subject.url, 'https://b.test/');
});

test('configured inbox roots must canonicalize inside the approved Downloads root', async (t) => {
  const fixture = await createFixture(t);
  const outsideRoot = path.join(fixture.tempRoot, 'outside-downloads');
  await fs.mkdir(outsideRoot);

  await assert.rejects(
    () => createProjectStore({
      projectRoot: fixture.projectRoot,
      inboxRoots: [outsideRoot],
      approvedDownloadsRoot: fixture.inboxRoot
    }),
    /approved Downloads directory or one of its children/
  );

  const linkedOutside = path.join(fixture.inboxRoot, 'linked-outside');
  await fs.symlink(outsideRoot, linkedOutside, 'dir');
  await assert.rejects(
    () => createProjectStore({
      projectRoot: fixture.projectRoot,
      inboxRoots: [linkedOutside],
      approvedDownloadsRoot: fixture.inboxRoot
    }),
    /approved Downloads directory or one of its children/
  );
  await assert.rejects(() => fs.access(path.join(fixture.projectRoot, '.dev-feedback')));
});

test('latest inbox import skips files that fail the full import contract', async (t) => {
  const fixture = await createFixture(t);
  const validPath = path.join(fixture.inboxRoot, 'valid.json');
  await fs.writeFile(validPath, JSON.stringify(historyExport('valid-site', 'valid-item', 'Valid capture')));

  const badEvidence = historyExport('bad-evidence-site', 'bad-evidence-item', 'Bad evidence');
  badEvidence.histories[0].items[0].evidence = {
    before: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,bm90LWEtcG5n' }
  };
  const badEvidencePath = path.join(fixture.inboxRoot, 'bad-evidence.json');
  await fs.writeFile(badEvidencePath, JSON.stringify(badEvidence));

  const tooManyGroupsPath = path.join(fixture.inboxRoot, 'too-many-groups.json');
  await fs.writeFile(tooManyGroupsPath, JSON.stringify({
    histories: Array.from({ length: constants.MAX_IMPORT_HISTORIES + 1 }, (_, index) => ({
      storageKey: `group-${index}`,
      items: []
    }))
  }));

  const tooManyItems = historyExport('too-many-items-site', 'template-item', 'Too many items');
  tooManyItems.histories[0].items = Array.from(
    { length: constants.MAX_IMPORT_ITEMS + 1 },
    (_, index) => ({ ...tooManyItems.histories[0].items[0], id: `item-${index}` })
  );
  const tooManyItemsPath = path.join(fixture.inboxRoot, 'too-many-items.json');
  await fs.writeFile(tooManyItemsPath, JSON.stringify(tooManyItems));

  const oversizedPath = path.join(fixture.inboxRoot, 'oversized.json');
  await fs.writeFile(oversizedPath, '{');
  await fs.truncate(oversizedPath, constants.MAX_IMPORT_BYTES + 1);

  const filesByAge = [validPath, badEvidencePath, tooManyGroupsPath, tooManyItemsPath, oversizedPath];
  for (let index = 0; index < filesByAge.length; index += 1) {
    const time = new Date(Date.UTC(2026, 6, 18, 12, index));
    await fs.utimes(filesByAge[index], time, time);
  }

  const store = await createProjectStore(inboxOptions(fixture));
  const listed = await store.listInboxCaptures();
  assert.deepEqual(listed.captures.map((capture) => capture.fileName), ['valid.json']);
  const imported = await store.importLatestInboxCapture();
  assert.equal(imported.sourceFile, 'valid.json');
  assert.equal(imported.imported.length, 1);
});

test('inbox import rejects missing history identity and incomplete capture records', async (t) => {
  const fixture = await createFixture(t);
  const store = await createProjectStore(inboxOptions(fixture));
  const missingStorageKey = path.join(fixture.inboxRoot, 'missing-storage-key.json');
  await fs.writeFile(missingStorageKey, JSON.stringify({ histories: [{ items: [
    { id: 'element', type: 'element', pageUrl: 'https://invalid.test/', selector: '#valid', note: 'Missing group identity' }
  ] }] }));
  await assert.rejects(() => store.importFeedbackExport({ path: missingStorageKey }), /missing a valid storageKey/);

  const missingSelector = path.join(fixture.inboxRoot, 'missing-selector.json');
  await fs.writeFile(missingSelector, JSON.stringify({ histories: [{ storageKey: 'element-site', items: [
    { id: 'element', type: 'element', pageUrl: 'https://invalid.test/', selector: '   ', note: 'Missing selector' }
  ] }] }));
  await assert.rejects(() => store.importFeedbackExport({ path: missingSelector }), /requires a valid selector/);

  const missingRegionEvidence = path.join(fixture.inboxRoot, 'missing-region-evidence.json');
  await fs.writeFile(missingRegionEvidence, JSON.stringify({ histories: [{ storageKey: 'region-site', items: [
    { id: 'region', type: 'region', pageUrl: 'https://invalid.test/', note: 'Missing screenshot', annotations: [] }
  ] }] }));
  await assert.rejects(() => store.importFeedbackExport({ path: missingRegionEvidence }), /requires valid before evidence/);
  assert.equal((await store.listFeedback()).total, 0);
});

test('inbox discovery bounds depth, candidate count, and bytes before parsing', async (t) => {
  const depthFixture = await createFixture(t);
  let deepRoot = depthFixture.inboxRoot;
  for (let depth = 0; depth <= constants.MAX_INBOX_DISCOVERY_DEPTH; depth += 1) {
    deepRoot = path.join(deepRoot, `depth-${depth}`);
    await fs.mkdir(deepRoot);
  }
  await fs.writeFile(path.join(deepRoot, 'too-deep.json'), JSON.stringify(historyExport('deep-site', 'deep-item', 'Deep')));
  const depthStore = await createProjectStore(inboxOptions(depthFixture));
  assert.deepEqual((await depthStore.listInboxCaptures()).captures, []);

  const countFixture = await createFixture(t);
  for (let index = 0; index <= constants.MAX_INBOX_CANDIDATE_FILES; index += 1) {
    await fs.writeFile(path.join(countFixture.inboxRoot, `candidate-${String(index).padStart(4, '0')}.json`), '{}');
  }
  const countStore = await createProjectStore(inboxOptions(countFixture));
  await assert.rejects(() => countStore.listInboxCaptures(), /candidate-file limit/);

  const byteFixture = await createFixture(t);
  const halfBudget = Math.floor(constants.MAX_INBOX_DISCOVERY_BYTES / 2) + 1;
  for (const fileName of ['bytes-a.json', 'bytes-b.json']) {
    const filePath = path.join(byteFixture.inboxRoot, fileName);
    await fs.writeFile(filePath, '{');
    await fs.truncate(filePath, halfBudget);
  }
  const byteStore = await createProjectStore(inboxOptions(byteFixture));
  await assert.rejects(() => byteStore.listInboxCaptures(), /byte budget/);
});

test('inbox discovery and import reject static file and directory symlinks', async (t) => {
  const fixture = await createFixture(t);
  const targetPath = path.join(fixture.inboxRoot, 'capture-target.data');
  await fs.writeFile(targetPath, JSON.stringify(historyExport('symlink-site', 'symlink-item', 'Symlink')));
  const fileLink = path.join(fixture.inboxRoot, 'linked-capture.json');
  await fs.symlink(targetPath, fileLink, 'file');

  const outsideDirectory = path.join(fixture.tempRoot, 'outside-directory');
  await fs.mkdir(outsideDirectory);
  await fs.writeFile(path.join(outsideDirectory, 'nested.json'), JSON.stringify(historyExport('nested-site', 'nested-item', 'Nested')));
  const directoryLink = path.join(fixture.inboxRoot, 'linked-directory');
  await fs.symlink(outsideDirectory, directoryLink, 'dir');

  const store = await createProjectStore(inboxOptions(fixture));
  assert.deepEqual((await store.listInboxCaptures()).captures, []);
  await assert.rejects(() => store.importFeedbackExport({ path: fileLink }), /symlink/);
  await assert.rejects(
    () => store.importFeedbackExport({ path: path.join(directoryLink, 'nested.json') }),
    /outside the configured project\/inbox roots|symlink/
  );
  await assert.rejects(() => store.importLatestInboxCapture(), /No valid feedback capture JSON files found/);
});

test('MCP protocol exposes project-scoped tools and resources', async (t) => {
  const fixture = await createFixture(t);
  await fs.writeFile(
    path.join(fixture.inboxRoot, 'protocol-history.json'),
    JSON.stringify(historyExport('protocol-site', 'protocol-capture', 'Protocol capture'))
  );
  const { server } = await createDevFeedbackServer(inboxOptions(fixture, { version: '1.7.0-test' }));
  const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  assert.equal(client.getServerVersion()?.version, '1.7.0-test');
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), [
    'dev_feedback_build_brief',
    'dev_feedback_create',
    'dev_feedback_evidence_attach',
    'dev_feedback_get',
    'dev_feedback_import',
    'dev_feedback_import_latest',
    'dev_feedback_inbox_list',
    'dev_feedback_list',
    'dev_feedback_project_status',
    'dev_feedback_status_update'
  ]);
  const toolByName = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool]));
  assert.equal(toolByName.dev_feedback_get.annotations.readOnlyHint, true);
  assert.equal(toolByName.dev_feedback_import.annotations.idempotentHint, true);
  assert.equal(toolByName.dev_feedback_import_latest.annotations.idempotentHint, true);
  assert.equal(toolByName.dev_feedback_inbox_list.annotations.readOnlyHint, true);
  assert.equal(toolByName.dev_feedback_status_update.annotations.idempotentHint, false);

  const inbox = await client.callTool({ name: 'dev_feedback_inbox_list', arguments: {} });
  assert.equal(inbox.isError, undefined);
  assert.deepEqual(inbox.structuredContent.captures.map((capture) => capture.fileName), ['protocol-history.json']);

  const latest = await client.callTool({ name: 'dev_feedback_import_latest', arguments: {} });
  assert.equal(latest.isError, undefined);
  assert.equal(latest.structuredContent.sourceFile, 'protocol-history.json');
  assert.equal(latest.structuredContent.imported.length, 1);

  const project = await client.callTool({ name: 'dev_feedback_project_status', arguments: {} });
  assert.equal(project.isError, undefined);
  assert.equal(project.structuredContent.itemCount, 1);

  const created = await client.callTool({
    name: 'dev_feedback_create',
    arguments: {
      clientRequestId: 'protocol-test/item-1',
      subject: { kind: 'project' },
      request: { kind: 'visual-suggestion', summary: 'Make the empty state clearer', acceptance: ['Copy explains the next action'] }
    }
  });
  assert.equal(created.structuredContent.created, true);
  const feedbackId = created.structuredContent.item.id;

  const resource = await client.readResource({ uri: `dev-feedback://feedback/${feedbackId}` });
  assert.equal(resource.contents[0].mimeType, 'application/json');
  assert.match(resource.contents[0].text, /Make the empty state clearer/);
  assert.match(resource.contents[0].text, /untrusted data/);

  const evidencePath = path.join(fixture.inboxRoot, 'protocol-before.png');
  await fs.writeFile(evidencePath, VALID_PNG_BYTES);
  const attached = await client.callTool({
    name: 'dev_feedback_evidence_attach',
    arguments: { feedbackId, expectedRevision: 1, kind: 'before', path: evidencePath, redactionState: 'unknown' }
  });
  assert.equal(attached.isError, undefined);
  const evidenceResource = await client.readResource({ uri: `dev-feedback://feedback/${feedbackId}/evidence/before` });
  assert.deepEqual(Buffer.from(evidenceResource.contents[0].blob, 'base64'), VALID_PNG_BYTES);
});

test('imports require one explicit history group and never follow sibling evidence paths', async (t) => {
  const fixture = await createFixture(t);
  const exportPath = path.join(fixture.inboxRoot, 'multiple.json');
  const payload = {
    histories: [
      { storageKey: 'site-a', items: [{ id: 'a', type: 'element', pageUrl: 'https://a.test/', selector: '#a', note: 'A' }] },
      { storageKey: 'site-b', items: [{ id: 'b', type: 'element', pageUrl: 'https://b.test/', selector: '#b', note: 'B' }] }
    ]
  };
  await fs.writeFile(exportPath, JSON.stringify(payload));
  const store = await createProjectStore(inboxOptions(fixture));
  await assert.rejects(() => store.importFeedbackExport({ path: exportPath }), /multiple site\/file groups/);
  const imported = await store.importFeedbackExport({ path: exportPath, storageKey: 'site-b' });
  assert.equal(imported.imported.length, 1);
  assert.equal((await store.listFeedback()).items[0].subject.url, 'https://b.test/');

  const secretPath = path.join(fixture.inboxRoot, 'secret.png');
  await fs.writeFile(secretPath, VALID_PNG_BYTES);
  const maliciousPath = path.join(fixture.inboxRoot, 'malicious.json');
  await fs.writeFile(maliciousPath, JSON.stringify({ histories: [{ storageKey: 'site-c', items: [
    { id: 'safe-first', type: 'element', pageUrl: 'https://c.test/', selector: '#safe', note: 'Safe' },
    { id: 'path-leak', type: 'element', pageUrl: 'https://c.test/', selector: '#leak', note: 'Leak', imagePaths: { before: 'secret.png' } }
  ] }] }));
  await assert.rejects(() => store.importFeedbackExport({ path: maliciousPath }), /Sibling image paths are not followed/);
  assert.equal((await store.listFeedback()).total, 1, 'preflight must not commit the safe first item from a rejected import');
});

test('legacy reimports stay stable and content changes cannot overwrite a different no-ID item', async (t) => {
  const fixture = await createFixture(t);
  const exportPath = path.join(fixture.inboxRoot, 'legacy.json');
  const payload = { exportedAt: 'first', histories: [{ storageKey: 'legacy-site', items: [
    { type: 'element', pageUrl: 'https://legacy.test/', selector: '#save', note: 'Original note' }
  ] }] };
  await fs.writeFile(exportPath, JSON.stringify(payload));
  const store = await createProjectStore(inboxOptions(fixture, { clock: sequenceClock() }));
  const first = await store.importFeedbackExport({ path: exportPath });
  const feedbackId = first.imported[0];
  payload.exportedAt = 'second';
  await fs.writeFile(exportPath, JSON.stringify(payload));
  const same = await store.importFeedbackExport({ path: exportPath });
  assert.deepEqual(same.skipped, [feedbackId]);
  assert.equal((await store.getFeedback(feedbackId)).revision, 1);

  await store.updateStatus({ feedbackId, expectedRevision: 1, status: 'in-progress', note: 'Started' });
  payload.histories[0].items[0].note = 'Changed note';
  await fs.writeFile(exportPath, JSON.stringify(payload));
  const changed = await store.importFeedbackExport({ path: exportPath });
  assert.equal(changed.imported.length, 1);
  assert.notEqual(changed.imported[0], feedbackId);
  assert.equal((await store.getFeedback(feedbackId)).implementation.status, 'in-progress');
  assert.equal((await store.getFeedback(changed.imported[0])).implementation.status, 'open');
});

test('changed identified region import cannot remove required extension evidence', async (t) => {
  const fixture = await createFixture(t);
  const exportPath = path.join(fixture.inboxRoot, 'identified.json');
  const item = {
    id: 'stable-source-id',
    type: 'region',
    pageUrl: 'https://identified.test/',
    note: 'Original',
    screenshot: { mimeType: 'image/png', dataUrl: VALID_PNG_DATA_URL },
    annotations: []
  };
  await fs.writeFile(exportPath, JSON.stringify({ histories: [{ storageKey: 'identified', items: [item] }] }));
  const store = await createProjectStore(inboxOptions(fixture, { clock: sequenceClock() }));
  const first = await store.importFeedbackExport({ path: exportPath });
  const feedbackId = first.imported[0];
  const original = await store.getFeedback(feedbackId);
  assert.deepEqual(Object.keys(original.evidence), ['before']);
  const originalEvidencePath = path.join(store.sidecarRoot, original.evidence.before.path);
  await store.updateStatus({ feedbackId, expectedRevision: 1, status: 'in-progress', note: 'Started' });

  item.note = 'Changed';
  delete item.screenshot;
  await fs.writeFile(exportPath, JSON.stringify({ histories: [{ storageKey: 'identified', items: [item] }] }));
  await assert.rejects(() => store.importFeedbackExport({ path: exportPath }), /requires valid before evidence/);
  const reimported = await store.getFeedback(feedbackId);
  assert.equal(reimported.implementation.status, 'in-progress');
  assert.deepEqual(Object.keys(reimported.evidence), ['before']);
  await fs.access(originalEvidencePath);
});

test('legacy WebP evidence remains import-compatible', async (t) => {
  const fixture = await createFixture(t);
  const exportPath = path.join(fixture.inboxRoot, 'webp.json');
  await fs.writeFile(exportPath, JSON.stringify({ histories: [{ storageKey: 'webp', items: [{
    id: 'webp-item', type: 'region', pageUrl: 'https://webp.test/', note: 'Keep WebP', annotations: [],
    screenshot: { mimeType: 'image/webp', dataUrl: `data:image/webp;base64,${VALID_WEBP_BYTES.toString('base64')}` }
  }] }] }));
  const store = await createProjectStore(inboxOptions(fixture));
  const imported = await store.importFeedbackExport({ path: exportPath });
  const evidence = await store.readEvidence(imported.imported[0], 'before');
  assert.equal(evidence.mimeType, 'image/webp');
  assert.deepEqual(evidence.bytes, VALID_WEBP_BYTES);
});

test('oversized image dimensions fail before evidence is stored', async (t) => {
  const fixture = await createFixture(t);
  const store = await createProjectStore(inboxOptions(fixture));
  const created = await store.createFeedback({ clientRequestId: 'dimension-test', subject: { kind: 'project' }, request: { summary: 'Reject image bombs' } });
  const oversized = Buffer.from(VALID_PNG_BYTES);
  oversized.writeUInt32BE(20000, 16);
  const sourcePath = path.join(fixture.inboxRoot, 'oversized.png');
  await fs.writeFile(sourcePath, oversized);
  await assert.rejects(() => store.attachEvidence({
    feedbackId: created.item.id,
    expectedRevision: 1,
    kind: 'before',
    path: sourcePath
  }), /dimensions are invalid or exceed/);
  assert.deepEqual((await store.getFeedback(created.item.id)).evidence, {});
});

test('separate store instances preserve revision compare-and-swap', async (t) => {
  const fixture = await createFixture(t);
  const firstStore = await createProjectStore({ projectRoot: fixture.projectRoot, clock: sequenceClock() });
  const secondStore = await createProjectStore({ projectRoot: fixture.projectRoot, clock: sequenceClock() });
  const created = await firstStore.createFeedback({
    clientRequestId: 'concurrency/item',
    subject: { kind: 'project' },
    request: { summary: 'Coordinate two local agents' }
  });

  const results = await Promise.allSettled([
    firstStore.updateStatus({ feedbackId: created.item.id, expectedRevision: 1, status: 'in-progress' }),
    secondStore.updateStatus({ feedbackId: created.item.id, expectedRevision: 1, status: 'dismissed', note: 'Competing update' })
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /Revision conflict/);
  assert.equal((await firstStore.getFeedback(created.item.id)).revision, 2);
});

test('sidecar and evidence symlink/hash defenses fail closed', async (t) => {
  const fixture = await createFixture(t);
  const escapedRoot = path.join(fixture.tempRoot, 'escaped-sidecar');
  await fs.mkdir(escapedRoot);
  await fs.symlink(escapedRoot, path.join(fixture.projectRoot, '.dev-feedback'));
  await assert.rejects(
    () => createProjectStore({ projectRoot: fixture.projectRoot }),
    /symlinked sidecar directory/
  );
  await fs.unlink(path.join(fixture.projectRoot, '.dev-feedback'));

  const store = await createProjectStore(inboxOptions(fixture));
  const created = await store.createFeedback({
    clientRequestId: 'tamper/item',
    subject: { kind: 'project' },
    request: { summary: 'Detect evidence tampering' }
  });
  const sourcePath = path.join(fixture.inboxRoot, 'tamper.png');
  await fs.writeFile(sourcePath, VALID_PNG_BYTES);
  const attached = await store.attachEvidence({
    feedbackId: created.item.id,
    expectedRevision: 1,
    kind: 'before',
    path: sourcePath,
    redactionState: 'unknown'
  });
  const storedPath = path.join(store.sidecarRoot, attached.evidence.path);
  const changed = Buffer.from(VALID_PNG_BYTES);
  changed[changed.length - 1] ^= 0x01;
  await fs.writeFile(storedPath, changed);
  await assert.rejects(() => store.readEvidence(created.item.id, 'before'), /hash mismatch/);
});

test('read-only MCP rejects mutations as tool execution errors', async (t) => {
  const fixture = await createFixture(t);
  await fs.writeFile(
    path.join(fixture.inboxRoot, 'read-only-capture.json'),
    JSON.stringify(historyExport('read-only-site', 'read-only-capture', 'Read only capture'))
  );
  await createProjectStore(inboxOptions(fixture));
  const { server } = await createDevFeedbackServer(inboxOptions(fixture, { readOnly: true }));
  const client = new Client({ name: 'read-only-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  assert.equal(client.getServerVersion()?.version, PACKAGE_VERSION);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const response = await client.callTool({
    name: 'dev_feedback_create',
    arguments: {
      clientRequestId: 'read-only/item',
      subject: { kind: 'project' },
      request: { kind: 'visual-suggestion', summary: 'Should not be written' }
    }
  });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /read-only mode/);

  const latest = await client.callTool({ name: 'dev_feedback_import_latest', arguments: {} });
  assert.equal(latest.isError, true);
  assert.match(latest.content[0].text, /read-only mode/);
  assert.deepEqual(await fs.readdir(path.join(fixture.projectRoot, '.dev-feedback', 'items')), []);
});

test('read-only and CLI configuration fail without creating implicit project state', async (t) => {
  const fixture = await createFixture(t);
  const sidecar = path.join(fixture.projectRoot, '.dev-feedback');
  await assert.rejects(() => createProjectStore({ projectRoot: fixture.projectRoot, readOnly: true }), /ENOENT/);
  await assert.rejects(
    () => execFileAsync(process.execPath, [path.join(process.cwd(), 'mcp', 'cli.mjs')], {
      cwd: fixture.projectRoot,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'DEV_FEEDBACK_PROJECT_ROOT'))
    }),
    (error) => /explicit --project/.test(error.stderr)
  );
  await assert.rejects(() => fs.access(sidecar));
});

test('CLI speaks clean MCP over stdio', async (t) => {
  const fixture = await createFixture(t);
  const client = new Client({ name: 'stdio-test-client', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(process.cwd(), 'mcp', 'cli.mjs'), '--project', fixture.projectRoot],
    cwd: process.cwd(),
    stderr: 'pipe'
  });
  let diagnostics = '';
  transport.stderr?.on('data', (chunk) => {
    diagnostics += chunk.toString();
  });
  await client.connect(transport);
  t.after(() => client.close());
  const tools = await client.listTools();
  assert.equal(tools.tools.some((tool) => tool.name === 'dev_feedback_list'), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(diagnostics.includes(`Dev Feedback MCP ${PACKAGE_VERSION} connected`), diagnostics);
});

async function createFixture(t) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-mcp-test-'));
  const projectRoot = path.join(tempRoot, 'project');
  const inboxRoot = path.join(tempRoot, 'inbox');
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await fs.mkdir(inboxRoot, { recursive: true });
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  return { tempRoot, projectRoot, inboxRoot };
}

function inboxOptions(fixture, overrides = {}) {
  return {
    projectRoot: fixture.projectRoot,
    inboxRoots: [fixture.inboxRoot],
    approvedDownloadsRoot: fixture.inboxRoot,
    ...overrides
  };
}

async function snapshotOutsideSidecar(projectRoot) {
  const snapshot = [];
  async function visit(directory, relativeRoot = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      if (relativePath === '.dev-feedback') continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        snapshot.push([`${relativePath}/`, 'directory']);
        await visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        snapshot.push([relativePath, (await fs.readFile(entryPath)).toString('base64')]);
      } else {
        snapshot.push([relativePath, 'other']);
      }
    }
  }
  await visit(projectRoot);
  return snapshot;
}

function historyExport(storageKey, id, note) {
  return {
    schemaVersion: 1,
    exportedAt: '2026-07-18T12:00:00.000Z',
    histories: [{
      storageKey,
      items: [{
        id,
        type: 'element',
        pageUrl: `https://${storageKey}.test/`,
        pageTitle: 'Inbox capture',
        selector: '#capture',
        note,
        timestamp: '2026-07-18T11:00:00.000Z',
        elementInfo: { tag: 'button', text: 'Capture' },
        position: { x: 1, y: 2 }
      }]
    }]
  };
}

function sequenceClock() {
  let step = 0;
  return () => new Date(Date.UTC(2026, 6, 18, 12, 0, step++));
}
