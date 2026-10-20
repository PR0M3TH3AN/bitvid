// adapters/mailbox.mjs — the FILE MAILBOX. Works in any harness that can read files.
//
// Layout:  <mailbox.dir>/<area>/<stamp>-<from>-<rand>.md       unread
//          <mailbox.dir>/<area>/archive/<same name>             handled
// A message is a small markdown file with a header block:
//   from: dispatch
//   to: web-ui
//   date: 2026-10-17T09:12:00.000Z
//   subject: ...
//   <blank line>
//   body
// Writes are atomic (tmp + rename), so a reader never sees half a message.
// Every session reads its inbox at the start of each turn and archives what it handled.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const check = (id, what) => { if (!ID_RE.test(id)) throw new Error(`bad ${what} "${id}"`); };

export const messaging = {
  native: false,
  instructions: [
    'MESSAGING (file mailbox): at the start of every turn, and when a turn starts',
    'because a line says you have new fleet mail, run',
    '`node tools/fleet/bin/mailbox.mjs read <your id>`. Reading takes the messages:',
    'they leave unread and move to archive. That typed line is only a wake. The',
    'mail is the message. That read also re-nudges, once, an idle peer whose unread',
    'mail has been waiting. A second read does not nudge again. Reply to the sender',
    'with your next action. To reach a peer:',
    '`node tools/fleet/bin/mailbox.mjs send <peer id> --from <your id> "<text>"`.',
  ].join('\n'),
};

export function send(dir, to, from, body, subject = '') {
  check(to, 'recipient'); check(from, 'sender');
  const date = new Date().toISOString();
  const stamp = date.replace(/[-:]/g, '').replace(/\..*/, '');
  const name = `${stamp}-${from}-${crypto.randomBytes(3).toString('hex')}.md`;
  const box = path.join(dir, to);
  fs.mkdirSync(box, { recursive: true });
  const file = path.join(box, name);
  const tmp = path.join(box, `.${name}.tmp`);
  fs.writeFileSync(tmp, `from: ${from}\nto: ${to}\ndate: ${date}\nsubject: ${subject}\n\n${body.trim()}\n`);
  fs.renameSync(tmp, file);
  return file;
}

export function read(dir, area) {
  check(area, 'area');
  const box = path.join(dir, area);
  if (!fs.existsSync(box)) return [];
  return fs.readdirSync(box).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort()
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(box, f), 'utf8') }));
}

export function archive(dir, area, which) {
  check(area, 'area');
  const box = path.join(dir, area);
  const arch = path.join(box, 'archive');
  fs.mkdirSync(arch, { recursive: true });
  const names = which === '--all' ? read(dir, area).map((m) => m.file) : [path.basename(which)];
  for (const n of names) {
    if (!fs.existsSync(path.join(box, n))) throw new Error(`no message ${n} in ${area}'s inbox`);
    fs.renameSync(path.join(box, n), path.join(arch, n));
  }
  return names;
}
