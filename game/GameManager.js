const db = require('../database/models');

class GameManager {
    constructor() {
        this.activeGames = new Map();
    }

    async startGame(groupId) {
        try {
            const result = await db.client.query(
                'INSERT INTO games (group_id, status) VALUES ($1, $2) RETURNING id',
                [groupId, 'waiting']
            );
            
            const gameId = result.rows[0].id;
            console.log(`🎮 Novo jogo iniciado: ${gameId} no grupo ${groupId}`);
            return gameId;
            
        } catch (error) {
            console.error('❌ Erro ao iniciar jogo:', error);
            throw error;
        }
    }

    async addPlayer(gameId, playerId, playerName, bio = '') {
        try {
            // Salvar jogador
            await db.savePlayer(playerId, playerName, bio);
            
            // Adicionar ao jogo
            await db.addPlayerToGame(gameId, playerId);
            
            console.log(`✅ ${playerName} entrou no jogo ${gameId}`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao adicionar jogador:', error);
            throw error;
        }
    }

    async shufflePlayers(gameId) {
        try {
            const players = await db.getGamePlayers(gameId);
            
            if (players.length === 0) {
                console.log(`⚠️ Nenhum jogador para embaralhar no jogo ${gameId}`);
                return [];
            }
            
            // Embaralha Fisher-Yates
            for (let i = players.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [players[i], players[j]] = [players[j], players[i]];
            }
            
            // Atualiza ordem no banco
            for (let i = 0; i < players.length; i++) {
                await db.client.query(
                    'UPDATE game_players SET turn_order = $1 WHERE game_id = $2 AND player_id = $3',
                    [i + 1, gameId, players[i].id]
                );
            }
            
            console.log(`🎲 Jogo ${gameId}: ${players.length} jogadores embaralhados`);
            return players;
            
        } catch (error) {
            console.error('❌ Erro ao embaralhar jogadores:', error);
            throw error;
        }
    }

    async getGameOrder(gameId) {
        try {
            return await db.getGamePlayers(gameId);
        } catch (error) {
            console.error('❌ Erro ao buscar ordem do jogo:', error);
            return [];
        }
    }

    async setCurrentPlayer(gameId, playerId) {
        try {
            await db.client.query(
                'UPDATE games SET current_player_id = $1 WHERE id = $2',
                [playerId, gameId]
            );
            console.log(`🎤 Jogador ${playerId} definido como atual no jogo ${gameId}`);
        } catch (error) {
            console.error('❌ Erro ao definir jogador atual:', error);
            throw error;
        }
    }

    async setNextPlayer(gameId, playerId) {
        try {
            await db.client.query(
                'UPDATE games SET next_player_id = $1 WHERE id = $2',
                [playerId, gameId]
            );
            console.log(`⏭️ Jogador ${playerId} definido como próximo no jogo ${gameId}`);
        } catch (error) {
            console.error('❌ Erro ao definir próximo jogador:', error);
            throw error;
        }
    }

    async getNextPlayer(gameId) {
        try {
            const game = await db.getActiveGameById(gameId);
            
            if (!game) {
                console.log(`⚠️ Jogo ${gameId} não encontrado`);
                return null;
            }
            
            if (!game.next_player_id) {
                const players = await this.getGameOrder(gameId);
                return players.length > 0 ? players[0] : null;
            }
            
            return await db.getPlayer(game.next_player_id);
            
        } catch (error) {
            console.error('❌ Erro ao buscar próximo jogador:', error);
            return null;
        }
    }

    async removePlayer(gameId, playerId, reason = '') {
        try {
            await db.client.query(`
                UPDATE game_players 
                SET status = 'removed', removed_reason = $1, removed_at = NOW()
                WHERE game_id = $2 AND player_id = $3
            `, [reason, gameId, playerId]);
            
            // Reordenar jogadores restantes
            const players = await db.getGamePlayers(gameId);
            for (let i = 0; i < players.length; i++) {
                await db.client.query(
                    'UPDATE game_players SET turn_order = $1 WHERE game_id = $2 AND player_id = $3',
                    [i + 1, gameId, players[i].id]
                );
            }
            
            console.log(`❌ Jogador ${playerId} removido do jogo ${gameId} (motivo: ${reason})`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao remover jogador:', error);
            throw error;
        }
    }

    async getGameInfo(gameId) {
        try {
            const result = await db.client.query(
                'SELECT * FROM games WHERE id = $1',
                [gameId]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Erro ao buscar info do jogo:', error);
            return null;
        }
    }

    async countPlayers(gameId) {
        try {
            const result = await db.client.query(
                'SELECT COUNT(*) FROM game_players WHERE game_id = $1 AND status = $2',
                [gameId, 'active']
            );
            return parseInt(result.rows[0].count) || 0;
        } catch (error) {
            console.error('❌ Erro ao contar jogadores:', error);
            return 0;
        }
    }

    async isPlayerInGame(gameId, playerId) {
        try {
            const result = await db.client.query(
                'SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2 AND status = $3',
                [gameId, playerId, 'active']
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('❌ Erro ao verificar jogador:', error);
            return false;
        }
    }
}

module.exports = new GameManager();