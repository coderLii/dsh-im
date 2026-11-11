import assert from 'node:assert/strict';
import test from 'node:test';

import { createOutboundArtifactTool, OutboundArtifactRegistry } from '../src/channels/shared/semantic/artifact.mjs';

const exec = {
  agent: { session: { header: { id: 'session-unbound', cwd: '/tmp' }, events: [{ type: 'turn/start', data: { turn: 5 } }] } },
};

test('a turn without a consumer hands the file to the registered sender', async () => {
  const registry = new OutboundArtifactRegistry();
  const tool = createOutboundArtifactTool({ registry });
  const unregister = registry.setUnboundSender(async () => ({ sent: true, fileName: 'star.png', size: 4 }));
  assert.deepEqual(await tool.definition.execute({ path: 'star.png' }, exec),
    { sent: true, fileName: 'star.png', size: 4 });
  unregister();
  await assert.rejects(() => tool.definition.execute({ path: 'star.png' }, exec),
    /No active IM delivery consumer owns this turn/);
});

test('a live consumer keeps the queue path and never reaches the sender', () => {
  const registry = new OutboundArtifactRegistry();
  registry.setUnboundSender(async () => assert.fail('must not send immediately'));
  const session = { header: { id: 'session-owned' }, events: [{ type: 'turn/start', data: { turn: 3 } }] };
  const close = registry.openConsumer('session-owned', 'rpc-owned');
  registry.observeSessionEvent(session, { type: 'user/message', data: { turn: 3, source: { rpcId: 'rpc-owned' } } });
  assert.equal(registry.unboundSenderFor({ agent: { session } }), null);
  close();
});

test('a sender that does not claim the Session leaves the refusal intact', async () => {
  const registry = new OutboundArtifactRegistry();
  const tool = createOutboundArtifactTool({ registry });
  const sender = async () => assert.fail('must not send');
  sender.handles = () => false;
  registry.setUnboundSender(sender);
  assert.equal(registry.unboundSenderHandles(exec.agent.session), false);
  await assert.rejects(() => tool.definition.execute({ path: 'star.png' }, exec),
    /No active IM delivery consumer owns this turn/);
});
