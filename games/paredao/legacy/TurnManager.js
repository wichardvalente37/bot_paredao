const db = require('../database/models');
const Formatters = require('../utils/formatters');
const ContactHelper = require('../utils/contactHelper');
let contactHelper = null;
class TurnManager {
    constructor() {
        this.activeTurns = new Map(); // playerId -> turn data
        this.timerIntervals = new Map(); // groupId -> interval
    }

    async startTurn(gameId, groupId, player, client) {
        const chat = await client.getChatById(groupId);
        const playerContact = await client.getContactById(player.id);
           if (!contactHelper) {
            contactHelper = new ContactHelper(client);
        }
        
        // Buscar bio atualizada do banco
        
        
         const playerBio = await contactHelper.getContactBio(player.id);
        const playerWithBio = {
            ...player,
            bio: player.bio || playerBio || 'Sem biografia'
        };
        
        // Fechar grupo
        try {
            await chat.setMessagesAdminsOnly(true);
        } catch (error) {
            console.log('⚠️ Não foi possível fechar grupo:', error.message);
        }
        
        // Salvar backup do nome original
        await db.saveGroupBackup(gameId, groupId, chat.name);
        
        // Mudar nome do grupo
        try {
            await chat.setSubject(`${player.name} no Paredão`);
        } catch (error) {
            console.log('⚠️ Não foi possível mudar nome do grupo:', error.message);
        }
        
        // Preparar mensagem de início
        const startMessage = `@${player.name.split(' ')[0]} NO PAREDÃO\n\n${playerWithBio.bio || 'Sem biografia'}\n\nEnviem perguntas no meu DM\nResponderei aqui as respostas`;
        
        // Tentar enviar foto de perfil
        try {
            const profilePic = await playerContact.getProfilePicUrl();
            if (profilePic) {
                // Enviar foto com legenda
                await chat.sendMessage(profilePic, {
                    caption: startMessage,
                    mentions: [playerContact]
                });
                console.log(`📸 Foto enviada para ${player.name}`);
            } else {
                // Sem foto, enviar só mensagem
                await chat.sendMessage(startMessage, { mentions: [playerContact] });
                console.log(`📝 Mensagem sem foto para ${player.name}`);
            }
        } catch (error) {
            // Fallback: só mensagem
            console.log(`❌ Erro ao enviar foto: ${error.message}`);
            await chat.sendMessage(startMessage, { mentions: [playerContact] });
        }
        
        // Enviar instruções no DM do jogador
        try {
            const dmChat = await client.getChatById(player.id);
            await dmChat.sendMessage(Formatters.formatDMInstructions());
            console.log(`📨 Instruções enviadas no DM para ${player.name}`);
        } catch (error) {
            console.log(`⚠️ Não foi possível enviar DM para ${player.name}: ${error.message}`);
        }
        
        // Iniciar timer de updates
        this.startTimerUpdates(gameId, groupId, player, client);
        
        // Salvar no banco
        await db.client.query(
            'UPDATE games SET status = $1, current_player_id = $2 WHERE id = $3',
            ['active', player.id, gameId]
        );
        
        // Iniciar estatísticas do turno
        this.activeTurns.set(player.id, {
            gameId,
            groupId,
            startTime: new Date(),
            questionsReceived: 0,
            questionsAnswered: 0,
            lastActivity: new Date()
        });
        
        console.log(`🔥 Turno iniciado para ${player.name}`);
    }

