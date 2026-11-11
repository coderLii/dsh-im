import assert from 'node:assert/strict';
import { mkdtemp, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createQqUnboundSender } from '../../../plugin-src/host/channels/qq/unbound-sender.mjs';

const SESSION = 'session-a38ea7f2';

function fixture(sessions = { 'group:108D3': SESSION }) {
  const sent = [];
  const sender = createQqUnboundSender({
    controller: { sendProactiveFile: async (botId, target, file) => sent.push({ botId, target, file }) },
    workspaces: { listBotIds: () => ['qq_a'] },
    stateForSync: () => ({ snapshot: () => ({ sessions }) }),
  });
  return { sender, sent };
}

const exec = (cwd, id = SESSION) => ({ agent: { session: { header: { id, cwd } } } });

test('a bound Session sends to its conversation as a proactive message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-im-qq-unbound-'));
  await writeFile(join(dir, 'star.png'), Buffer.from('89504e47', 'hex'));
  const { sender, sent } = fixture();
  assert.equal(sender.handles(exec(dir).agent.session), true);
  assert.deepEqual(await sender({ path: 'star.png' }, exec(dir)), { sent: true, fileName: 'star.png', size: 4 });
  assert.deepEqual(sent[0].target, { kind: 'group', route: { groupOpenId: '108D3' } });
});

test('an unbound Session is not claimed and keeps the original refusal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-im-qq-unbound-'));
  await writeFile(join(dir, 'star.png'), Buffer.from('89504e47', 'hex'));
  const { sender, sent } = fixture({ 'group:108D3': 'session-other' });
  assert.equal(sender.handles(exec(dir).agent.session), false);
  await assert.rejects(() => sender({ path: 'star.png' }, exec(dir)), /No active IM delivery consumer/);
  assert.equal(sent.length, 0);
});

test('oversized files fail before they are read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-im-qq-unbound-'));
  const big = join(dir, 'big.png');
  await writeFile(big, '');
  await truncate(big, 200 * 1024 * 1024 + 1);
  const { sender } = fixture();
  await assert.rejects(() => sender({ path: 'big.png' }, exec(dir)), /upload limit/);
});
