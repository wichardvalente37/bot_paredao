require('dotenv').config();
const { Client } = require('pg');

class Database {
    constructor() {
        this.client = new Client({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });
        
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;
        
        try {
            await this.client.connect();
            this.connected = true;
            console.log('✅ Conectado ao PostgreSQL');
        } catch (error) {
            console.error('❌ Erro ao conectar ao banco:', error.message);
            throw error;
        }
    }

    async query(text, params) {
        try {
            await this.connect();
            return await this.client.query(text, params);
        } catch (error) {
            console.error('❌ Erro na query:', error.message);
            throw error;
        }
    }

    async end() {
        if (this.connected) {
            await this.client.end();
            this.connected = false;
            console.log('🔌 Conexão com banco encerrada');
        }
    }
}

module.exports = new Database();