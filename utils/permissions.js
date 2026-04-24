const db = require('../database/models');

class Permissions {
    constructor(client) {
        this.client = client;
    }
    
  async isAdmin(participantId, groupId) {
        try {
            // 1. O Supremo é sempre admin
            if (participantId === process.env.SUPREMO_ID) {
                return true;
            }
            
            // 2. Verificar no banco (admins adicionados via !admin add)
            const player = await db.getPlayer(participantId);
            if (player && player.is_admin) {
                return true;
            }
            
            // 3. Verificar se é admin do grupo (usando chat.participants)
            const chat = await this.client.getChatById(groupId);
            
            // Buscar o participante no grupo sem usar funções problemáticas
            const participant = chat.participants.find(p => {
                // Comparar IDs de forma segura
                const pId = p.id && p.id._serialized ? p.id._serialized : String(p.id);
                return pId === participantId;
            });
            
            if (!participant) return false;
            
            // Verificar se é admin (propriedades podem variar)
            return participant.isAdmin === true || 
                   participant.isSuperAdmin === true ||
                   participant.admin !== null;
            
        } catch (error) {
            console.log('⚠️ Erro ao verificar permissões:', error.message);
            return false;
        }
    }
    async isSupremo(participantId) {
        return participantId === process.env.SUPREMO_ID;
    }
    
    async canManageGame(participantId, groupId) {
        return await this.isAdmin(participantId, groupId);
    }
    
    async getGroupAdmins(groupId) {
        try {
            const chat = await this.client.getChatById(groupId);
            return chat.participants.filter(p => 
                p.isAdmin || p.isSuperAdmin
            ).map(p => p.id._serialized);
        } catch (error) {
            console.log('Erro ao buscar admins do grupo:', error);
            return [];
        }
    }
    
    async isPlayerInGame(playerId, groupId) {
        try {
            const game = await db.getActiveGame(groupId);
            if (!game) return false;
            
            const result = await db.client.query(
                'SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2 AND status = $3',
                [game.id, playerId, 'active']
            );
            
            return result.rows.length > 0;
        } catch (error) {
            console.log('Erro ao verificar jogador no jogo:', error);
            return false;
        }
    }
    
    async canSendQuestion(fromPlayerId, toPlayerId, groupId) {
        try {
            // Verificar se ambos estão no mesmo jogo
            const game = await db.getActiveGame(groupId);
            if (!game) return false;
            
            // Verificar se o remetente está no jogo
            const fromInGame = await db.client.query(
                'SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2 AND status = $3',
                [game.id, fromPlayerId, 'active']
            );
            
            if (fromInGame.rows.length === 0) {
                return { allowed: false, reason: 'Você não está no paredão' };
            }
            
            // Verificar se o destinatário está no paredão no momento
            if (game.current_player_id !== toPlayerId) {
                return { allowed: false, reason: 'Não é o turno desta pessoa' };
            }
            
            // Verificar se não está enviando para si mesmo
            if (fromPlayerId === toPlayerId) {
                return { allowed: false, reason: 'Você não pode enviar perguntas para si mesmo' };
            }
            
            return { allowed: true };
            
        } catch (error) {
            console.log('Erro ao verificar permissão de pergunta:', error);
            return { allowed: false, reason: 'Erro interno' };
        }
    }
    
    async canAnswer(playerId, groupId) {
        try {
            const game = await db.getActiveGame(groupId);
            if (!game) {
                return { allowed: false, reason: 'Nenhum paredão ativo' };
            }
            
            // Verificar se é o jogador atual no paredão
            if (game.current_player_id !== playerId) {
                return { allowed: false, reason: 'Não é seu turno no paredão' };
            }
            
            return { allowed: true };
            
        } catch (error) {
            console.log('Erro ao verificar permissão de resposta:', error);
            return { allowed: false, reason: 'Erro interno' };
        }
    }
}

module.exports = Permissions;