// game/StatsManager.js
const db = require('../database/models');

class StatsManager {
    async generateGameStats(gameId) {
        const game = await this.getGame(gameId);
        const players = await this.getGamePlayersWithStats(gameId);
        
        return {
            game,
            players,
            summary: await this.generateSummary(gameId, players),
            awards: await this.generateAwards(gameId, players)
        };
    }
    
    async getGame(gameId) {
        const result = await db.client.query(
            'SELECT * FROM games WHERE id = $1',
            [gameId]
        );
        return result.rows[0];
    }
    
    async getGamePlayersWithStats(gameId) {
        const result = await db.client.query(`
            SELECT 
                p.*,
                gp.turn_order,
                gp.status as player_status,
                gp.removed_reason,
                COUNT(DISTINCT q_from.id) as questions_asked,
                COUNT(DISTINCT q_to.id) as questions_received,
                COUNT(DISTINCT CASE WHEN q_to.answer_text IS NOT NULL THEN q_to.id END) as questions_answered,
                COALESCE(AVG(q_to.reactions_count), 0) as avg_reactions,
                MAX(q_to.reactions_count) as max_reactions
            FROM players p
            JOIN game_players gp ON p.id = gp.player_id
            LEFT JOIN questions q_from ON q_from.from_player_id = p.id AND q_from.game_id = $1
            LEFT JOIN questions q_to ON q_to.to_player_id = p.id AND q_to.game_id = $1
            WHERE gp.game_id = $1
            GROUP BY p.id, gp.turn_order, gp.status, gp.removed_reason
            ORDER BY gp.turn_order
        `, [gameId]);
        
        return result.rows;
    }
    
    async generateSummary(gameId, players) {
        const activePlayers = players.filter(p => p.player_status === 'active');
        const removedPlayers = players.filter(p => p.player_status !== 'active');
        
        const totalQuestions = players.reduce((sum, p) => sum + parseInt(p.questions_received || 0), 0);
        const totalAnswers = players.reduce((sum, p) => sum + parseInt(p.questions_answered || 0), 0);
        
        return {
            totalPlayers: players.length,
            activePlayers: activePlayers.length,
            removedPlayers: removedPlayers.length,
            totalQuestions,
            totalAnswers,
            answerRate: totalQuestions > 0 ? ((totalAnswers / totalQuestions) * 100).toFixed(1) : 0
        };
    }
    
    async generateAwards(gameId, players) {
        const awards = [];
        
        // Mais perguntas feitas
        const mostQuestions = [...players].sort((a, b) => 
            (b.questions_asked || 0) - (a.questions_asked || 0)
        )[0];
        if (mostQuestions && mostQuestions.questions_asked > 0) {
            awards.push({
                title: '🔍 MAIS PERGUNTADOR',
                player: mostQuestions.name,
                value: `${mostQuestions.questions_asked} perguntas`
            });
        }
        
        // Melhor resposta (mais reações)
        const bestAnswer = [...players].sort((a, b) => 
            (b.max_reactions || 0) - (a.max_reactions || 0)
        )[0];
        if (bestAnswer && bestAnswer.max_reactions > 0) {
            awards.push({
                title: '🔥 RESPOSTA BOMBÁSTICA',
                player: bestAnswer.name,
                value: `${bestAnswer.max_reactions} reações`
            });
        }
        
        // Mais respostas dadas
        const mostAnswers = [...players].sort((a, b) => 
            (b.questions_answered || 0) - (a.questions_answered || 0)
        )[0];
        if (mostAnswers && mostAnswers.questions_answered > 0) {
            const rate = ((mostAnswers.questions_answered / mostAnswers.questions_received) * 100).toFixed(0);
            awards.push({
                title: '🎤 MAIS RESPONDEU',
                player: mostAnswers.name,
                value: `${mostAnswers.questions_answered} respostas (${rate}%)`
            });
        }
        
        // Mais ignorou
        const mostIgnored = [...players].sort((a, b) => {
            const aIgnored = (a.questions_received || 0) - (a.questions_answered || 0);
            const bIgnored = (b.questions_received || 0) - (b.questions_answered || 0);
            return bIgnored - aIgnored;
        })[0];
        if (mostIgnored) {
            const ignored = (mostIgnored.questions_received || 0) - (mostIgnored.questions_answered || 0);
            if (ignored > 0) {
                awards.push({
                    title: '🙈 MAIS IGNOROU',
                    player: mostIgnored.name,
                    value: `${ignored} perguntas ignoradas`
                });
            }
        }
        
        return awards;
    }
    
