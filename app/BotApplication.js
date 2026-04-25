const DMHandler = require('../whatsapp/handlers/dmHandler');
const GroupGameHandler = require('../whatsapp/handlers/groupGameHandler');
const ImpostorGameManager = require('../games/impostor/ImpostorGameManager');
const SupremoHandler = require('../whatsapp/handlers/supremoHandler');
const { normalizeText } = require('../whatsapp/helpers/messageUtils');

class BotApplication {
  constructor({ client, db, manager, supremoCommands }) {
    this.client = client;
    this.db = db;
    this.manager = manager;
    this.supremoCommands = supremoCommands;
    this.supremoHandler = new SupremoHandler(supremoCommands);
    this.dmHandler = new DMHandler({ db, manager });
    this.impostorManager = new ImpostorGameManager({ client, db, manager });
    this.groupGameHandler = new GroupGameHandler({ client, db, manager, impostorManager: this.impostorManager });
    this.isReady = false;
    this.reconnectAttempts = 0;
    this.maxReconnectDelayMs = 30000;
  }

  setupEvents() {
    this.client.on('ready', () => {
      this.isReady = true;
      this.reconnectAttempts = 0;
      console.log('====================================');
      console.log('🤖 BOT MAESTRO PRONTO PARA AÇÃO!');
      console.log('====================================');
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔌 Desconectado:', reason);
      this.isReady = false;
      this.scheduleReconnect();
    });

    this.client.on('message', async (msg) => this.handleMessage(msg));

    this.client.on('group_leave', async (notification) => {
      try {
        const game = await this.manager.getActiveGame(notification.chatId);
        if (game) await this.manager.removePlayer(game.id, notification.id);
      } catch (error) {
        console.error('Erro ao remover jogador que saiu:', error.message);
      }
    });

    this.client.on('group_join', async (notification) => {
      try {
        const chat = notification.chatId
          ? await this.client.getChatById(notification.chatId).catch(() => null)
          : await notification.getChat?.().catch(() => null);
        const memberId = notification.id?.participant || notification.id?._serialized || notification.id;

        if (chat?.isGroup && memberId) {
          await this.supremoCommands.welcomeNewMember(chat, memberId);
        }
      } catch (error) {
        console.error('Erro ao enviar boas-vindas do grupo:', error.message);
      }
    });
  }

  async handleMessage(msg) {
    if (!this.isReady || msg.fromMe) return;

    try {
      const chat = await msg.getChat();
      const senderId = msg.author || msg.from;
      const text = normalizeText(msg);
      const command = text.split(' ')[0].toLowerCase();
      const args = text.split(' ').slice(1);

      if (!chat.isGroup) {
        await this.dmHandler.handle({ msg, senderId });
        return;
      }

      if (!text.startsWith('!')) return;

      const handledBySupremo = await this.supremoHandler.tryHandle({ chat, senderId, command, msg, args });
      if (handledBySupremo) return;

      const handledByGame = await this.groupGameHandler.handle({
        msg,
        chat,
        senderId,
        command,
        args,
      });

      if (!handledByGame) {
        await msg.reply('❌ Comando não reconhecido. Use !comandos');
      }
    } catch (error) {
      console.error('❌ Erro no roteamento:', error);
      await msg.reply('❌ Ocorreu um erro').catch(() => null);
    }
  }

  scheduleReconnect() {
    const delay = Math.min(5000 * (this.reconnectAttempts + 1), this.maxReconnectDelayMs);
    this.reconnectAttempts += 1;
    console.log(`🔁 Tentando reconectar em ${Math.round(delay / 1000)}s (tentativa ${this.reconnectAttempts})...`);
    setTimeout(async () => {
      try {
        await this.client.initialize();
      } catch (error) {
        console.error('❌ Falha ao reconectar:', error.message);
        this.scheduleReconnect();
      }
    }, delay);
  }
}

module.exports = BotApplication;
