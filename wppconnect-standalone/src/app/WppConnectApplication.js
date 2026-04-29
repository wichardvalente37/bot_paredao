const BotApplication = require('../../../app/BotApplication');
const Database = require('../../../database');
const GameManager = require('../../../games/paredao/ParedaoGameManager');
const SupremoCommands = require('../../../supremo-commands');

class WppConnectApplication {
  constructor({ client }) {
    this.client = client;
  }

  create() {
    const manager = new GameManager(this.client);
    const supremoCommands = new SupremoCommands(this.client, manager);

    return new BotApplication({
      client: this.client,
      db: Database,
      manager,
      supremoCommands,
      clientType: 'wppconnect',
    });
  }
}

module.exports = WppConnectApplication;
