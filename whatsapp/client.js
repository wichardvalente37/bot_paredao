const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class WhatsAppClient {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'paredao-bot',
                dataPath: './session'
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.setupEvents();
    }

    setupEvents() {
        this.client.on('qr', (qr) => {
            console.log('🔍 Escaneie o QR Code:');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            console.log('✅ WhatsApp conectado e PRONTO!');
            console.log('🤖 Bot operacional - Aguardando comandos...');
        });

        this.client.on('authenticated', () => {
            console.log('✅ Autenticado!');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.log('❌ Desconectado:', reason);
        });
    }

    async initialize() {
        try {
            await this.client.initialize();
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar:', error);
            return false;
        }
    }

    getClient() {
        return this.client;
    }
}

module.exports = new WhatsAppClient();