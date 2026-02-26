import { rollbackPrompt, listPromptVersions } from './services/governance/index.js';
import { ExitError } from './errors.mjs';

export async function cmdRollback(target, strategy, { list = false } = {}) {
  if (!target) {
    console.error('Usage: torch-lock rollback --target <path> [--strategy <hash|latest>] [--list]');
    throw new ExitError(1, 'Missing target');
  }

  if (list) {
    try {
      const versions = await listPromptVersions(target);
      console.log(JSON.stringify(versions, null, 2));
    } catch (e) {
      console.error(`Failed to list versions: ${e.message}`);
      throw new ExitError(1, 'List versions failed');
    }
    return;
  }

  const effectiveStrategy = strategy || 'latest';

  try {
    const result = await rollbackPrompt(target, effectiveStrategy);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`Rollback failed: ${e.message}`);
    throw new ExitError(1, 'Rollback failed');
  }
}
