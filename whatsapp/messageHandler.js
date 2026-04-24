const GameManager = require('../game/GameManager');
const Formatters = require('../utils/formatters');
const db = require('../database/models');

let client = null;

class MessageHandler {
    constructor() {
        if (!client) {
            const whatsapp = require('./client');
            client = whatsapp.getClient();
        }
    }

    async handleMessage(msg) {
        try {
            // Ignorar mensagens próprias
            if (msg.fromMe) return;

            console.log(`📨 Mensagem recebida de ${msg.from}: ${msg.body?.substring(0, 50)}`);

            const chat = await msg.getChat();
            
            // Obter contato de forma segura
            let contact;
            try {
                contact = await msg.getContact();
            } catch (error) {
                // Fallback
                contact = {
                    id: { _serialized: msg.author || msg.from },
                    name: 'Usuário',
                    pushname: 'Usuário'
                };
            }

            if (chat.isGroup) {
                await this.handleGroupMessage(msg, chat, contact);
            } else {
                await this.handleDMMessage(msg, contact);
            }

        } catch (error) {
            console.error('❌ Erro no handler:', error.message);
        }
    }

    async handleGroupMessage(msg, chat, contact) {
        const text = msg.body?.trim();
        if (!text) return;

        // Verificar se é comando
        if (text.startsWith('!')) {
            await this.handleCommand(msg, chat, contact, text);
        }
    }

    async handleCommand(msg, chat, contact, text) {
        const command = text.toLowerCase().split(' ')[0];
        const args = text.split(' ').slice(1);
        
        console.log(`🎯 Comando: ${command} de ${contact.name || contact.pushname}`);

        // COMANDOS PÚBLICOS
        switch(command) {
            case '!comandos':
                await this.showCommands(msg);
                break;
                
            case '!entrar':
                await this.joinGame(msg, chat, contact);
                break;
                
            case '!status':
                await this.showGameStatus(msg, chat);
                break;
                
            case '!ping':
                await msg.reply('🏓 Pong! Bot do Paredão online!');
                break;
                
            // COMANDOS ADMIN (simplificado por enquanto)
            case '!iniciarparedao':
                await this.startParedao(msg, chat, contact);
                break;
                
            case '!teste':
                await msg.reply('✅ Bot funcionando! Use !comandos para ver opções');
                break;
                
            default:
                await msg.reply(`❌ Comando desconhecido: ${command}\nUse !comandos para ver opções`);
        }
    }

    async showCommands(msg) {
        const commands = `
🤖 *BOT DO PAREDÃO - COMANDOS*

📋 *PÚBLICOS:*
!entrar - Entrar no paredão atual
!status - Ver status do jogo
!comandos - Ver esta lista

👑 *ADMIN:*
!iniciarparedao - Iniciar novo paredão
!sortear - Sortear ordem dos jogadores
!comecar - Começar primeiro turno

🔧 *TESTE:*
!ping - Testar se bot responde
!teste - Mensagem de teste

*Desenvolvido por Supremo Defalt 404*
`;
        await msg.reply(commands);
    }

    async joinGame(msg, chat, contact) {
        try {
            const game = await db.getActiveGame(chat.id._serialized);
            
            if (!game) {
                await msg.reply('❌ Nenhum paredão ativo no momento\nUm admin precisa usar !iniciarparedao primeiro');
                return;
            }

            // Verificar se já está no jogo
            const alreadyInGame = await db.client.query(
                'SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2 AND status = $3',
                [game.id, contact.id._serialized, 'active']
            );

            if (alreadyInGame.rows.length > 0) {
                await msg.reply('❌ Você já está neste paredão');
                return;
            }

            // Adicionar jogador
            await GameManager.addPlayer(
                game.id,
                contact.id._serialized,
                contact.name || contact.pushname || 'Jogador',
                ''
            );

            await msg.reply(`✅ ${contact.name || contact.pushname} entrou no paredão!`);
            
            // Contar jogadores
            const players = await db.client.query(
                'SELECT COUNT(*) FROM game_players WHERE game_id = $1 AND status = $2',
                [game.id, 'active']
            );
            
            const total = parseInt(players.rows[0].count);
            await msg.reply(`👥 Agora temos ${total} jogador${total !== 1 ? 'es' : ''} no paredão!`);

        } catch (error) {
            console.error('Erro ao entrar no jogo:', error);
            await msg.reply('❌ Erro ao entrar no paredão');
        }
    }

