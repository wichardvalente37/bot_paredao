require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const Database = require('./database');
const GameManager = require('./games/paredao/ParedaoGameManager');
const SupremoCommands = require('./supremo-commands');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BotApplication = require('./app/BotApplication');
const puppeteer = require('puppeteer');

const qrState = {
  dataUrl: null,
  authenticated: false,
  lastUpdated: null,
};

function getQrStatusPayload() {
  return {
    authenticated: qrState.authenticated,
    hasQr: Boolean(qrState.dataUrl),
    qrDataUrl: qrState.dataUrl,
    lastUpdated: qrState.lastUpdated,
  };
}

function renderQrPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QR Code - Bot WhatsApp</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: #111827;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      padding: 24px;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    h1 { margin-top: 0; font-size: 22px; }
    p { color: #94a3b8; }
    #qrImage {
      background: white;
      border-radius: 8px;
      padding: 10px;
      display: none;
      width: 280px;
      height: 280px;
      margin: 16px auto;
      object-fit: contain;
    }
    .status-ok { color: #22c55e; font-weight: bold; }
    .status-wait { color: #f59e0b; font-weight: bold; }
    .small { font-size: 12px; color: #64748b; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>QR Code do WhatsApp</h1>
    <p id="statusText" class="status-wait">Aguardando geração do QR...</p>
    <img id="qrImage" alt="QR Code do WhatsApp" />
    <p class="small">Atualização automática a cada 5 segundos.</p>
  </div>

  <script>
    async function refreshQr() {
      try {
        const response = await fetch('/qr/status', { cache: 'no-store' });
        const data = await response.json();

        const statusText = document.getElementById('statusText');
        const qrImage = document.getElementById('qrImage');

        if (data.authenticated) {
          statusText.textContent = '✅ Já autenticado. Não é necessário QR no momento.';
          statusText.className = 'status-ok';
          qrImage.style.display = 'none';
          qrImage.removeAttribute('src');
          return;
        }

        if (data.hasQr && data.qrDataUrl) {
          statusText.textContent = '📱 Escaneie o QR Code abaixo com o WhatsApp.';
          statusText.className = 'status-wait';
          qrImage.src = data.qrDataUrl;
          qrImage.style.display = 'block';
          return;
        }

        statusText.textContent = 'Aguardando geração do QR...';
        statusText.className = 'status-wait';
        qrImage.style.display = 'none';
        qrImage.removeAttribute('src');
      } catch (error) {
        console.error('Erro ao atualizar status do QR:', error);
      }
    }

    refreshQr();
    setInterval(refreshQr, 5000);
  </script>
</body>
</html>`;
}

function startHealthServer() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const indexPath = path.join(__dirname, 'index.html');

  const server = http.createServer((req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
      return;
    }

    if (req.url === '/qr') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderQrPage());
      return;
    }

    if (req.url === '/qr/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(getQrStatusPayload()));
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

function resolveChromeExecutablePath() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  try {
    return puppeteer.executablePath();
  } catch (error) {
    console.warn('⚠️ Não foi possível resolver o Chrome do Puppeteer automaticamente:', error.message);
    return undefined;
  }
}

function ensureChromeAvailable() {
  let executablePath = resolveChromeExecutablePath();

  if (executablePath && fs.existsSync(executablePath)) {
    return executablePath;
  }

  console.warn('⚠️ Chrome do Puppeteer não encontrado. Tentando instalar automaticamente...');

  try {
    execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Falha ao instalar o Chrome do Puppeteer:', error.message);
    return executablePath;
  }

  executablePath = resolveChromeExecutablePath();

  if (!executablePath || !fs.existsSync(executablePath)) {
    console.error('❌ Chrome ainda não encontrado após tentativa de instalação automática.');
  }

  return executablePath;
}

function createClient() {
  const executablePath = ensureChromeAvailable();
  const headless = process.env.WWEBJS_HEADLESS ? process.env.WWEBJS_HEADLESS !== 'false' : true;

  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'maestro-bot',
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

  client.on('qr', async (qr) => {
    console.log('====================================');
    console.log('📸 QR Code gerado - escaneie com WhatsApp');
    console.log('====================================');
    qrcode.generate(qr, { small: true });
    console.log('====================================');

    try {
      qrState.dataUrl = await QRCode.toDataURL(qr);
      qrState.authenticated = false;
      qrState.lastUpdated = new Date().toISOString();
      console.log('🧾 QR web atualizado em memória. Acesse /qr');
    } catch (error) {
      console.error('❌ Erro ao converter QR para base64:', error.message);
    }
  });

  client.on('authenticated', () => {
    qrState.authenticated = true;
    qrState.dataUrl = null;
    qrState.lastUpdated = new Date().toISOString();
    console.log('✅ Autenticado!');
  });
  client.on('ready', () => {
    qrState.authenticated = true;
    qrState.dataUrl = null;
    qrState.lastUpdated = new Date().toISOString();
    console.log('🚀 Cliente pronto para uso.');
  });
  client.on('auth_failure', (err) => console.error('❌ Falha na autenticação:', err.message));
  client.on('disconnected', (reason) => {
    qrState.authenticated = false;
    qrState.lastUpdated = new Date().toISOString();
    console.log('⚠️ Cliente desconectado:', reason);
  });

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
  console.log('🤖 INICIANDO BOT MAESTRO...');
  console.log('====================================');

  app.setupEvents();
  startHealthServer();
  client.initialize();
}

bootstrap().catch((error) => {
  console.error('❌ Erro ao iniciar aplicação:', error);
  process.exit(1);
});
