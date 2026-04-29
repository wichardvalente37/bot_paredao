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

    if (typeof this.rawClient.onIncomingCall === 'function') {
      this.rawClient.onIncomingCall((call) => this.emit('incoming_call', call));
    }

    if (typeof this.rawClient.onAck === 'function') {
      this.rawClient.onAck((ack) => this.emit('message_ack', ack));
    }

    this.rawClient.onStateChange((state) => {
      this.emit('change_state', state);
      if (String(state).toUpperCase() === 'CONFLICT') this.rawClient.useHere?.();
    });

    this.emit('ready');
  }

  async destroy() {
    if (typeof this.rawClient.close === 'function') await this.rawClient.close();
  }

  async getChatById(chatId) {
    return this.toChat({ chatId, from: chatId, isGroupMsg: String(chatId).endsWith('@g.us') });
  }

  async getContactById(id) {
    const contact = await this.rawClient.getContact(id).catch(() => null);
    if (!contact) return null;
    return { name: contact.name, pushname: contact.pushname || contact.name, id: { _serialized: id } };
  }

  toMessage(data) {
    const adapter = this;
    const target = data.isGroupMsg ? data.chatId || data.from : data.from;
    return {
      id: { _serialized: data.id },
      from: data.from,
      author: data.author,
      fromMe: data.fromMe,
      body: data.body,
      type: data.type,
      timestamp: data.t,
      content: data.content,
      selectedRowId: data.selectedRowId,
      selectedButtonId: data.selectedButtonId,
      mentionedIds: (data.mentionedJidList || []).map((jid) => jid),
      async getChat() {
        const chat = adapter.toChat(data);
        chat.participants = await chat.refreshParticipants();
        return chat;
      },
      async reply(text) {
        return adapter.rawClient.sendText(target, text);
      },
      async react(emoji) {
        if (typeof adapter.rawClient.sendReactionMessage === 'function') {
          return adapter.rawClient.sendReactionMessage(data.id, emoji);
        }
        return null;
      },
      async delete() {
        if (typeof adapter.rawClient.deleteMessage === 'function') {
          return adapter.rawClient.deleteMessage(target, data.id);
        }
        return null;
      },
    };
  }

  toChat(data) {
    const adapter = this;
    const chatId = data.chatId || data.from;
    return {
      id: { _serialized: chatId },
      isGroup: Boolean(data.isGroupMsg || String(chatId).endsWith('@g.us')),
      sendMessage: async (text, options = {}) => {
        const mentions = Array.isArray(options?.mentions) ? options.mentions : [];
        if (mentions.length > 0 && typeof adapter.rawClient.sendMentioned === 'function') {
          return adapter.rawClient.sendMentioned(chatId, text, mentions);
        }
        return adapter.rawClient.sendText(chatId, text);
      },
      sendListMessage: async (title, sections, buttonText, description, footer) => {
        const payload = { title, buttonText, description, footer, sections: Array.isArray(sections) ? sections : [] };
        return adapter.rawClient.sendListMessage(chatId, payload);
      },
      sendButtons: async (text, buttons, title = '', footer = '') => {
        if (typeof adapter.rawClient.sendButtons === 'function') {
          return adapter.rawClient.sendButtons(chatId, text, buttons, title, footer);
        }
        return adapter.rawClient.sendText(chatId, text);
      },
      sendPoll: async (name, options, selectableCount = 1) => {
        if (typeof adapter.rawClient.sendPoll === 'function') {
          return adapter.rawClient.sendPoll(chatId, name, options, selectableCount);
        }
        return null;
      },
      sendFile: async (filePath, fileName, caption = '') => {
        if (typeof adapter.rawClient.sendFile === 'function') {
          return adapter.rawClient.sendFile(chatId, filePath, fileName, caption);
        }
        return null;
      },
      sendImage: async (filePath, fileName = 'image', caption = '') => {
        if (typeof adapter.rawClient.sendImage === 'function') {
          return adapter.rawClient.sendImage(chatId, filePath, fileName, caption);
        }
        return null;
      },
      sendStateTyping: async () => (adapter.rawClient.startTyping?.(chatId) || null),
      clearState: async () => (adapter.rawClient.stopTyping?.(chatId) || null),
      removeParticipants: async (ids) => adapter.rawClient.removeParticipant(chatId, ids),
      promoteParticipants: async (ids) => adapter.rawClient.promoteParticipant(chatId, ids),
      demoteParticipants: async (ids) => adapter.rawClient.demoteParticipant(chatId, ids),
      participants: [],
      async refreshParticipants() {
        if (!String(chatId).endsWith('@g.us')) return [];
        const members = await adapter.rawClient.getGroupMembers(chatId).catch(() => []);
        return members.map((m) => ({
          id: { _serialized: m.id || m.user || m },
          isAdmin: Boolean(m.isAdmin),
          isSuperAdmin: Boolean(m.isSuperAdmin),
        }));
      },
    };
  }
}

module.exports = WppConnectAdapter;
