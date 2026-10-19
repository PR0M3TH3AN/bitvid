// adapters/custom.mjs — a provider defined entirely in fleet.config.json.
//
// harnesses.<name>.argv is a list of command templates. A whole-token placeholder
// that is empty is omitted. {{extra}} (or, if absent, the spot before {{prompt}})
// receives headlessArgs. done.kind is exit | regex | json-type.
// See docs/adapters.md. There is no background mode; fleet up uses tmux.
import { messaging as mailboxMessaging } from './mailbox.mjs';
import { baseVerdict, parseJsonRecords } from './contract.mjs';

const VARS = ['bin', 'model', 'context', 'sessionId', 'sessionName', 'promptFile', 'firstPrompt', 'prompt', 'remoteControl', 'cwd'];

export function fillTemplate(template, vars, extra = []) {
  const out = [];
  let usedExtra = false;
  const extras = extra.filter((part) => part != null && part !== '');
  for (const part of template) {
    if (part === '{{extra}}') { out.push(...extras); usedExtra = true; continue; }
    if (part === '{{prompt}}' && !usedExtra) { out.push(...extras); usedExtra = true; }
    const whole = typeof part === 'string' && part.match(/^\{\{(\w+)\}\}$/);
    if (whole) {
      if (!VARS.includes(whole[1])) { out.push(part); continue; }
      const value = vars[whole[1]];
      if (value == null || value === '') continue;
      out.push(String(value));
      continue;
    }
    out.push(String(part).replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key]))));
  }
  if (!usedExtra) out.push(...extras);
  return out;
}

function varsOf(opts, config) {
  return {
    bin: config.bin ?? 'custom',
    model: opts.model ?? '',
    context: opts.context ?? '',
    sessionId: opts.sessionId ?? '',
    sessionName: opts.sessionName ?? '',
    promptFile: opts.promptFile ?? '',
    firstPrompt: opts.firstPrompt ?? '',
    prompt: opts.prompt ?? '',
    remoteControl: opts.remoteControl ? 'on' : '',
    cwd: opts.cwd ?? '',
  };
}

export function interpretDone(rule, output, meta = {}) {
  const base = baseVerdict(meta);
  if (base) return base;
  const kind = rule?.kind ?? 'exit';
  if (meta.status !== 0) return { ok: false, reason: `exit:${meta.status}` };
  if (kind === 'exit') {
    if (rule?.requireOutput && !String(output ?? '').trim()) return { ok: false, reason: 'no-completed-result' };
    return { ok: true, reason: 'exit' };
  }
  if (kind === 'regex') {
    let re;
    try { re = new RegExp(rule.pattern ?? '', rule.flags ?? ''); }
    catch { return { ok: false, reason: 'bad-done-pattern' }; }
    if (!re.test(String(output ?? ''))) return { ok: false, reason: 'no-completed-result' };
    return { ok: true, reason: 'regex' };
  }
  if (kind === 'json-type') {
    const hit = parseJsonRecords(output).find((record) => record && record.type === rule.type);
    if (!hit) return { ok: false, reason: 'no-completed-result' };
    const sessionId = typeof hit.thread_id === 'string' ? hit.thread_id
      : (typeof hit.sessionId === 'string' ? hit.sessionId : null);
    return { ok: true, reason: rule.type || 'json-type', ...(sessionId ? { sessionId } : {}) };
  }
  return { ok: false, reason: `bad-done-kind:${kind}` };
}

export function bind(config = {}, name = 'custom') {
  const argv = config.argv ?? {};
  const has = (key) => Array.isArray(argv[key]);
  const build = (key, opts, extra) => fillTemplate(argv[key], varsOf(opts ?? {}, { ...config, bin: config.bin ?? name }), extra);
  return {
    name,
    bin: config.bin ?? name,
    complete: has('start') && has('headless'),
    experimental: false,
    tiers: config.tiers ?? { strong: null, standard: null, light: null },
    capabilities: {
      interactive: has('start'),
      resume: has('resume'),
      background: false,
      headless: has('headless'),
      doneSignal: config.done?.kind ?? 'exit',
      prompt: 'template',
      autoMode: config.headlessArgs ?? [],
      contextFlag: null,
      remoteControl: null,
      nativeMessaging: false,
    },
    start: has('start') ? (opts) => build('start', opts) : null,
    resume: has('resume') ? (opts) => build('resume', opts) : null,
    background: null,
    headless: has('headless') ? ({ prompt, model, extraArgs = [] } = {}) => build('headless', { prompt, model }, extraArgs) : null,
    completed: (output, meta) => interpretDone(config.done, output, meta),
    canResume: () => has('resume'),
    list: () => null,
    stop: null,
    cleanEnv: (env = process.env) => ({ ...env }),
    messaging: mailboxMessaging,
    skillsDir: config.skillsDir ?? null,
    usage: () => null,
  };
}
