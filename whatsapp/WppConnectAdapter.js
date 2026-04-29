const EventEmitter = require('events');

class WppConnectAdapter extends EventEmitter {
  constructor(rawClient) {
    super();
    this.rawClient = rawClient;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    this.rawClient.onMessage((data) => {
      const msg = this.toMessage(data);
      this.emit('message', msg);
    });

    this.rawClient.onStateChange((state) => {
      this.emit('change_state', state);
    });

    this.emit('ready');
  }

  async destroy() {
    if (typeof this.rawClient.close === 'function') {
      await this.rawClient.close();
    }
  }

  async getContactById(id) {
    const contact = await this.rawClient.getContact(id).catch(() => null);
    if (!contact) return null;
    return {
      name: contact.name,
      pushname: contact.pushname || contact.name,
      id: { _serialized: id },
    };
  }

  toMessage(data) {
    const adapter = this;
    return {
      id: { _serialized: data.id },
      from: data.from,
      author: data.author,
      fromMe: data.fromMe,
      body: data.body,
      content: data.content,
      selectedRowId: data.selectedRowId,
      selectedButtonId: data.selectedButtonId,
      mentionedIds: (data.mentionedJidList || []).map((jid) => jid),
      async getChat() {
        return adapter.toChat(data);
      },
      async reply(text) {
        const target = data.isGroupMsg ? data.chatId || data.from : data.from;
        return adapter.rawClient.sendText(target, text);
      },
    };
  }

  toChat(data) {
    const adapter = this;
    const chatId = data.chatId || data.from;
    return {
      id: { _serialized: chatId },
      isGroup: Boolean(data.isGroupMsg || String(chatId).endsWith('@g.us')),
      sendMessage: async (text) => adapter.rawClient.sendText(chatId, text),
      sendListMessage: async (title, sections, buttonText, description, footer) => (
        adapter.rawClient.sendListMessage(chatId, title, buttonText, sections, description, footer)
      ),
      sendStateTyping: async () => null,
      clearState: async () => null,
      removeParticipants: async (ids) => adapter.rawClient.removeParticipant(chatId, ids),
      promoteParticipants: async (ids) => adapter.rawClient.promoteParticipant(chatId, ids),
      demoteParticipants: async (ids) => adapter.rawClient.demoteParticipant(chatId, ids),
      get participants() {
        return [];
      },
    };
  }
}

module.exports = WppConnectAdapter;