    async endTurn(gameId, groupId, client) {
        const game = await db.getActiveGame(groupId);
        if (!game || !game.current_player_id) {
            console.log('❌ Nenhum turno ativo para finalizar');
            return;
        }
        
        const player = await db.getPlayer(game.current_player_id);
        if (!player) {
            console.log('❌ Jogador atual não encontrado');
            return;
        }
        
        const chat = await client.getChatById(groupId);
        
        // Parar timer
        this.stopTimerUpdates(groupId);
        
        // Abrir grupo
        try {
            await chat.setMessagesAdminsOnly(false);
            console.log(`🔓 Grupo reaberto`);
        } catch (error) {
            console.log('⚠️ Não foi possível abrir grupo:', error.message);
        }
        
        // Gerar estatísticas
        const turnData = this.activeTurns.get(player.id) || {};
        const duration = Math.floor((new Date() - turnData.startTime) / 60000);
        
        // Buscar perguntas deste turno
        const questionsResult = await db.client.query(
            `SELECT COUNT(*) as total,
                    COUNT(answer_text) as answered,
                    SUM(CASE WHEN answer_text IS NULL THEN 1 ELSE 0 END) as ignored
             FROM questions 
             WHERE game_id = $1 AND to_player_id = $2 
             AND created_at >= $3`,
            [gameId, player.id, turnData.startTime]
        );
        
        const stats = questionsResult.rows[0];
        const total = parseInt(stats.total) || 0;
        const answered = parseInt(stats.answered) || 0;
        const ignored = parseInt(stats.ignored) || 0;
        
        // Buscar mensagem mais reagida
        const topReactionResult = await db.client.query(
            `SELECT answer_text, reactions_count 
             FROM questions 
             WHERE game_id = $1 AND to_player_id = $2 
             AND answer_text IS NOT NULL AND reactions_count > 0
             ORDER BY reactions_count DESC 
             LIMIT 1`,
            [gameId, player.id]
        );
        
        // Montar mensagem de fim
        let endMessage = `📊 Turno de ${player.name} finalizado\n`;
        endMessage += `⏰ ${duration} minutos • ${total} perguntas\n`;
        endMessage += `✅ ${answered} respondidas • ❌ ${ignored} ignoradas\n`;
        
        if (topReactionResult.rows.length > 0 && topReactionResult.rows[0].reactions_count > 0) {
            const topReaction = topReactionResult.rows[0];
            const excerpt = topReaction.answer_text.length > 80 
                ? topReaction.answer_text.substring(0, 80) + '...' 
                : topReaction.answer_text;
            endMessage += `\n🔥 Mais reagida (${topReaction.reactions_count} ❤️):\n"${excerpt}"`;
        }
        
        await chat.sendMessage(endMessage);
        
        // Limpar turno ativo
        this.activeTurns.delete(player.id);
        
        // Atualizar status do jogo
        await db.client.query(
            'UPDATE games SET current_player_id = NULL WHERE id = $1',
            [gameId]
        );
        
        console.log(`📊 Turno de ${player.name} finalizado`);
    }

    startTimerUpdates(gameId, groupId, player, client) {
        // Limpar intervalo anterior se existir
        this.stopTimerUpdates(groupId);
        
        let lastUpdateMinute = 0;
        
        const interval = setInterval(async () => {
            try {
                const turnData = this.activeTurns.get(player.id);
                if (!turnData) {
                    clearInterval(interval);
                    return;
                }
                
                const elapsedMs = new Date() - turnData.startTime;
                const minutes = Math.floor(elapsedMs / 60000);
                
                // Enviar update a cada 5 minutos
                if (minutes > 0 && minutes % 5 === 0 && minutes !== lastUpdateMinute) {
                    lastUpdateMinute = minutes;
                    
                    const chat = await client.getChatById(groupId);
                    
                    // Buscar estatísticas atualizadas
                    const statsResult = await db.client.query(
                        `SELECT COUNT(*) as received,
                                COUNT(answer_text) as answered
                         FROM questions 
                         WHERE game_id = $1 AND to_player_id = $2 
                         AND created_at >= $3`,
                        [gameId, player.id, turnData.startTime]
                    );
                    
                    const stats = statsResult.rows[0];
                    const received = parseInt(stats.received) || 0;
                    const answered = parseInt(stats.answered) || 0;
                    
                    let updateMessage = `⏰ ${minutes} minutos de ${player.name} no paredão\n`;
                    updateMessage += `${received} perguntas recebidas • ${answered} respondidas\n`;
                    
                    // Status personalizado
                    if (answered === 0 && received > 0) {
                        updateMessage += `Status: Esquentando... 🔥`;
                    } else if (answered >= received / 2) {
                        updateMessage += `Status: Mandando bem! 👍`;
                    } else if (minutes > 20) {
                        updateMessage += `Status: Quase lá...`;
                    } else {
                        updateMessage += `Status: Em andamento`;
                    }
                    
                    await chat.sendMessage(updateMessage);
                    
                    console.log(`⏰ Update de ${minutes}min para ${player.name}`);
                }
                
                // Timeout automático após 45 minutos
                if (minutes >= 45) {
                    console.log(`⏰ Timeout automático para ${player.name}`);
                    await this.endTurn(gameId, groupId, client);
                    clearInterval(interval);
                }
                
            } catch (error) {
                console.error('❌ Erro no timer:', error);
            }
        }, 60000); // Verificar a cada minuto
        
        this.timerIntervals.set(groupId, interval);
        console.log(`⏱️ Timer iniciado para ${player.name}`);
    }

    stopTimerUpdates(groupId) {
        const interval = this.timerIntervals.get(groupId);
        if (interval) {
            clearInterval(interval);
            this.timerIntervals.delete(groupId);
            console.log(`⏱️ Timer parado para grupo ${groupId}`);
        }
    }

