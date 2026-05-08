const assert = require('assert');
const MediaCommandHandler = require('../whatsapp/handlers/mediaCommandHandler');

function createMessage(senderId = process.env.SUPREMO_ID) {
  const replies = [];
  return {
    from: senderId,
    author: senderId,
    replies,
    reply: async (text) => {
      replies.push(text);
    },
    getChat: async () => ({
      id: { _serialized: 'test-chat@g.us' },
      isGroup: true,
      sendMessage: async () => true,
    }),
  };
}

async function run() {
  process.env.SUPREMO_ID = '258866630883@c.us';
  delete process.env.MEDIA_DOWNLOADS_ENABLED;

  const handler = new MediaCommandHandler();
  assert.equal(handler.enabled, true);

  const supremoMsg = createMessage();
  assert.equal(await handler.tryHandle({ msg: supremoMsg, command: '!musica', args: ['off'], text: '!musica off' }), true);
  assert.equal(handler.enabled, false);
  assert.ok(supremoMsg.replies.at(-1).includes('desativados'));

  const blockedMsg = createMessage('user@c.us');
  assert.equal(await handler.tryHandle({ msg: blockedMsg, command: '!mp3', args: ['teste'], text: '!mp3 teste' }), true);
  assert.ok(blockedMsg.replies.at(-1).includes('desativados'));

  const nonSupremoMsg = createMessage('user@c.us');
  assert.equal(await handler.tryHandle({ msg: nonSupremoMsg, command: '!musica', args: ['on'], text: '!musica on' }), true);
  assert.equal(handler.enabled, false);
  assert.ok(nonSupremoMsg.replies.at(-1).includes('SUPREMO'));

  assert.equal(await handler.tryHandle({ msg: supremoMsg, command: '!musica', args: ['on'], text: '!musica on' }), true);
  assert.equal(handler.enabled, true);

  process.env.MEDIA_DOWNLOADS_ENABLED = 'false';
  const disabledByEnv = new MediaCommandHandler();
  assert.equal(disabledByEnv.enabled, false);

  console.log('ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
