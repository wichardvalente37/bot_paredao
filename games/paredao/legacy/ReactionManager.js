const db = require('../database/models');

class ReactionManager {
    constructor(client) {
        this.client = client;
        this.setupReactionListener();
        console.log('✅ ReactionManager inicializado');
    }
    
    setupReactionListener() {
        this.client.on('message_reaction', async (reaction) => {
            try {
                // Ignorar se não há mensagem associada
                if (!reaction.msg) {
                    return;
                }
                
                // Buscar a mensagem original
                const message = reaction.msg;
                const chat = await message.getChat();
                
                // Só processar reações em grupos
                if (!chat.isGroup) {
                    return;
                }
                
                // Buscar se esta mensagem é uma resposta do paredão
                const questionResult = await db.client.query(
                    'SELECT id, reactions_count FROM questions WHERE message_id = $1',
                    [message.id._serialized]
                );
                
                if (questionResult.rows.length === 0) {
                    return; // Não é uma resposta do paredão
                }
                
                const questionId = questionResult.rows[0].id;
                const currentCount = questionResult.rows[0].reactions_count || 0;
                
                // WhatsApp Web.js: reaction.aggregateEmoji ou contar reações individuais
                let totalReactions = currentCount;
                
                try {
                    // Tentar buscar reações da mensagem
                    if (message.reactions && Array.isArray(message.reactions)) {
                        totalReactions = message.reactions.reduce((sum, r) => {
                            return sum + (r.count || 0);
                        }, 0);
                    } else {
                        // Fallback: incrementar/decrementar baseado no tipo de reação
                        if (reaction.reaction === '') {
                            // Reação removida
                            totalReactions = Math.max(0, currentCount - 1);
                        } else {
                            // Nova reação
                            totalReactions = currentCount + 1;
                        }
                    }
                } catch (error) {
                    console.log('❌ Erro ao contar reações:', error.message);
                    // Fallback simples
                    totalReactions = reaction.reaction === '' ? 
                        Math.max(0, currentCount - 1) : 
                        currentCount + 1;
                }
                
                // Atualizar no banco
                await db.client.query(
                    'UPDATE questions SET reactions_count = $1 WHERE id = $2',
                    [totalReactions, questionId]
                );
                
                console.log(`❤️ Reação atualizada: ${totalReactions} na pergunta ${questionId}`);
                
            } catch (error) {
                console.error('❌ Erro ao processar reação:', error.message);
            }
        });
    }
    
    async getTopReactions(gameId, playerId = null) {
        try {
            let query = `
                SELECT 
                    q.id,
                    q.question_text,
                    q.answer_text,
                    q.reactions_count,
                    p_from.name as from_player_name,
                    p_to.name as to_player_name,
                    ROW_NUMBER() OVER (ORDER BY q.reactions_count DESC) as rank
                FROM questions q
                JOIN players p_from ON q.from_player_id = p_from.id
                JOIN players p_to ON q.to_player_id = p_to.id
                WHERE q.game_id = $1 
                AND q.answer_text IS NOT NULL
                AND q.reactions_count > 0
            `;
            
            const params = [gameId];
            
            if (playerId) {
                query += ' AND q.to_player_id = $2';
                params.push(playerId);
            }
            
            query += ' ORDER BY q.reactions_count DESC LIMIT 5';
            
            const result = await db.client.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.log('Erro ao buscar top reações:', error);
            return [];
        }
    }
    
    async getReactionStats(gameId) {
        try {
            const result = await db.client.query(`
                SELECT 
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN reactions_count > 0 THEN 1 ELSE 0 END) as reacted_messages,
                    SUM(reactions_count) as total_reactions,
                    AVG(reactions_count) as avg_reactions,
                    MAX(reactions_count) as max_reactions
                FROM questions 
                WHERE game_id = $1 
                AND answer_text IS NOT NULL
            `, [gameId]);
            
            return result.rows[0] || {
                total_messages: 0,
                reacted_messages: 0,
                total_reactions: 0,
                avg_reactions: 0,
                max_reactions: 0
            };
            
        } catch (error) {
            console.log('Erro ao buscar estatísticas de reações:', error);
            return {
                total_messages: 0,
                reacted_messages: 0,
                total_reactions: 0,
                avg_reactions: 0,
                max_reactions: 0
            };
        }
    }
    
    async getMostReactedMessage(gameId) {
        try {
            const result = await db.client.query(`
                SELECT 
                    q.*,
                    p_from.name as from_player_name,
                    p_to.name as to_player_name
                FROM questions q
                JOIN players p_from ON q.from_player_id = p_from.id
                JOIN players p_to ON q.to_player_id = p_to.id
                WHERE q.game_id = $1 
                AND q.answer_text IS NOT NULL
                AND q.reactions_count > 0
                ORDER BY q.reactions_count DESC
                LIMIT 1
            `, [gameId]);
            
            return result.rows[0] || null;
            
        } catch (error) {
            console.log('Erro ao buscar mensagem mais reagida:', error);
            return null;
        }
    }
}

module.exports = ReactionManager;