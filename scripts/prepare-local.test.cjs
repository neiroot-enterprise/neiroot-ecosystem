'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {prepareLocal, legacyLaunchers} = require('./prepare-local.cjs');

function fixture(t, ignore = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neiroot-local-docs-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('neiroot-local-docs-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  execFileSync('git', ['init', '--quiet', root], {windowsHide: true});
  if (ignore) fs.writeFileSync(path.join(root, '.gitignore'), '.local/\n.env\n' + legacyLaunchers.join('\n') + '\n');
  return root;
}

test('creates ignored documents for Windows, macOS and Linux without inventing a ready launcher', t => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const root = fixture(t);
    assert.equal(prepareLocal(root, platform, 'arm64').length, 4);
    const agent = fs.readFileSync(path.join(root, '.local/Agent.md'), 'utf8');
    assert.ok(agent.includes(platform));
    assert.ok(agent.includes('ещё не проверена'));
    const folder = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
    assert.ok(fs.statSync(path.join(root, '.local/scripts', folder)).isDirectory());
    const status = execFileSync('git', ['-C', root, 'status', '--short'], {encoding: 'utf8', windowsHide: true});
    assert.ok(!status.includes('.local'));
  }
});

test('repeat preparation preserves personal notes and secrets', t => {
  const root = fixture(t);
  prepareLocal(root);
  fs.writeFileSync(path.join(root, '.local/Agent.md'), 'Existing machine notes');
  fs.writeFileSync(path.join(root, '.env'), 'SYNTHETIC_SECRET=keep-test-value\n');
  assert.deepEqual(prepareLocal(root), []);
  assert.equal(fs.readFileSync(path.join(root, '.local/Agent.md'), 'utf8'), 'Existing machine notes');
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'SYNTHETIC_SECRET=keep-test-value\n');
});

test('refuses missing ignore rules before writing documents', t => {
  const root = fixture(t, false);
  assert.throws(() => prepareLocal(root));
  assert.ok(!fs.existsSync(path.join(root, '.local')));
});

test('refuses already tracked personal files without changing them', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env'), 'SYNTHETIC_SECRET=tracked-test-value\n');
  execFileSync('git', ['-C', root, 'add', '-f', '.env'], {windowsHide: true});
  assert.throws(() => prepareLocal(root), /tracked by Git/);
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'SYNTHETIC_SECRET=tracked-test-value\n');
  assert.ok(!fs.existsSync(path.join(root, '.local')));
});

test('rejects an ignore exception that would expose one document', t => {
  const root = fixture(t);
  fs.appendFileSync(path.join(root, '.gitignore'), '!.local/\n.local/*\n!.local/README.md\n');
  assert.throws(() => prepareLocal(root), /Missing .gitignore coverage/);
  assert.ok(!fs.existsSync(path.join(root, '.local')));
});
