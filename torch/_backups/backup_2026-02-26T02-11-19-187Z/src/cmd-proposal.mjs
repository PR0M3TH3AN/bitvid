import { createProposal, listProposals, applyProposal, rejectProposal, getProposal } from './services/governance/index.js';
import { ExitError } from './errors.mjs';
import fs from 'node:fs/promises';

export async function cmdProposal(subcommand, args = {}) {
  switch (subcommand) {
    case 'create':
      return await handleCreate(args);
    case 'list':
      return await handleList(args);
    case 'apply':
      return await handleApply(args);
    case 'reject':
      return await handleReject(args);
    case 'show':
      return await handleShow(args);
    default:
      console.error(`Unknown proposal subcommand: ${subcommand}`);
      throw new ExitError(1, 'Unknown subcommand');
  }
}

async function handleCreate({ agent, target, contentFile, reason }) {
  if (!agent || !target || !contentFile || !reason) {
    console.error('Usage: torch-lock proposal create --agent <name> --target <path> --content <file> --reason <text>');
    throw new ExitError(1, 'Missing arguments');
  }

  let newContent;
  try {
    newContent = await fs.readFile(contentFile, 'utf8');
  } catch (_e) {
    console.error(`Failed to read content file: ${contentFile}`);
    throw new ExitError(1, 'File read error');
  }

  try {
    const result = await createProposal({ agent, target, newContent, reason });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`Failed to create proposal: ${e.message}`);
    throw new ExitError(1, 'Proposal creation failed');
  }
}

async function handleList({ status }) {
  try {
    const proposals = await listProposals();
    const filtered = status ? proposals.filter(p => p.status === status) : proposals;
    console.log(JSON.stringify(filtered, null, 2));
  } catch (e) {
    console.error(`Failed to list proposals: ${e.message}`);
    throw new ExitError(1, 'List failed');
  }
}

async function handleApply({ id }) {
  if (!id) {
    console.error('Usage: torch-lock proposal apply --id <proposal-id>');
    throw new ExitError(1, 'Missing id');
  }

  try {
    const result = await applyProposal(id);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`Failed to apply proposal: ${e.message}`);
    throw new ExitError(1, 'Apply failed');
  }
}

async function handleReject({ id, reason }) {
  if (!id || !reason) {
    console.error('Usage: torch-lock proposal reject --id <proposal-id> --reason <text>');
    throw new ExitError(1, 'Missing arguments');
  }

  try {
    const result = await rejectProposal(id, reason);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`Failed to reject proposal: ${e.message}`);
    throw new ExitError(1, 'Reject failed');
  }
}

async function handleShow({ id }) {
    if (!id) {
        console.error('Usage: torch-lock proposal show --id <proposal-id>');
        throw new ExitError(1, 'Missing id');
    }
    try {
        const proposal = await getProposal(id);
        console.log(JSON.stringify(proposal, null, 2));
    } catch (e) {
        console.error(`Failed to show proposal: ${e.message}`);
        throw new ExitError(1, 'Show failed');
    }
}
