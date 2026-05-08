const { Client, LocalAuth } = require('whatsapp-web.js');

function resolveChromeExecutablePath() {
  return process.env.WWEBJS_EXECUTABLE_PATH || process.env.CHROME_PATH || undefined;
}

function createWhatsappWebJsClient() {
  const executablePath = resolveChromeExecutablePath();
  const headless = process.env.WWEBJS_HEADLESS ? process.env.WWEBJS_HEADLESS !== 'false' : true;
  const authPath = process.env.WWEBJS_AUTH_PATH || '/tmp/.wwebjs_auth';

  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'maestro-bot',
      dataPath: authPath,
    }),
    puppeteer: {
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'],
      ...(executablePath ? { executablePath } : {}),
    },
  });
}

module.exports = {
  createWhatsappWebJsClient,
};
