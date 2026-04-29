require('dotenv').config();

const { createWppConnectClient } = require('../../whatsapp/clientFactory');
const WppConnectApplication = require('./app/WppConnectApplication');

async function bootstrapWppConnectOnly() {
  const client = await createWppConnectClient();
  const appFactory = new WppConnectApplication({ client });
  const app = appFactory.create();

  app.setupEvents();
  await client.initialize();

  return app;
}

if (require.main === module) {
  bootstrapWppConnectOnly().catch((error) => {
    console.error('❌ Falha ao iniciar versão standalone WPPConnect:', error);
    process.exit(1);
  });
}

module.exports = { bootstrapWppConnectOnly };
