// adapters/_stub.mjs — shared shape for harness adapters that are NOT verified yet.
//
// A stub never invents a CLI flag. Every field it cannot fill is null, and the
// fleet tools fall back to safe behaviour:
//   start/resume null  -> `fleet up` writes the composed prompt to
//                         <worktree>/.fleet/PROMPT.md and prints how to start by hand
//   headless null      -> scheduled jobs for this harness refuse with a clear message
//   messaging          -> the file mailbox (adapters/mailbox.mjs)
//
// To complete an adapter: copy the exports in docs/adapters.md, fill each TODO from
// the harness's own `--help` / docs, run `fleet up --dry-run --only <area>`, then
// set `complete = true`. A command with no module can use harnesses.<name>.argv.
import { messaging as mailboxMessaging } from './mailbox.mjs';

export function makeStub(name, bin) {
  return {
    name,
    bin,
    complete: false,
    tiers: { strong: null, standard: null, light: null },   // TODO: model ids per tier
    start: null,       // TODO: ({model, context, remoteControl, sessionId, sessionName, promptFile, firstPrompt}) => argv
    resume: null,      // TODO: ({model, context, remoteControl, sessionId}) => argv
    background: null,  // TODO: (argv) => argv for a detached session, if the harness has one
    headless: null,    // TODO: ({prompt, model, extraArgs}) => argv for a one-shot non-interactive run
    canResume: () => false,
    list: () => null,
    stop: null,
    cleanEnv: (env = process.env) => ({ ...env }),
    messaging: mailboxMessaging,
    skillsDir: null,   // TODO: where this harness reads project skills/rules from
    usage: () => null,
  };
}
