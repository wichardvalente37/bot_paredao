require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Database = require('./database');
const GameManager = require('./game-manager');
const SupremoCommands = require('./supremo-commands');
const http = require('http');
const fs = require('fs');
const path = require('path');
const BotApplication = require('./app/BotApplication');


function startHealthServer() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const indexPath = path.join(__dirname, 'index.html');

  const server = http.createServer((req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(indexPath, 'utf8', (error, html) => {
        if (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Erro ao carregar index.html');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  server.listen(port, () => {
    console.log(`🌐 Health server ativo em http://0.0.0.0:${port}`);
  });
}

function createClient() {
  const executablePath = process.env.CHROME_PATH || undefined;
  const headless = process.env.WWEBJS_HEADLESS ? process.env.WWEBJS_HEADLESS !== 'false' : true;

  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'paredao-bot',
      dataPath: './.wwebjs_auth',
    }),
    puppeteer: {
      headless,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });
}

async function bootstrap() {
  const db = Database;
  const client = createClient();
  const manager = new GameManager(client);
  const supremoCommands = new SupremoCommands(client, manager);
  const app = new BotApplication({ client, db, manager, supremoCommands });

  client.on('qr', (qr) => {
    console.log('====================================');
    console.log('📸 QR Code gerado - escaneie com WhatsApp');
    console.log('====================================');
    qrcode.generate(qr, { small: true });
    console.log('====================================');
  });

  client.on('authenticated', () => console.log('✅ Autenticado!'));
  client.on('auth_failure', (err) => console.error('❌ Falha na autenticação:', err.message));

  process.on('SIGINT', async () => {
    console.log('\n🛑 Desligando bot...');

    manager.timers.forEach((timer) => clearInterval(timer));

    if (db.pg) {
      await db.pg.end();
      console.log('🗄️ Banco desconectado');
    }

    await client.destroy().catch((error) => {
      console.log('⚠️ Erro ao encerrar cliente:', error.message);
    });

    console.log('👋 Bot desligado');
    process.exit(0);
  });

  process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
  process.on('uncaughtException', (error) => console.error('❌ Uncaught Exception:', error));

  await db.connect();

  console.log('====================================');
  console.log('🤖 INICIANDO BOT DO PAREDÃO...');
  console.log('====================================');

  app.setupEvents();
  startHealthServer();
  client.initialize();
}

bootstrap().catch((error) => {
  console.error('❌ Erro ao iniciar aplicação:', error);
  process.exit(1);
});
