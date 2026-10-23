import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { guardSchedule } from '../bin/bitvid-schedule-guard.mjs';

const moduleUrl = new URL('../bin/bitvid-schedule-guard.mjs', import.meta.url).href;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bitvid-schedule-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const c = { repo: root, stateDir: root, areas: [{ id: 'dispatch' }], schedules: [{ name: 'resources' }, { name: 'restart' }] };
  fs.mkdirSync(path.join(root, 'runs'));
  const record = path.join(root, 'runs', 'dispatch.json');
  const scheduler = path.join(root, 'schedule.sh');
  fs.writeFileSync(scheduler, 'echo started\nprintf yes > "'+root+'/launched"\n');
  const live = () => fs.writeFileSync(record, JSON.stringify({ status: 'running', pid: process.pid }));
  return { c, root, record, scheduler, live };
}

for (const job of ['resources', 'restart']) {
  test(`${job} does not launch while down`, async (t) => {
    const f = fixture(t);
    assert.deepEqual(await guardSchedule(f.c, job, { scheduler: f.scheduler }), { status: 0, reason: 'fleet down' });
    assert.equal(fs.existsSync(path.join(f.root, 'launched')), false);
  });
  test(`${job} cannot bypass pause even with a live fleet`, async (t) => {
    const f = fixture(t); f.live(); fs.writeFileSync(path.join(f.root, 'PAUSED'), 'owner pause');
    assert.deepEqual(await guardSchedule(f.c, job, { scheduler: f.scheduler }), { status: 0, reason: 'fleet paused' });
    assert.equal(fs.existsSync(path.join(f.root, 'launched')), false);
  });
}

test('stopped record pointing at a live unrelated process cannot start a job', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.record, JSON.stringify({ status: 'stopped', pid: process.pid }));
  assert.equal((await guardSchedule(f.c, 'resources', { scheduler: f.scheduler })).reason, 'fleet down');
});

test('live unpaused fleet launches a short job and exits naturally', async (t) => {
  const f = fixture(t); f.live();
  assert.deepEqual(await guardSchedule(f.c, 'resources', { scheduler: f.scheduler }), { status: 0, reason: null });
  assert.equal(fs.readFileSync(path.join(f.root, 'launched'), 'utf8'), 'yes');
});

for (const transition of ['pause', 'down']) {
  test(`already-running scheduled child is stopped on ${transition}`, { timeout: 5000 }, async (t) => {
    const f = fixture(t); f.live();
    fs.writeFileSync(f.scheduler, 'echo started\nexec sleep 600\n');
    const code = `import {guardSchedule} from ${JSON.stringify(moduleUrl)}; const r=await guardSchedule(${JSON.stringify(f.c)},'resources',${JSON.stringify({scheduler:f.scheduler,pollMs:25})}); console.log(JSON.stringify(r)); process.exitCode=r.status;`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore','pipe','pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    let output = '';
    const exited = new Promise((resolve, reject) => { child.once('error',reject); child.once('close',(status)=>resolve(status)); });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('started\n')) resolve(); });
      child.once('exit', () => { if (!output.includes('started\n')) reject(new Error('child exited before ready')); });
    });
    if (transition === 'pause') fs.writeFileSync(path.join(f.root,'PAUSED'),'pause');
    else fs.writeFileSync(f.record, JSON.stringify({status:'stopped',pid:process.pid}));
    assert.equal(await exited, 0);
    assert.match(output, transition === 'pause' ? /fleet paused/ : /fleet down/);
    assert.doesNotThrow(() => process.kill(process.pid, 0));
  });
}
