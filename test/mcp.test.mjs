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
import { createProjectStore } from '../mcp/store.mjs';

const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const VALID_PNG_BYTES = Buffer.from(VALID_PNG_DATA_URL.split(',')[1], 'base64');
const VALID_WEBP_BYTES = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA', 'base64');
const execFileAsync = promisify(execFile);

test('project store supports agent feedback, revisions, evidence, and briefs', async (t) => {
  const fixture = await createFixture(t);
  const store = await createProjectStore({
    projectRoot: fixture.projectRoot,
    inboxRoots: [fixture.inboxRoot],
    clock: sequenceClock()
  });

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

  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot], clock: sequenceClock() });
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

test('MCP protocol exposes project-scoped tools and resources', async (t) => {
  const fixture = await createFixture(t);
  const { server } = await createDevFeedbackServer({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot], version: '1.7.0-test' });
  const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
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
    'dev_feedback_list',
    'dev_feedback_project_status',
    'dev_feedback_status_update'
  ]);
  const toolByName = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool]));
  assert.equal(toolByName.dev_feedback_get.annotations.readOnlyHint, true);
  assert.equal(toolByName.dev_feedback_import.annotations.idempotentHint, true);
  assert.equal(toolByName.dev_feedback_status_update.annotations.idempotentHint, false);

  const project = await client.callTool({ name: 'dev_feedback_project_status', arguments: {} });
  assert.equal(project.isError, undefined);
  assert.equal(project.structuredContent.itemCount, 0);

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
  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot] });
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
  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot], clock: sequenceClock() });
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

test('changed identified import resets review and replaces removed extension evidence', async (t) => {
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
  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot], clock: sequenceClock() });
  const first = await store.importFeedbackExport({ path: exportPath });
  const feedbackId = first.imported[0];
  const original = await store.getFeedback(feedbackId);
  assert.deepEqual(Object.keys(original.evidence), ['before']);
  const originalEvidencePath = path.join(store.sidecarRoot, original.evidence.before.path);
  await store.updateStatus({ feedbackId, expectedRevision: 1, status: 'in-progress', note: 'Started' });

  item.note = 'Changed';
  delete item.screenshot;
  await fs.writeFile(exportPath, JSON.stringify({ histories: [{ storageKey: 'identified', items: [item] }] }));
  const changed = await store.importFeedbackExport({ path: exportPath });
  assert.deepEqual(changed.updated, [feedbackId]);
  const reimported = await store.getFeedback(feedbackId);
  assert.equal(reimported.implementation.status, 'open');
  assert.deepEqual(reimported.evidence, {});
  await assert.rejects(() => fs.access(originalEvidencePath));
});

test('legacy WebP evidence remains import-compatible', async (t) => {
  const fixture = await createFixture(t);
  const exportPath = path.join(fixture.inboxRoot, 'webp.json');
  await fs.writeFile(exportPath, JSON.stringify({ histories: [{ storageKey: 'webp', items: [{
    id: 'webp-item', type: 'region', pageUrl: 'https://webp.test/', note: 'Keep WebP', annotations: [],
    screenshot: { mimeType: 'image/webp', dataUrl: `data:image/webp;base64,${VALID_WEBP_BYTES.toString('base64')}` }
  }] }] }));
  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot] });
  const imported = await store.importFeedbackExport({ path: exportPath });
  const evidence = await store.readEvidence(imported.imported[0], 'before');
  assert.equal(evidence.mimeType, 'image/webp');
  assert.deepEqual(evidence.bytes, VALID_WEBP_BYTES);
});

test('oversized image dimensions fail before evidence is stored', async (t) => {
  const fixture = await createFixture(t);
  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot] });
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

  const store = await createProjectStore({ projectRoot: fixture.projectRoot, inboxRoots: [fixture.inboxRoot] });
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
  await createProjectStore({ projectRoot: fixture.projectRoot });
  const { server } = await createDevFeedbackServer({ projectRoot: fixture.projectRoot, readOnly: true });
  const client = new Client({ name: 'read-only-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
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
    args: [path.join(process.cwd(), 'mcp', 'cli.mjs'), '--project', fixture.projectRoot, '--inbox', fixture.inboxRoot],
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
  assert.match(diagnostics, /Dev Feedback MCP 1\.7\.0 connected/);
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

function sequenceClock() {
  let step = 0;
  return () => new Date(Date.UTC(2026, 6, 18, 12, 0, step++));
}