    async formatStatsForDisplay(stats) {
        let message = `🏆 PAREDÃO FINALIZADO\n\n`;
        
        // Resumo
        message += `📊 RESUMO:\n`;
        message += `Jogadores: ${stats.summary.totalPlayers}\n`;
        message += `Ativos: ${stats.summary.activePlayers}\n`;
        message += `Removidos/Desistentes: ${stats.summary.removedPlayers}\n`;
        message += `Perguntas totais: ${stats.summary.totalQuestions}\n`;
        message += `Respostas: ${stats.summary.totalAnswers} (${stats.summary.answerRate}%)\n\n`;
        
        // Premiações
        if (stats.awards.length > 0) {
            message += `🎖️ PREMIAÇÕES:\n`;
            stats.awards.forEach(award => {
                message += `${award.title}\n${award.player} - ${award.value}\n\n`;
            });
        }
        
        // Jogadores ativos
        const activePlayers = stats.players.filter(p => p.player_status === 'active');
        if (activePlayers.length > 0) {
            message += `👑 SOBREVIVENTES:\n`;
            activePlayers.forEach((player, index) => {
                message += `${index + 1}. ${player.name}\n`;
                message += `   Perguntas: ${player.questions_asked || 0} enviadas | ${player.questions_received || 0} recebidas\n`;
                message += `   Respostas: ${player.questions_answered || 0} (${player.questions_received ? Math.round((player.questions_answered / player.questions_received) * 100) : 0}%)\n\n`;
            });
        }
        
        // Removidos/Desistentes
        const removedPlayers = stats.players.filter(p => p.player_status !== 'active');
        if (removedPlayers.length > 0) {
            message += `🚫 ELIMINADOS:\n`;
            removedPlayers.forEach(player => {
                const emoji = player.removed_reason === 'desistência' ? '🏳️' : '❌';
                message += `${emoji} ${player.name} - ${player.removed_reason || 'removido'}\n`;
            });
        }
        
        message += `\n🏁 FIM DO PAREDÃO\nDecretado pelo Supremo Defalt 404`;
        
        return message;
    }
    // Adicionar função para buscar detalhes das reações
async getReactionDetails(gameId) {
    const result = await db.client.query(`
        SELECT 
            q.answer_text,
            q.reactions_count,
            p.name as player_name,
            ROW_NUMBER() OVER (ORDER BY q.reactions_count DESC) as rank
        FROM questions q
        JOIN players p ON q.to_player_id = p.id
        WHERE q.game_id = $1 
        AND q.answer_text IS NOT NULL
        AND q.reactions_count > 0
        ORDER BY q.reactions_count DESC
        LIMIT 5
    `, [gameId]);
    
    return result.rows;
}

// Atualizar formatStatsForDisplay
async formatStatsForDisplay(stats) {
    let message = `🏆 PAREDÃO FINALIZADO\n\n`;
    
    // Resumo melhorado
    message += `📊 RESUMO ESTATÍSTICO:\n`;
    message += `├─ Jogadores: ${stats.summary.totalPlayers}\n`;
    message += `├─ Finalizaram: ${stats.summary.activePlayers}\n`;
    message += `├─ Eliminados: ${stats.summary.removedPlayers}\n`;
    message += `├─ Perguntas: ${stats.summary.totalQuestions}\n`;
    message += `└─ Taxa de resposta: ${stats.summary.answerRate}%\n\n`;
    
    // Top reações
    const topReactions = await this.getReactionDetails(stats.game.id);
    if (topReactions.length > 0) {
        message += `❤️ TOP RESPOSTAS REAGIDAS:\n`;
        topReactions.forEach((item, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
            const excerpt = item.answer_text.length > 50 
                ? item.answer_text.substring(0, 50) + '...' 
                : item.answer_text;
            message += `${medal} ${item.player_name}: ${excerpt}\n`;
            message += `   ${item.reactions_count} reações\n\n`;
        });
    }
    
    // ... resto do código ...
}
}

module.exports = new StatsManager();