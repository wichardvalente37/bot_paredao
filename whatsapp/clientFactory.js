const { Client, LocalAuth } = require('whatsapp-web.js');
const wppconnect = require('@wppconnect-team/wppconnect');

function resolveChromeExecutablePath() {
  return process.env.WWEBJS_EXECUTABLE_PATH || process.env.CHROME_PATH || undefined;
}

function createWhatsappWebJsClient() {
  const executablePath = resolveChromeExecutablePath();
  const headless = process.env.WWEBJS_HEADLESS ? process.env.WWEBJS_HEADLESS !== 'false' : true;
  const authPath = process.env.WWEBJS_AUTH_PATH || '/tmp/.wwebjs_auth';
  const webVersionRemotePath = process.env.WWEBJS_WEB_VERSION_REMOTE_PATH
    || 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023553226-alpha.html';

  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'maestro-bot',
      dataPath: authPath,
    }),
    webVersionCache: {
      type: 'remote',
      remotePath: webVersionRemotePath,
    },
    puppeteer: {
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'],
      ...(executablePath ? { executablePath } : {}),
    },
  });
}

async function createWppConnectClient() {
  const sessionName = process.env.WPPCONNECT_SESSION || 'maestro-bot';
  const tokenStorePath = process.env.WPPCONNECT_TOKEN_STORE || process.env.WWEBJS_AUTH_PATH || '/tmp/.wwebjs_auth';

  const client = await wppconnect.create({
    session: sessionName,
    tokenStore: 'file',
    folderNameToken: tokenStorePath,
    headless: process.env.WPPCONNECT_HEADLESS ? process.env.WPPCONNECT_HEADLESS !== 'false' : true,
    disableWelcome: true,
    autoClose: 0,
    updatesLog: false,
  });

  return client;
}

module.exports = {
  createWhatsappWebJsClient,
  createWppConnectClient,
};
