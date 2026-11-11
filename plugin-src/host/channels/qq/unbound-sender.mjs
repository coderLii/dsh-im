/**
 * QQ fallback for `dsh_im_return_file` when no channel started the turn: reverse
 * the state store's `conversationKey → sessionId` map and send the file now.
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

import { unboundDeliveryError } from '../../../../src/channels/shared/semantic/artifact.mjs';

/** QQ rejects a single upload above 200 MB. */
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function targetForConversationKey(key) {
  const separator = key.indexOf(':');
  if (separator < 0) return null;
  const scope = key.slice(0, separator);
  const openid = key.slice(separator + 1);
  if (!openid) return null;
  if (scope === 'group') return { kind: 'group', route: { groupOpenId: openid } };
  if (scope === 'c2c') return { kind: 'user', route: { userOpenId: openid } };
  return null;
}

export function createQqUnboundSender({ controller, workspaces, stateForSync } = {}) {
  const routeFor = (sessionId) => {
    if (!sessionId) return null;
    for (const botId of workspaces.listBotIds()) {
      const sessions = stateForSync(botId)?.snapshot?.()?.sessions ?? {};
      const binding = Object.keys(sessions).find((key) => sessions[key] === sessionId);
      const target = binding ? targetForConversationKey(binding) : null;
      if (target) return { botId, target };
    }
    return null;
  };

  const send = async function sendWithoutConsumer({ path } = {}, exec) {
    const header = exec?.agent?.session?.header;
    const requested = typeof path === 'string' ? path : '';
    const full = isAbsolute(requested) ? requested : resolve(header?.cwd ?? process.cwd(), requested);
    const route = routeFor(header?.id);
    if (!route) throw unboundDeliveryError();
    const fileName = basename(full);
    const { size } = await stat(full);
    if (size > MAX_FILE_BYTES) {
      const error = new Error(`${fileName} is larger than the ${MAX_FILE_BYTES} byte upload limit`);
      error.code = 'payload-too-large';
      throw error;
    }
    const buffer = await readFile(full);
    await controller.sendProactiveFile(route.botId, route.target, { buffer, fileName });
    return { sent: true, fileName, size: buffer.length };
  };

  // Only claim Sessions that map to a QQ conversation, so the tool guidance is
  // scoped like before and Web/CLI turns keep failing loudly.
  send.handles = (session) => routeFor(session?.header?.id) !== null;
  return send;
}
