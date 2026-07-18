#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { runStdioServer } from './server.mjs';

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`Dev Feedback Capture MCP companion\n\nUsage:\n  node mcp/cli.mjs --project /absolute/project [--inbox /absolute/inbox] [--read-only]\n\nEnvironment:\n  DEV_FEEDBACK_PROJECT_ROOT\n  DEV_FEEDBACK_INBOX (paths separated by ${path.delimiter})\n`);
    process.exit(0);
  }
  const projectRoot = args.project || process.env.DEV_FEEDBACK_PROJECT_ROOT;
  if (!projectRoot) throw new Error('An explicit --project or DEV_FEEDBACK_PROJECT_ROOT is required.');
  const inboxRoots = [
    ...args.inboxes,
    ...String(process.env.DEV_FEEDBACK_INBOX || '').split(path.delimiter).filter(Boolean)
  ];
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  await runStdioServer({ projectRoot, inboxRoots, readOnly: args.readOnly, version: packageJson.version });
  console.error(`Dev Feedback MCP ${packageJson.version} connected for ${path.resolve(projectRoot)}.`);
} catch (error) {
  console.error(`Dev Feedback MCP failed: ${error.message}`);
  process.exit(1);
}

function parseArgs(values) {
  const result = { project: '', inboxes: [], readOnly: false, help: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--project') {
      result.project = requireValue(values, ++index, '--project');
    } else if (value === '--inbox') {
      result.inboxes.push(requireValue(values, ++index, '--inbox'));
    } else if (value === '--read-only') {
      result.readOnly = true;
    } else if (value === '--help' || value === '-h') {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return result;
}

function requireValue(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}
