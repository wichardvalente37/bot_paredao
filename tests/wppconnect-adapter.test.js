const assert = require('assert');
const WppConnectAdapter = require('../whatsapp/WppConnectAdapter');

function createRawClientStub() {
  return {
    listCall: null,
    onMessage(handler) { this._onMessage = handler; },
    onStateChange(handler) { this._onStateChange = handler; },
    onIncomingCall(handler) { this._onIncomingCall = handler; },
    onAck(handler) { this._onAck = handler; },
    useHere: async () => true,
    sendText: async (to, text) => ({ to, text }),
    sendMentioned: async (to, text, mentions) => ({ to, text, mentions }),
    sendListMessage: async function(to, payload) { this.listCall = { to, payload }; return true; },
    sendButtons: async (to, text, buttons) => ({ to, text, buttons }),
    sendPoll: async (to, name, options, selectableCount) => ({ to, name, options, selectableCount }),
    getGroupMembers: async () => ([{ id: '111@c.us', isAdmin: true }, { id: '222@c.us', isSuperAdmin: true }]),
    getContact: async (id) => ({ id, name: 'Nome' }),
    close: async () => true,
  };
}

async function run() {
  const raw = createRawClientStub();
  const adapter = new WppConnectAdapter(raw);

  let ready = false;
  adapter.on('ready', () => { ready = true; });
  await adapter.initialize();
  assert.equal(ready, true);

  let receivedMsg = null;
  adapter.on('message', (m) => { receivedMsg = m; });
  raw._onMessage({ id: 'abc', from: '123@g.us', chatId: '123@g.us', isGroupMsg: true, body: '!menu', mentionedJidList: ['111@c.us'] });

  assert.ok(receivedMsg);
  assert.equal(receivedMsg.body, '!menu');
  assert.deepEqual(receivedMsg.mentionedIds, ['111@c.us']);

  const chat = await receivedMsg.getChat();
  assert.equal(chat.isGroup, true);
  assert.equal(chat.participants.length, 2);

  const mentionResponse = await chat.sendMessage('oi', { mentions: ['111@c.us'] });
  assert.deepEqual(mentionResponse.mentions, ['111@c.us']);

  await chat.sendListMessage('t', [{ title: 's', rows: [] }], 'btn', 'desc', 'footer');
  assert.ok(Array.isArray(raw.listCall.payload.sections));

  const poll = await chat.sendPoll('Pergunta', ['A', 'B'], 1);
  assert.equal(poll.name, 'Pergunta');

  const contact = await adapter.getContactById('999@c.us');
  assert.equal(contact.name, 'Nome');

  await adapter.destroy();
  console.log('ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
