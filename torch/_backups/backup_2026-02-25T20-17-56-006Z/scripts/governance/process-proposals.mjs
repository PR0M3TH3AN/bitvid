import { listProposals, applyProposal, rejectProposal, validateProposal } from '../../src/services/governance/index.js';

async function main() {
  console.log('Governance: Scanning for pending proposals...');
  const proposals = await listProposals();
  const pending = proposals.filter(p => p.status === 'pending');

  if (pending.length === 0) {
    console.log('No pending proposals found.');
    return;
  }

  console.log(`Found ${pending.length} pending proposals.`);

  for (const p of pending) {
    console.log(`\nProcessing proposal: ${p.id} (Target: ${p.target})`);

    // 1. Validate
    const validation = await validateProposal(p.id);
    if (!validation.valid) {
      console.error(`  Validation FAILED: ${validation.reason}`);
      await rejectProposal(p.id, validation.reason);
      console.log(`  Rejected proposal ${p.id}.`);
      continue;
    }
    console.log('  Validation PASSED.');

    // 2. Apply
    try {
      await applyProposal(p.id);
      console.log(`  Applied proposal ${p.id} successfully.`);
    } catch (e) {
      console.error(`  Application FAILED: ${e.message}`);
      // Maybe reject with application error?
      await rejectProposal(p.id, `Application failed: ${e.message}`);
    }
  }

  console.log('\nGovernance cycle complete.');
}

main().catch(err => {
  console.error('Fatal error in governance script:', err);
  process.exit(1);
});