    async handleQuestion(fromPlayerId, toPlayerId, question, client, isAnonymous = true) {
        const game = await this.getPlayerActiveGame(toPlayerId);
        if (!game) {
            return { error: 'Nenhum jogo ativo para este jogador' };
        }
        
        // Verificar se o jogador está no turno atual
        if (game.current_player_id !== toPlayerId) {
            return { error: 'Não é o turno desta pessoa' };
        }
        
        // Verificar se não está enviando para si mesmo
        if (fromPlayerId === toPlayerId) {
            return { error: 'Você não pode enviar perguntas para si mesmo' };
        }
        
        // Salvar pergunta
        const questionId = await db.saveQuestion(
            game.id, 
            fromPlayerId, 
            toPlayerId, 
            question, 
            isAnonymous
        );
        
        // Enviar DM para quem está no paredão
        try {
            const dmChat = await client.getChatById(toPlayerId);
            await dmChat.sendMessage(Formatters.formatDMQuestion(question));
            console.log(`📨 Pergunta enviada para ${toPlayerId}`);
        } catch (error) {
            console.log(`❌ Erro ao enviar DM: ${error.message}`);
        }
        
        // Atualizar contador
        const turnData = this.activeTurns.get(toPlayerId);
        if (turnData) {
            turnData.questionsReceived++;
        }
        
        return { success: true, questionId };
    }

    async handleAnswer(questionId, answer, client) {
        // Buscar pergunta
        const questionResult = await db.client.query(
            `SELECT q.*, p.name as player_name, g.group_id
             FROM questions q
             JOIN players p ON q.to_player_id = p.id
             JOIN games g ON q.game_id = g.id
             WHERE q.id = $1`,
            [questionId]
        );
        
        if (questionResult.rows.length === 0) {
            return { error: 'Pergunta não encontrada' };
        }
        
        const question = questionResult.rows[0];
        
        // Verificar se já foi respondida
        if (question.answer_text) {
            return { error: 'Esta pergunta já foi respondida' };
        }
        
        // Salvar resposta
        await db.saveAnswer(questionId, answer);
        
        // Enviar para o grupo
        try {
            const chat = await client.getChatById(question.group_id);
            
            // Formatar mensagem
            const formattedAnswer = `${question.player_name}\n\n> ${question.question_text}\n\n${answer}`;
            
            const sentMessage = await chat.sendMessage(formattedAnswer);
            
            // Salvar ID da mensagem para rastrear reações
            if (sentMessage.id) {
                await db.client.query(
                    'UPDATE questions SET message_id = $1 WHERE id = $2',
                    [sentMessage.id._serialized, questionId]
                );
            }
            
            console.log(`🗣️ Resposta de ${question.player_name} enviada para o grupo`);
        } catch (error) {
            console.log(`❌ Erro ao enviar resposta: ${error.message}`);
        }
        
        // Atualizar contador e atividade
        const turnData = this.activeTurns.get(question.to_player_id);
        if (turnData) {
            turnData.questionsAnswered++;
            turnData.lastActivity = new Date();
        }
        
        return { success: true };
    }

    async getPlayerActiveGame(playerId) {
        const result = await db.client.query(`
            SELECT g.* 
            FROM games g
            JOIN game_players gp ON g.id = gp.game_id
            WHERE gp.player_id = $1 
            AND g.status = 'active'
            AND gp.status = 'active'
            LIMIT 1
        `, [playerId]);
        
        return result.rows[0];
    }
    
    async restoreGroup(gameId, groupId, client) {
        const backup = await db.client.query(
            'SELECT * FROM group_backup WHERE game_id = $1 AND group_id = $2 AND restored = false ORDER BY id DESC LIMIT 1',
            [gameId, groupId]
        );
        
        if (backup.rows.length === 0) {
            console.log(`📦 Nenhum backup encontrado para restaurar`);
            return;
        }
        
        const backupData = backup.rows[0];
        const chat = await client.getChatById(groupId);
        
        try {
            // Restaurar nome original
            if (backupData.original_name) {
                await chat.setSubject(backupData.original_name);
                console.log(`🔧 Nome restaurado: ${backupData.original_name}`);
            }
            
            // Marcar como restaurado
            await db.client.query(
                'UPDATE group_backup SET restored = true WHERE id = $1',
                [backupData.id]
            );
            
            console.log(`✅ Grupo restaurado do backup`);
        } catch (error) {
            console.log(`❌ Erro ao restaurar grupo: ${error.message}`);
        }
    }
}

module.exports = new TurnManager();