    async showGameStatus(msg, chat) {
        try {
            const game = await db.getActiveGame(chat.id._serialized);

            if (!game) {
                await msg.reply('📭 Nenhum paredão ativo no momento');
                return;
            }

            let statusMessage = `📊 *STATUS DO PAREDÃO*\n\n`;

            if (game.status === 'waiting') {
                statusMessage += `🟡 AGUARDANDO INÍCIO\n`;
            } else if (game.status === 'active') {
                statusMessage += `🔴 EM ANDAMENTO\n`;
            }

            // Contar jogadores
            const playersResult = await db.client.query(
                'SELECT COUNT(*) FROM game_players WHERE game_id = $1 AND status = $2',
                [game.id, 'active']
            );
            
            const totalPlayers = parseInt(playersResult.rows[0].count);
            statusMessage += `👥 Jogadores: ${totalPlayers}\n`;

            if (game.current_player_id) {
                const currentPlayer = await db.getPlayer(game.current_player_id);
                statusMessage += `🎤 No paredão: ${currentPlayer?.name || 'Desconhecido'}\n`;
            }

            if (game.next_player_id) {
                const nextPlayer = await db.getPlayer(game.next_player_id);
                statusMessage += `⏭️ Próximo: ${nextPlayer?.name || 'Desconhecido'}\n`;
            }

            statusMessage += `\nUse !entrar para participar`;

            await msg.reply(statusMessage);

        } catch (error) {
            console.error('Erro ao mostrar status:', error);
            await msg.reply('❌ Erro ao buscar status do jogo');
        }
    }

    async startParedao(msg, chat, contact) {
        try {
            // Verificar se já há jogo ativo
            const existingGame = await db.getActiveGame(chat.id._serialized);
            if (existingGame && existingGame.status !== 'finished') {
                await msg.reply('⚠️ Já há um paredão ativo! Use !status para ver');
                return;
            }

            // Criar novo jogo
            const gameId = await GameManager.startGame(chat.id._serialized);

            // Marcar todos (forma simplificada)
            let mentionText = '';
            try {
                const participants = chat.participants;
                mentionText = participants.map(p => `@${p.id.user}`).join(' ');
            } catch (error) {
                mentionText = '@all';
            }

            await msg.reply(
                `🎬 *PAREDÃO INICIADO!*\n\n${mentionText}\n\n` +
                `Use !entrar para participar do paredão!\n` +
                `Depois use !sortear para definir a ordem.`
            );

            console.log(`🎮 Novo paredão iniciado por ${contact.name || contact.pushname}`);

        } catch (error) {
            console.error('Erro ao iniciar paredão:', error);
            await msg.reply('❌ Erro ao iniciar paredão');
        }
    }

    async handleDMMessage(msg, contact) {
        const text = msg.body?.trim();
        if (!text) return;

        console.log(`📩 DM de ${contact.name}: ${text.substring(0, 50)}`);

        // Responder no DM
        await msg.reply(
            `🤖 *BOT DO PAREDÃO*\n\n` +
            `Olá ${contact.name || 'amigo'}!\n` +
            `Para participar do paredão, entre no grupo e use:\n` +
            `• !entrar - Para entrar no jogo\n` +
            `• !status - Para ver status\n\n` +
            `*Instruções:*\n` +
            `1. Quando for seu turno, você receberá perguntas aqui\n` +
            `2. Responda usando a função "Responder" do WhatsApp\n` +
            `3. Sua resposta aparecerá no grupo automaticamente`
        );
    }
}

module.exports = new MessageHandler();