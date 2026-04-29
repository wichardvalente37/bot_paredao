class WppClientAdapter {
  constructor(rawClient) {
    this.rawClient = rawClient;
  }

  async sendListMessage(to, payload) {
    return this.rawClient.sendListMessage(to, payload);
  }
}

module.exports = WppClientAdapter;
