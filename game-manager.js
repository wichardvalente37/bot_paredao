const db = require('./database');

class GameManager {
  constructor(client) {
    this.client = client;
    this.timers = new Map();
    this.activeTurns = new Map();
    this.SUPREMO_ID = process.env.SUPREMO_ID || '';
    this.SUPREMO_GROUP_ID = process.env.SUPREMO_GROUP_ID || '';
    this.TURN_DURATION = 45;
    this.UPDATE_INTERVAL = 5;
  }

  validatePhoneNumber(number) {
    const clean = number.replace(/\D/g, '');
    return clean.length === 12 ? clean : null;
  }

  async createGame(groupId, gameType = 'paredao') {
    const res = await db.query(
      'INSERT INTO games(group_id, game_type) VALUES($1, $2) RETURNING id',
      [groupId, gameType]
    );
    const gameId = res.rows[0].id;
    console.log(`🎮 JOGO ${gameType.toUpperCase()} #${gameId} CRIADO!`);
    return gameId;
  }

  async getActiveGame(groupId, gameType = null) {
    const res = gameType
      ? await db.query(
          'SELECT * FROM games WHERE group_id = $1 AND game_type = $2 AND status != $3 ORDER BY id DESC LIMIT 1',
          [groupId, gameType, 'finished']
        )
      : await db.query(
          'SELECT * FROM games WHERE group_id = $1 AND status != $2 ORDER BY id DESC LIMIT 1',
          [groupId, 'finished']
        );
    return res.rows[0];
  }

  async registerPlayer(gameId, groupUserId, phoneNumber, playerName = null) {
    const isSupremo = (groupUserId === this.SUPREMO_GROUP_ID) || 
                     (groupUserId === this.SUPREMO_ID) ||
                     (groupUserId.endsWith('@lid') && 
                      groupUserId.replace('@lid', '@c.us') === this.SUPREMO_ID);

    if (isSupremo) {
      const dmUserId = this.SUPREMO_ID;
      const groupId = this.SUPREMO_GROUP_ID || groupUserId;
      const name = '👑 SUPREMO';
      
      await db.registerPlayerWithManualInfo(groupId, dmUserId, name, true);
      
      const players = await db.getGamePlayers(gameId);
      const nextOrder = players.length + 1;
      await db.addPlayerToGame(gameId, groupId, nextOrder);
      
      console.log(`👑 ${name} entrou automaticamente! Ordem: ${nextOrder}`);
      return {
        playerId: groupId,
        dmId: dmUserId,
        name: name,
        order: nextOrder
      };
    }
    
    const cleanNumber = this.validatePhoneNumber(phoneNumber);
    if (!cleanNumber) {
      throw new Error('Número inválido! Use 12 dígitos (ex: 258866630883)');
    }
    
    if (!playerName || playerName.trim().length < 2) {
      throw new Error('Digite seu nome após o número!\nExemplo: !entrar 258866630883 João');
    }
    
    const dmUserId = `${cleanNumber}@c.us`;
    const name = playerName.trim();
    
    await db.registerPlayerWithManualInfo(groupUserId, dmUserId, name, false);
    
    const players = await db.getGamePlayers(gameId);
    const nextOrder = players.length + 1;
    await db.addPlayerToGame(gameId, groupUserId, nextOrder);
    
    console.log(`👤 ${name} entrou! Número: ${cleanNumber}, Ordem: ${nextOrder}`);
    
    return {
      playerId: groupUserId,
      dmId: dmUserId,
      name: name,
      order: nextOrder
    };
  }

  async forceAddPlayer(gameId, groupUserId, name = 'Jogador') {
    await db.query(`
      INSERT INTO players(id, name) 
      VALUES($1, $2)
      ON CONFLICT (id) DO UPDATE SET name = $2
    `, [groupUserId, name]);
    
    const players = await db.getGamePlayers(gameId);
    const nextOrder = players.length + 1;
    await db.addPlayerToGame(gameId, groupUserId, nextOrder);
    
    return { playerId: groupUserId, name, order: nextOrder };
  }

  async removePlayer(gameId, playerId) {
    await db.removePlayerFromGame(gameId, playerId);
    
    const players = await db.getGamePlayers(gameId);
    for (let i = 0; i < players.length; i++) {
      await db.addPlayerToGame(gameId, players[i].id, i + 1);
    }
  }

  async shufflePlayers(gameId) {
    const players = await db.getGamePlayers(gameId);
    
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
    
    for (let i = 0; i < players.length; i++) {
      await db.addPlayerToGame(gameId, players[i].id, i + 1);
    }
    
    console.log(`🎲 Jogo ${gameId} embaralhado!`);
    return players;
  }

  async startTurn(gameId, groupId, player) {
    console.log(`🎤 TURNO INICIADO: ${player.name} (${player.id})`);
    
    // Verificar se já existe um turno ativo
    const currentGame = await this.getActiveGame(groupId);
    if (currentGame && currentGame.current_player_id) {
      console.log(`❌ Já existe um turno ativo para ${currentGame.current_player_id}`);
      return { error: 'Já existe um turno ativo. Encerre-o primeiro com !encerrarturno' };
    }
    
    try {
      const chat = await this.client.getChatById(groupId);
      const originalName = chat.name;
      
      await db.backupGroupName(gameId, groupId, originalName);
      await chat.setMessagesAdminsOnly(true);
      await chat.setSubject(`${player.name} no Paredão`);
      
      console.log(`🔒 Grupo: "${player.name} no Paredão" (Original: "${originalName}")`);
      
    } catch (error) {
      console.error('❌ Erro ao configurar grupo:', error.message);
    }
    
    await db.updateGameStatus(gameId, 'active', player.id);
    await db.startTurn(gameId, player.id);
    
    await this.announcePlayerTurn(groupId, player);
    await this.sendTurnInstructions(player);
    await this.notifyAllPlayers(gameId, player, 'turn_started');
    
    this.startTurnTimer(gameId, groupId, player);
    
    this.activeTurns.set(player.id, {
      gameId, groupId, player,
      startTime: Date.now(),
      questionsReceived: 0,
      questionsAnswered: 0,
      isActive: true
    });
    
    return { success: true, player };
  }

  // ✅ NOVO: Obter contato para menção
  async getContactForMention(playerId) {
    try {
      return await this.client.getContactById(playerId);
    } catch (error) {
      console.log(`⚠️ Não consegui obter contato para ${playerId}`);
      return null;
    }
  }

  async announcePlayerTurn(groupId, player) {
    try {
      const chat = await this.client.getChatById(groupId);
      const contact = await this.getContactForMention(player.id);
      
      let announcement = `🎤 *${player.name.toUpperCase()} NO PAREDÃO* 🎤\n\n`;
      
      // Adicionar menção se conseguir obter o contato
      if (contact) {
        announcement += `@${player.name.split(' ')[0]} é a sua vez! 🎯\n\n`;
      }
      
      announcement += `📝 *COMO FUNCIONA:*\n` +
        `• Manda perguntas no meu PRIVADO\n` +
        `• Comece com # pra revelar seu nome\n` +
        `• Exemplo: "#Qual seu maior medo?"\n\n` +
        `⏰ *Duração:* ${this.TURN_DURATION} minutos\n` +
        `🔄 *Atualizações:* A cada ${this.UPDATE_INTERVAL} minutos\n\n` +
        `🎯 *VAI COM TUDO!*`;
      
      // Enviar com menção se tiver contato
      if (contact) {
        await chat.sendMessage(announcement, { mentions: [player.id] });
      } else {
        await chat.sendMessage(announcement);
      }
      
    } catch (error) {
      console.error('❌ Erro ao anunciar turno:', error.message);
    }
  }

  async sendTurnInstructions(player) {
    try {
      let dmChat = null;
      if (player.dm_id) {
        try {
          dmChat = await this.client.getChatById(player.dm_id);
        } catch (dmError) {
          console.log(`⚠️ Não consegui DM para ${player.dm_id}`);
        }
      }
      
      if (!dmChat) {
        try {
          dmChat = await this.client.getChatById(player.id);
        } catch (groupDmError) {
          console.log(`⚠️ Não consegui DM para ${player.name}`);
          return;
        }
      }
      
      const instructions = `🎤 *SEU TURNO NO PAREDÃO!* 🎤\n\n` +
        `✅ *Você está no paredão agora!*\n\n` +
        `📨 *Você receberá perguntas aqui*\n` +
        `• Anônimas: 🎭\n` +
        `• Identificadas: 👤\n\n` +
        `💬 *PARA RESPONDER:*\n` +
        `1. Use "Responder" no WhatsApp\n` +
        `2. Selecione a pergunta\n` +
        `3. Digite e envie\n\n` +
        `📤 *Resposta vai pro grupo automaticamente*\n\n` +
        `⏰ *Duração:* ${this.TURN_DURATION} minutos\n` +
        `🔄 *Atualizações:* ${this.UPDATE_INTERVAL} em ${this.UPDATE_INTERVAL} min\n\n` +
        `🔥 *BOA SORTE!*`;
      
      await dmChat.sendMessage(instructions);
      console.log(`📨 Instruções enviadas para ${player.name}`);
      
    } catch (error) {
      console.error('❌ Erro nas instruções:', error.message);
    }
  }

  async notifyAllPlayers(gameId, currentPlayer, type) {
    try {
      const players = await db.getGamePlayers(gameId);
      
      for (const player of players) {
        if (player.id === currentPlayer.id) continue;
          
        try {
          let dmChat = null;
          if (player.dm_id) {
            try {
              dmChat = await this.client.getChatById(player.dm_id);
            } catch (e) {}
          }
          
          if (!dmChat) {
            try {
              dmChat = await this.client.getChatById(player.id);
            } catch (e) {
              continue;
            }
          }
          
          if (type === 'turn_started') {
            await dmChat.sendMessage(
              `🔄 *NOVO TURNO INICIADO*\n\n` +
              `🎤 ${currentPlayer.name} está no paredão agora!\n` +
              `⏰ O turno dura ${this.TURN_DURATION} minutos\n\n` +
              `💬 Envie perguntas aqui!`
            );
          } else if (type === 'turn_ended') {
            await dmChat.sendMessage(
              `✅ *TURNO ENCERRADO*\n\n` +
              `🎤 O turno de ${currentPlayer.name} terminou!\n` +
              `📊 Vá para o grupo para ver os resultados\n\n` +
              `🔄 Próximo turno começará em breve`
            );
          }
        } catch (error) {
          console.log(`⚠️ Não pude notificar ${player.name}`);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao notificar jogadores:', error.message);
    }
  }

  startTurnTimer(gameId, groupId, player) {
    this.stopTurnTimer(groupId);
    
    let minutes = 0;
    const interval = setInterval(async () => {
      minutes++;
      
      if (minutes % this.UPDATE_INTERVAL === 0) {
        await this.sendTurnUpdate(groupId, player, minutes);
      }
      
      if (minutes >= this.TURN_DURATION) {
        console.log(`⏰ Turno automático encerrado para ${player.name}`);
        await this.endTurn(gameId, groupId);
        this.stopTurnTimer(groupId);
      }
    }, 60000);
    
    this.timers.set(groupId, interval);
    console.log(`⏰ Timer iniciado para ${player.name}`);
  }

  stopTurnTimer(groupId) {
    const timer = this.timers.get(groupId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(groupId);
    }
  }

  async sendTurnUpdate(groupId, player, minutesElapsed) {
    try {
      const chat = await this.client.getChatById(groupId);
      const turnData = this.activeTurns.get(player.id) || { questionsReceived: 0, questionsAnswered: 0 };
      
      const update = `🔄 *ATUALIZAÇÃO* (${minutesElapsed}/${this.TURN_DURATION}min)\n\n` +
        `🎤 *${player.name} no Paredão*\n` +
        `📨 Perguntas: ${turnData.questionsReceived}\n` +
        `✅ Respondidas: ${turnData.questionsAnswered}\n` +
        `⏰ Restante: ${this.TURN_DURATION - minutesElapsed} min\n\n` +
        `💬 *Continuem mandando perguntas!*`;
      
      await chat.sendMessage(update);
      
    } catch (error) {
      console.error('❌ Erro na atualização:', error.message);
    }
  }

  async endTurn(gameId, groupId) {
    const game = await db.query('SELECT current_player_id FROM games WHERE id = $1', [gameId]);
    const playerId = game.rows[0]?.current_player_id;
    
    if (!playerId) {
      console.log('⚠️ Nenhum turno ativo para encerrar');
      return null;
    }
    
    this.stopTurnTimer(groupId);
    
    const originalName = await db.restoreGroupName(gameId, groupId);
    if (originalName) {
      try {
        const chat = await this.client.getChatById(groupId);
        await chat.setSubject(originalName);
        await chat.setMessagesAdminsOnly(false);
        console.log(`🔓 Grupo reaberto: "${originalName}"`);
      } catch (error) {
        console.error('❌ Erro ao restaurar grupo:', error.message);
      }
    } else {
      try {
        const chat = await this.client.getChatById(groupId);
        await chat.setMessagesAdminsOnly(false);
      } catch (error) {
        console.error('❌ Erro ao reabrir grupo:', error.message);
      }
    }
    
    const stats = await this.calculateTurnStats(gameId, playerId);
    await db.endTurn(gameId, playerId, stats);
    
    await db.updateGameStatus(gameId, 'waiting', null);
    
    const player = await db.findPlayerByGroupId(playerId);
    if (player) {
      await this.notifyPlayerTurnEnded(player, stats);
      await this.notifyAllPlayers(gameId, player, 'turn_ended');
    }
    
    this.activeTurns.delete(playerId);
    
    // ✅ NOVO: Obter próximo jogador antes de anunciar
    const nextPlayerInfo = await this.getNextPlayerInfo(gameId, playerId);
    
    await this.announceTurnStats(groupId, player, stats, nextPlayerInfo);
    
    console.log(`✅ Turno finalizado para ${playerId}`);
    
    return { player, stats, nextPlayer: nextPlayerInfo.player };
  }

  // ✅ NOVO: Método para obter informações do próximo jogador
  async getNextPlayerInfo(gameId, currentPlayerId) {
    const players = await db.getGamePlayers(gameId);
    if (players.length === 0) {
      return { player: null, isLast: true, totalPlayers: 0 };
    }
    
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const isLast = currentIndex === players.length - 1;
    
    if (isLast) {
      return { player: null, isLast: true, totalPlayers: players.length };
    }
    
    const nextPlayer = players[currentIndex + 1];
    return { player: nextPlayer, isLast: false, totalPlayers: players.length };
  }

  async notifyPlayerTurnEnded(player, stats) {
    try {
      let dmChat = null;
      if (player.dm_id) {
        try {
          dmChat = await this.client.getChatById(player.dm_id);
        } catch (e) {}
      }
      
      if (!dmChat) {
        try {
          dmChat = await this.client.getChatById(player.id);
        } catch (e) {
          return;
        }
      }
      
      await dmChat.sendMessage(
        `✅ *SEU TURNO TERMINOU!*\n\n` +
        `📊 *Resultados:*\n` +
        `⏰ Duração: ${stats.duration} minutos\n` +
        `📨 Perguntas recebidas: ${stats.total}\n` +
        `✅ Respondidas: ${stats.answered}\n` +
        `❌ Ignoradas: ${stats.ignored}\n\n` +
        `🏃 *Vá para o grupo para ver todas as estatísticas!*`
      );
    } catch (error) {
      console.log(`⚠️ Não pude notificar ${player.name} sobre fim do turno`);
    }
  }

  // ✅ ATUALIZADO: Método para anunciar estatísticas com perguntas ignoradas
  async announceTurnStats(groupId, player, stats, nextPlayerInfo) {
    try {
      const chat = await this.client.getChatById(groupId);
      
      // ✅ NOVO: Obter perguntas ignoradas
      const ignoredQuestions = await this.getIgnoredQuestions(player.id);
      
      let announcement = `📊 *TURNO ENCERRADO* 📊\n\n`;
      
      // Adicionar menção ao jogador atual
      const playerContact = await this.getContactForMention(player.id);
      if (playerContact) {
        announcement += `🎤 *@${player.name.split(' ')[0]}*\n`;
      } else {
        announcement += `🎤 *${player.name}*\n`;
      }
      
      announcement += 
        `⏰ Duração: ${stats.duration} minutos\n` +
        `📨 Perguntas recebidas: ${stats.total}\n` +
        `✅ Respondidas: ${stats.answered}\n` +
        `❌ Ignoradas: ${stats.ignored}\n\n`;
      
      // ✅ NOVO: Mostrar perguntas ignoradas se houver
      if (ignoredQuestions.length > 0) {
        announcement += `📝 *Perguntas não respondidas:*\n`;
        ignoredQuestions.forEach((q, index) => {
          const sender = q.is_anonymous ? '🎭 Anônimo' : `👤 ${q.sender_name || 'Alguém'}`;
          announcement += `${index + 1}. "${q.question_text}" (${sender})\n`;
        });
        announcement += `\n`;
      }
      
      // ✅ NOVO: Informar sobre próximo turno
      if (nextPlayerInfo.isLast) {
        announcement += `🎉 *ÚLTIMO TURNO CONCLUÍDO!*\n` +
          `🏁 Esta foi a última pessoa do paredão!\n` 
      } else if (nextPlayerInfo.player) {
        announcement += `🔄 *PRÓXIMO TURNO:* ${nextPlayerInfo.player.name}\n`;
        
        // Adicionar menção ao próximo jogador
        const nextContact = await this.getContactForMention(nextPlayerInfo.player.id);
        if (nextContact) {
          announcement += `@${nextPlayerInfo.player.name.split(' ')[0]}, prepare-se! 🎤\n`;
        }
        
      
      } else {
        announcement += `🔄 *HORA DOS COMENTÁRIOS!*`;
      }
      
      // Preparar menções
      const mentions = [];
      if (playerContact) mentions.push(player.id);
      if (nextPlayerInfo.player) {
        const nextContact = await this.getContactForMention(nextPlayerInfo.player.id);
        if (nextContact) mentions.push(nextPlayerInfo.player.id);
      }
      
      // Enviar mensagem com menções se houver
      if (mentions.length > 0) {
        await chat.sendMessage(announcement, { mentions });
      } else {
        await chat.sendMessage(announcement);
      }
      
    } catch (error) {
      console.error('❌ Erro ao anunciar estatísticas:', error.message);
    }
  }

  // ✅ NOVO: Método para obter perguntas ignoradas
  async getIgnoredQuestions(playerId) {
    try {
      const res = await db.query(`
        SELECT 
          q.question_text,
          q.is_anonymous,
          p.name as sender_name
        FROM questions q
        LEFT JOIN players p ON q.from_player_id = p.id
        WHERE q.to_player_id = $1 
          AND q.answer_text IS NULL
          AND q.created_at >= NOW() - INTERVAL '1 hour'
        ORDER BY q.created_at
        LIMIT 10
      `, [playerId]);
      
      return res.rows;
    } catch (error) {
      console.error('❌ Erro ao obter perguntas ignoradas:', error.message);
      return [];
    }
  }

  async nextTurn(gameId, groupId) {
    // Verificar se há turno ativo
    const game = await this.getActiveGame(groupId);
    if (game && game.current_player_id) {
      console.log('❌ nextTurn bloqueado: há turno ativo');
      return { error: 'Já existe um turno ativo. Use !encerrarturno primeiro.' };
    }
    
    // Obter todos os jogadores
    const players = await db.getGamePlayers(gameId);
    if (players.length === 0) {
      console.log('❌ Nenhum jogador no jogo');
      return { error: 'Nenhum jogador no jogo' };
    }
    
    // Determinar próximo jogador
    let nextPlayer;
    const lastTurn = await db.query(`
      SELECT player_id FROM turns 
      WHERE game_id = $1 
      ORDER BY id DESC LIMIT 1
    `, [gameId]);
    
    if (lastTurn.rows.length > 0) {
      // Encontrar índice do último jogador
      const lastPlayerId = lastTurn.rows[0].player_id;
      const lastIndex = players.findIndex(p => p.id === lastPlayerId);
      
      if (lastIndex === -1 || lastIndex === players.length - 1) {
        // Último jogador não encontrou ou era o último da lista
        nextPlayer = players[0];
      } else {
        // Próximo jogador na lista
        nextPlayer = players[lastIndex + 1];
      }
    } else {
      // Primeiro turno do jogo
      nextPlayer = players[0];
    }
    
    if (!nextPlayer) {
      console.log('❌ Não foi possível determinar próximo jogador');
      return { error: 'Não foi possível determinar próximo jogador' };
    }
    
    console.log(`⏭️ Próximo turno: ${nextPlayer.name}`);
    return await this.startTurn(gameId, groupId, nextPlayer);
  }

  async skipTurn(gameId, groupId) {
    // Primeiro encerrar o turno atual se existir
    const game = await this.getActiveGame(groupId);
    if (game && game.current_player_id) {
      console.log(`⏩ Skipping turno atual...`);
      await this.endTurn(gameId, groupId);
    }
    
    // Pequena pausa para garantir que tudo foi atualizado
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Agora iniciar próximo turno
    return await this.nextTurn(gameId, groupId);
  }

  async calculateTurnStats(gameId, playerId) {
    const res = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(answer_text) as answered
      FROM questions 
      WHERE game_id = $1 AND to_player_id = $2
        AND created_at >= (SELECT start_time FROM turns WHERE game_id = $1 AND player_id = $2 ORDER BY id DESC LIMIT 1)
    `, [gameId, playerId]);
    
    const stats = res.rows[0];
    
    const turnRes = await db.query(`
      SELECT EXTRACT(EPOCH FROM (NOW() - start_time))/60 as duration
      FROM turns 
      WHERE game_id = $1 AND player_id = $2 AND end_time IS NULL
      LIMIT 1
    `, [gameId, playerId]);
    
    const duration = Math.round(turnRes.rows[0]?.duration || 0);
    
    return {
      total: parseInt(stats.total) || 0,
      answered: parseInt(stats.answered) || 0,
      ignored: (parseInt(stats.total) || 0) - (parseInt(stats.answered) || 0),
      duration
    };
  }

  async receiveQuestion(fromId, groupId, text) {
    console.log(`📨 Tentativa de pergunta de ${fromId}`);
    
    const game = await this.getActiveGame(groupId);
    if (!game || game.status !== 'active') {
      return { error: '❌ Nenhum turno ativo no momento. Aguarde um turno começar.' };
    }
    
    const toId = game.current_player_id;
    if (!toId) {
      return { error: '❌ Nenhum jogador no paredão agora.' };
    }
    
    // Verificar se o turno ainda está ativo (no mapa local)
    if (!this.activeTurns.has(toId)) {
      return { error: '❌ O turno atual já foi encerrado. Aguarde o próximo turno.' };
    }
    
    const fromPlayer = await db.findPlayerByAnyId(fromId);
    const toPlayer = await db.findPlayerByGroupId(toId);
    
    if (fromPlayer && toPlayer && fromPlayer.id === toPlayer.id) {
      return { error: '❌ Você não pode enviar perguntas para si mesmo!' };
    }
    
    const isRevealed = text.trim().startsWith('#');
    const questionText = isRevealed ? text.trim().substring(1).trim() : text.trim();
    
    if (!questionText) {
      return { error: '❌ Pergunta vazia!' };
    }
    
    const questionId = await db.saveQuestion(
      game.id, fromId, toId, questionText, !isRevealed, null
    );
    
    try {
      let dmChat = null;
      if (toPlayer?.dm_id) {
        try {
          dmChat = await this.client.getChatById(toPlayer.dm_id);
        } catch (dmError) {
          console.log(`⚠️ DM ${toPlayer.dm_id} falhou`);
        }
      }
      
      if (!dmChat) {
        try {
          dmChat = await this.client.getChatById(toId);
        } catch (groupDmError) {
          console.log(`⚠️ Não consegui DM para ${toId}`);
          return { error: '❌ Não consegui enviar pergunta' };
        }
      }
      
      const senderEmoji = isRevealed ? '👤' : '🎭';
      const senderInfo = isRevealed ? 
        (fromPlayer?.name || 'Alguém') : 
        'Anônimo';
      
      const questionMessage = `${senderEmoji} ${senderInfo}\n\n` +
        `${questionText}`;
      
      const sentMsg = await dmChat.sendMessage(questionMessage);
      
      if (sentMsg?.id?._serialized) {
        await db.query(
          'UPDATE questions SET dm_message_id = $1 WHERE id = $2',
          [sentMsg.id._serialized, questionId]
        );
      }
      
      const turnData = this.activeTurns.get(toId);
      if (turnData) {
        turnData.questionsReceived++;
      }
      
      console.log(`📨 Pergunta ${questionId} enviada para ${toPlayer?.name || toId}`);
      
      return { success: true, questionId, anonymous: !isRevealed };
      
    } catch (error) {
      console.error('❌ Erro ao enviar pergunta:', error.message);
      return { error: '❌ Falha ao enviar pergunta' };
    }
  }

  async processAnswer(fromId, quotedMsgId, answerText) {
    console.log(`💬 Tentativa de resposta de ${fromId}`);
    
    const question = await db.getQuestionByDmMessageId(quotedMsgId);
    if (!question) {
      try {
        const dmChat = await this.client.getChatById(fromId);
        await dmChat.sendMessage(
          `ℹ️ *PARA RESPONDER A UMA PERGUNTA:*\n\n` +
          `1. Toque e segure na pergunta\n` +
          `2. Selecione "Responder"\n` +
          `3. Digite sua resposta\n` +
          `4. Envie\n\n` +
          `📤 *Sua resposta será publicada automaticamente no grupo*`
        );
      } catch (error) {
        console.log('⚠️ Não pude enviar instruções');
      }
      return { error: 'Para responder, use a função "Responder" do WhatsApp na pergunta específica.' };
    }
    
    // VERIFICAÇÃO CRÍTICA: Turno ainda está ativo?
    const game = await db.query('SELECT current_player_id FROM games WHERE id = $1', [question.game_id]);
    const currentPlayerId = game.rows[0]?.current_player_id;
    
    if (!currentPlayerId) {
      return { error: '❌ Este turno já foi encerrado. Não é possível responder mais perguntas.' };
    }
    
    // Verificar se a pergunta é para o jogador atual no paredão
    if (question.to_player_id !== currentPlayerId) {
      return { error: '❌ Esta pergunta não é do turno atual. Aguarde seu turno.' };
    }
    
    const player = await db.findPlayerByAnyId(fromId);
    if (!player || player.id !== question.to_player_id) {
      return { error: '❌ Esta pergunta não é para você.' };
    }
    
    if (question.answer_text) {
      return { error: '❌ Esta pergunta já foi respondida.' };
    }
    
    await db.saveAnswer(question.id, answerText);
    
    const success = await this.publishAnswerToGroup(question, answerText);
    
    if (success) {
      const turnData = this.activeTurns.get(player.id);
      if (turnData) {
        turnData.questionsAnswered++;
      }
      
      console.log(`✅ Resposta publicada para pergunta ${question.id}`);
      
      return { success: true, questionId: question.id };
    } else {
      return { error: '❌ Falha ao publicar resposta no grupo.' };
    }
  }

  async publishAnswerToGroup(question, answerText) {
    try {
      const game = await db.query('SELECT group_id FROM games WHERE id = $1', [question.game_id]);
      if (!game.rows[0]) return false;
      
      const groupId = game.rows[0].group_id;
      const player = await db.findPlayerByGroupId(question.to_player_id);
      
      const formattedMessage = `🎤 *${player?.name || 'Jogador'} responde:*\n\n` +
        `> ${question.question_text}\n\n` +
        `${answerText}`;
      
      const groupChat = await this.client.getChatById(groupId);
      const sentMsg = await groupChat.sendMessage(formattedMessage);
      
      if (sentMsg?.id?._serialized) {
        await db.query(
          'UPDATE questions SET group_message_id = $1 WHERE id = $2',
          [sentMsg.id._serialized, question.id]
        );
      }
      
      return true;
      
    } catch (error) {
      console.error('❌ Erro ao publicar resposta:', error.message);
      return false;
    }
  }

  async isAdmin(playerId) {
    return await db.isAdmin(playerId);
  }

  async isSupremo(playerId) {
    const player = await db.findPlayerByAnyId(playerId);
    if (!player) return false;
    
    return player.id === this.SUPREMO_GROUP_ID || 
           player.dm_id === this.SUPREMO_ID ||
           (player.id.endsWith('@lid') && 
            player.id.replace('@lid', '@c.us') === this.SUPREMO_ID);
  }

  async getPlayerOrder(gameId, playerId) {
    const players = await db.getGamePlayers(gameId);
    const player = await db.findPlayerByAnyId(playerId);
    
    if (!player) return null;
    
    const idx = players.findIndex(p => p.id === player.id);
    return idx !== -1 ? { position: idx + 1, total: players.length } : null;
  }

  async getGameStatus(gameId) {
    const game = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (!game.rows[0]) return null;
    
    const players = await db.getGamePlayers(gameId);
    const currentPlayer = game.rows[0].current_player_id 
      ? await db.findPlayerByGroupId(game.rows[0].current_player_id)
      : null;
    
    // ✅ CORREÇÃO: Usar status correto do banco
    const status = game.rows[0].status;
    const statusText = status === 'active' ? '🎤 Em andamento' : 
                      status === 'waiting' ? '🕒 Aguardando' : 
                      '🏁 Finalizado';
    
    return {
      game: game.rows[0],
      players,
      currentPlayer,
      totalPlayers: players.length,
      statusText: statusText
    };
  }

  async finishGame(gameId, groupId) {
    const game = await this.getActiveGame(groupId);
    if (game && game.current_player_id) {
      await this.endTurn(gameId, groupId);
    }
    
    await db.updateGameStatus(gameId, 'finished', null);
    
    this.stopTurnTimer(groupId);
    
    const originalName = await db.restoreGroupName(gameId, groupId);
    if (originalName) {
      try {
        const chat = await this.client.getChatById(groupId);
        await chat.setSubject(originalName);
        console.log(`🔤 Nome restaurado ao finalizar: "${originalName}"`);
      } catch (error) {
        console.error('❌ Erro ao restaurar nome:', error.message);
      }
    }
    
    console.log(`🏁 Jogo ${gameId} finalizado`);
  }
}

module.exports = GameManager;


// const db = require('./database');

// class GameManager {
//   constructor(client) {
//     this.client = client;
//     this.timers = new Map();
//     this.activeTurns = new Map();
//     this.SUPREMO_ID = process.env.SUPREMO_ID || '';
//     this.SUPREMO_GROUP_ID = process.env.SUPREMO_GROUP_ID || '';
//     this.TURN_DURATION = 45;
//     this.UPDATE_INTERVAL = 5;
//   }

//   validatePhoneNumber(number) {
//     const clean = number.replace(/\D/g, '');
//     return clean.length === 12 ? clean : null;
//   }

//   async createGame(groupId) {
//     const res = await db.query(
//       'INSERT INTO games(group_id) VALUES($1) RETURNING id',
//       [groupId]
//     );
//     const gameId = res.rows[0].id;
//     console.log(`🎮 JOGO ${gameType.toUpperCase()} #${gameId} CRIADO!`);
//     return gameId;
//   }

//   async getActiveGame(groupId) {
//     const res = await db.query(
//       'SELECT * FROM games WHERE group_id = $1 AND status != $2 ORDER BY id DESC LIMIT 1',
//       [groupId, 'finished']
//     );
//     return res.rows[0];
//   }

//   async registerPlayer(gameId, groupUserId, phoneNumber, playerName = null) {
//     const isSupremo = (groupUserId === this.SUPREMO_GROUP_ID) || 
//                      (groupUserId === this.SUPREMO_ID) ||
//                      (groupUserId.endsWith('@lid') && 
//                       groupUserId.replace('@lid', '@c.us') === this.SUPREMO_ID);

//     if (isSupremo) {
//       const dmUserId = this.SUPREMO_ID;
//       const groupId = this.SUPREMO_GROUP_ID || groupUserId;
//       const name = '👑 SUPREMO';
      
//       await db.registerPlayerWithManualInfo(groupId, dmUserId, name, true);
      
//       const players = await db.getGamePlayers(gameId);
//       const nextOrder = players.length + 1;
//       await db.addPlayerToGame(gameId, groupId, nextOrder);
      
//       console.log(`👑 ${name} entrou automaticamente! Ordem: ${nextOrder}`);
//       return {
//         playerId: groupId,
//         dmId: dmUserId,
//         name: name,
//         order: nextOrder
//       };
//     }
    
//     const cleanNumber = this.validatePhoneNumber(phoneNumber);
//     if (!cleanNumber) {
//       throw new Error('Número inválido! Use 12 dígitos (ex: 258866630883)');
//     }
    
//     if (!playerName || playerName.trim().length < 2) {
//       throw new Error('Digite seu nome após o número!\nExemplo: !entrar 258866630883 João');
//     }
    
//     const dmUserId = `${cleanNumber}@c.us`;
//     const name = playerName.trim();
    
//     await db.registerPlayerWithManualInfo(groupUserId, dmUserId, name, false);
    
//     const players = await db.getGamePlayers(gameId);
//     const nextOrder = players.length + 1;
//     await db.addPlayerToGame(gameId, groupUserId, nextOrder);
    
//     console.log(`👤 ${name} entrou! Número: ${cleanNumber}, Ordem: ${nextOrder}`);
    
//     return {
//       playerId: groupUserId,
//       dmId: dmUserId,
//       name: name,
//       order: nextOrder
//     };
//   }

//   async forceAddPlayer(gameId, groupUserId, name = 'Jogador') {
//     await db.query(`
//       INSERT INTO players(id, name) 
//       VALUES($1, $2)
//       ON CONFLICT (id) DO UPDATE SET name = $2
//     `, [groupUserId, name]);
    
//     const players = await db.getGamePlayers(gameId);
//     const nextOrder = players.length + 1;
//     await db.addPlayerToGame(gameId, groupUserId, nextOrder);
    
//     return { playerId: groupUserId, name, order: nextOrder };
//   }

//   async removePlayer(gameId, playerId) {
//     await db.removePlayerFromGame(gameId, playerId);
    
//     const players = await db.getGamePlayers(gameId);
//     for (let i = 0; i < players.length; i++) {
//       await db.addPlayerToGame(gameId, players[i].id, i + 1);
//     }
//   }

//   async shufflePlayers(gameId) {
//     const players = await db.getGamePlayers(gameId);
    
//     for (let i = players.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [players[i], players[j]] = [players[j], players[i]];
//     }
    
//     for (let i = 0; i < players.length; i++) {
//       await db.addPlayerToGame(gameId, players[i].id, i + 1);
//     }
    
//     console.log(`🎲 Jogo ${gameId} embaralhado!`);
//     return players;
//   }

//   async startTurn(gameId, groupId, player) {
//     console.log(`🎤 TURNO INICIADO: ${player.name} (${player.id})`);
    
//     // Verificar se já existe um turno ativo
//     const currentGame = await this.getActiveGame(groupId);
//     if (currentGame && currentGame.current_player_id) {
//       console.log(`❌ Já existe um turno ativo para ${currentGame.current_player_id}`);
//       return { error: 'Já existe um turno ativo. Encerre-o primeiro com !encerrarturno' };
//     }
    
//     try {
//       const chat = await this.client.getChatById(groupId);
//       const originalName = chat.name;
      
//       await db.backupGroupName(gameId, groupId, originalName);
//       await chat.setMessagesAdminsOnly(true);
//       await chat.setSubject(`${player.name} no Paredão`);
      
//       console.log(`🔒 Grupo: "${player.name} no Paredão" (Original: "${originalName}")`);
      
//     } catch (error) {
//       console.error('❌ Erro ao configurar grupo:', error.message);
//     }
    
//     await db.updateGameStatus(gameId, 'active', player.id);
//     await db.startTurn(gameId, player.id);
    
//     await this.announcePlayerTurn(groupId, player);
//     await this.sendTurnInstructions(player);
//     await this.notifyAllPlayers(gameId, player, 'turn_started');
    
//     this.startTurnTimer(gameId, groupId, player);
    
//     this.activeTurns.set(player.id, {
//       gameId, groupId, player,
//       startTime: Date.now(),
//       questionsReceived: 0,
//       questionsAnswered: 0,
//       isActive: true
//     });
    
//     return { success: true, player };
//   }

//   async announcePlayerTurn(groupId, player) {
//     try {
//       const chat = await this.client.getChatById(groupId);
      
//       const announcement = `🎤 *${player.name.toUpperCase()} NO PAREDÃO* 🎤\n\n` +
//         `📝 *COMO FUNCIONA:*\n` +
//         `• Manda perguntas no meu PRIVADO\n` +
//         `• Comece com # pra revelar seu nome\n` +
//         `• Exemplo: "#Qual seu maior medo?"\n\n` +
//         `⏰ *Duração:* ${this.TURN_DURATION} minutos\n` +
//         `🔄 *Atualizações:* A cada ${this.UPDATE_INTERVAL} minutos\n\n` +
//         `🎯 *VAI COM TUDO!*`;
      
//       await chat.sendMessage(announcement);
      
//     } catch (error) {
//       console.error('❌ Erro ao anunciar turno:', error.message);
//     }
//   }

//   async sendTurnInstructions(player) {
//     try {
//       let dmChat = null;
//       if (player.dm_id) {
//         try {
//           dmChat = await this.client.getChatById(player.dm_id);
//         } catch (dmError) {
//           console.log(`⚠️ Não consegui DM para ${player.dm_id}`);
//         }
//       }
      
//       if (!dmChat) {
//         try {
//           dmChat = await this.client.getChatById(player.id);
//         } catch (groupDmError) {
//           console.log(`⚠️ Não consegui DM para ${player.name}`);
//           return;
//         }
//       }
      
//       const instructions = `🎤 *SEU TURNO NO PAREDÃO!* 🎤\n\n` +
//         `✅ *Você está no paredão agora!*\n\n` +
//         `📨 *Você receberá perguntas aqui*\n` +
//         `• Anônimas: 🎭\n` +
//         `• Identificadas: 👤\n\n` +
//         `💬 *PARA RESPONDER:*\n` +
//         `1. Use "Responder" no WhatsApp\n` +
//         `2. Selecione a pergunta\n` +
//         `3. Digite e envie\n\n` +
//         `📤 *Resposta vai pro grupo automaticamente*\n\n` +
//         `⏰ *Duração:* ${this.TURN_DURATION} minutos\n` +
//         `🔄 *Atualizações:* ${this.UPDATE_INTERVAL} em ${this.UPDATE_INTERVAL} min\n\n` +
//         `🔥 *BOA SORTE!*`;
      
//       await dmChat.sendMessage(instructions);
//       console.log(`📨 Instruções enviadas para ${player.name}`);
      
//     } catch (error) {
//       console.error('❌ Erro nas instruções:', error.message);
//     }
//   }

//   async notifyAllPlayers(gameId, currentPlayer, type) {
//     try {
//       const players = await db.getGamePlayers(gameId);
      
//       for (const player of players) {
//         if (player.id === currentPlayer.id) continue;
          
//         try {
//           let dmChat = null;
//           if (player.dm_id) {
//             try {
//               dmChat = await this.client.getChatById(player.dm_id);
//             } catch (e) {}
//           }
          
//           if (!dmChat) {
//             try {
//               dmChat = await this.client.getChatById(player.id);
//             } catch (e) {
//               continue;
//             }
//           }
          
//           if (type === 'turn_started') {
//             await dmChat.sendMessage(
//               `🔄 *NOVO TURNO INICIADO*\n\n` +
//               `🎤 ${currentPlayer.name} está no paredão agora!\n` +
//               `⏰ O turno dura ${this.TURN_DURATION} minutos\n\n` +
//               `💬 Envie perguntas aqui!`
//             );
//           } else if (type === 'turn_ended') {
//             await dmChat.sendMessage(
//               `✅ *TURNO ENCERRADO*\n\n` +
//               `🎤 O turno de ${currentPlayer.name} terminou!\n` +
//               `📊 Vá para o grupo para ver os resultados\n\n` +
//               `🔄 Próximo turno começará em breve`
//             );
//           }
//         } catch (error) {
//           console.log(`⚠️ Não pude notificar ${player.name}`);
//         }
//       }
//     } catch (error) {
//       console.error('❌ Erro ao notificar jogadores:', error.message);
//     }
//   }

//   startTurnTimer(gameId, groupId, player) {
//     this.stopTurnTimer(groupId);
    
//     let minutes = 0;
//     const interval = setInterval(async () => {
//       minutes++;
      
//       if (minutes % this.UPDATE_INTERVAL === 0) {
//         await this.sendTurnUpdate(groupId, player, minutes);
//       }
      
//       if (minutes >= this.TURN_DURATION) {
//         console.log(`⏰ Turno automático encerrado para ${player.name}`);
//         await this.endTurn(gameId, groupId);
//         this.stopTurnTimer(groupId);
//       }
//     }, 60000);
    
//     this.timers.set(groupId, interval);
//     console.log(`⏰ Timer iniciado para ${player.name}`);
//   }

//   stopTurnTimer(groupId) {
//     const timer = this.timers.get(groupId);
//     if (timer) {
//       clearInterval(timer);
//       this.timers.delete(groupId);
//     }
//   }

//   async sendTurnUpdate(groupId, player, minutesElapsed) {
//     try {
//       const chat = await this.client.getChatById(groupId);
//       const turnData = this.activeTurns.get(player.id) || { questionsReceived: 0, questionsAnswered: 0 };
      
//       const update = `🔄 *ATUALIZAÇÃO* (${minutesElapsed}/${this.TURN_DURATION}min)\n\n` +
//         `🎤 *${player.name} no Paredão*\n` +
//         `📨 Perguntas: ${turnData.questionsReceived}\n` +
//         `✅ Respondidas: ${turnData.questionsAnswered}\n` +
//         `⏰ Restante: ${this.TURN_DURATION - minutesElapsed} min\n\n` +
//         `💬 *Continuem mandando perguntas!*`;
      
//       await chat.sendMessage(update);
      
//     } catch (error) {
//       console.error('❌ Erro na atualização:', error.message);
//     }
//   }

//   async endTurn(gameId, groupId) {
//     const game = await db.query('SELECT current_player_id FROM games WHERE id = $1', [gameId]);
//     const playerId = game.rows[0]?.current_player_id;
    
//     if (!playerId) {
//       console.log('⚠️ Nenhum turno ativo para encerrar');
//       return null;
//     }
    
//     this.stopTurnTimer(groupId);
    
//     const originalName = await db.restoreGroupName(gameId, groupId);
//     if (originalName) {
//       try {
//         const chat = await this.client.getChatById(groupId);
//         await chat.setSubject(originalName);
//         await chat.setMessagesAdminsOnly(false);
//         console.log(`🔓 Grupo reaberto: "${originalName}"`);
//       } catch (error) {
//         console.error('❌ Erro ao restaurar grupo:', error.message);
//       }
//     } else {
//       try {
//         const chat = await this.client.getChatById(groupId);
//         await chat.setMessagesAdminsOnly(false);
//       } catch (error) {
//         console.error('❌ Erro ao reabrir grupo:', error.message);
//       }
//     }
    
//     const stats = await this.calculateTurnStats(gameId, playerId);
//     await db.endTurn(gameId, playerId, stats);
    
//     await db.updateGameStatus(gameId, 'waiting', null);
    
//     const player = await db.findPlayerByGroupId(playerId);
//     if (player) {
//       await this.notifyPlayerTurnEnded(player, stats);
//       await this.notifyAllPlayers(gameId, player, 'turn_ended');
//     }
    
//     this.activeTurns.delete(playerId);
    
//     await this.announceTurnStats(groupId, player, stats);
    
//     console.log(`✅ Turno finalizado para ${playerId}`);
    
//     return { player, stats };
//   }

//   async notifyPlayerTurnEnded(player, stats) {
//     try {
//       let dmChat = null;
//       if (player.dm_id) {
//         try {
//           dmChat = await this.client.getChatById(player.dm_id);
//         } catch (e) {}
//       }
      
//       if (!dmChat) {
//         try {
//           dmChat = await this.client.getChatById(player.id);
//         } catch (e) {
//           return;
//         }
//       }
      
//       await dmChat.sendMessage(
//         `✅ *SEU TURNO TERMINOU!*\n\n` +
//         `📊 *Resultados:*\n` +
//         `⏰ Duração: ${stats.duration} minutos\n` +
//         `📨 Perguntas recebidas: ${stats.total}\n` +
//         `✅ Respondidas: ${stats.answered}\n` +
//         `❌ Ignoradas: ${stats.ignored}\n\n` +
//         `🏃 *Vá para o grupo para comentários!*`
//       );
//     } catch (error) {
//       console.log(`⚠️ Não pude notificar ${player.name} sobre fim do turno`);
//     }
//   }

//   async announceTurnStats(groupId, player, stats) {
//     try {
//       const chat = await this.client.getChatById(groupId);
      
//       const announcement = `📊 *TURNO ENCERRADO* 📊\n\n` +
//         `🎤 *${player?.name || 'Jogador'}*\n` +
//         `⏰ Duração: ${stats.duration} minutos\n` +
//         `📨 Perguntas recebidas: ${stats.total}\n` +
//         `✅ Respondidas: ${stats.answered}\n` +
//         `❌ Ignoradas: ${stats.ignored}\n\n` +
//         `Hora dos comentários!*`;
      
//       await chat.sendMessage(announcement);
      
//     } catch (error) {
//       console.error('❌ Erro ao anunciar estatísticas:', error.message);
//     }
//   }

//   async nextTurn(gameId, groupId) {
//     // Verificar se há turno ativo
//     const game = await this.getActiveGame(groupId);
//     if (game && game.current_player_id) {
//       console.log('❌ nextTurn bloqueado: há turno ativo');
//       return { error: 'Já existe um turno ativo. Use !encerrarturno primeiro.' };
//     }
    
//     // Obter todos os jogadores
//     const players = await db.getGamePlayers(gameId);
//     if (players.length === 0) {
//       console.log('❌ Nenhum jogador no jogo');
//       return { error: 'Nenhum jogador no jogo' };
//     }
    
//     // Determinar próximo jogador
//     let nextPlayer;
//     const lastTurn = await db.query(`
//       SELECT player_id FROM turns 
//       WHERE game_id = $1 
//       ORDER BY id DESC LIMIT 1
//     `, [gameId]);
    
//     if (lastTurn.rows.length > 0) {
//       // Encontrar índice do último jogador
//       const lastPlayerId = lastTurn.rows[0].player_id;
//       const lastIndex = players.findIndex(p => p.id === lastPlayerId);
      
//       if (lastIndex === -1 || lastIndex === players.length - 1) {
//         // Último jogador não encontrou ou era o último da lista
//         nextPlayer = players[0];
//       } else {
//         // Próximo jogador na lista
//         nextPlayer = players[lastIndex + 1];
//       }
//     } else {
//       // Primeiro turno do jogo
//       nextPlayer = players[0];
//     }
    
//     if (!nextPlayer) {
//       console.log('❌ Não foi possível determinar próximo jogador');
//       return { error: 'Não foi possível determinar próximo jogador' };
//     }
    
//     console.log(`⏭️ Próximo turno: ${nextPlayer.name}`);
//     return await this.startTurn(gameId, groupId, nextPlayer);
//   }

//   async skipTurn(gameId, groupId) {
//     // Primeiro encerrar o turno atual se existir
//     const game = await this.getActiveGame(groupId);
//     if (game && game.current_player_id) {
//       console.log(`⏩ Skipping turno atual...`);
//       await this.endTurn(gameId, groupId);
//     }
    
//     // Pequena pausa para garantir que tudo foi atualizado
//     await new Promise(resolve => setTimeout(resolve, 1000));
    
//     // Agora iniciar próximo turno
//     return await this.nextTurn(gameId, groupId);
//   }

//   async calculateTurnStats(gameId, playerId) {
//     const res = await db.query(`
//       SELECT 
//         COUNT(*) as total,
//         COUNT(answer_text) as answered
//       FROM questions 
//       WHERE game_id = $1 AND to_player_id = $2
//         AND created_at >= (SELECT start_time FROM turns WHERE game_id = $1 AND player_id = $2 ORDER BY id DESC LIMIT 1)
//     `, [gameId, playerId]);
    
//     const stats = res.rows[0];
    
//     const turnRes = await db.query(`
//       SELECT EXTRACT(EPOCH FROM (NOW() - start_time))/60 as duration
//       FROM turns 
//       WHERE game_id = $1 AND player_id = $2 AND end_time IS NULL
//       LIMIT 1
//     `, [gameId, playerId]);
    
//     const duration = Math.round(turnRes.rows[0]?.duration || 0);
    
//     return {
//       total: parseInt(stats.total) || 0,
//       answered: parseInt(stats.answered) || 0,
//       ignored: (parseInt(stats.total) || 0) - (parseInt(stats.answered) || 0),
//       duration
//     };
//   }

//   async receiveQuestion(fromId, groupId, text) {
//     console.log(`📨 Tentativa de pergunta de ${fromId}`);
    
//     const game = await this.getActiveGame(groupId);
//     if (!game || game.status !== 'active') {
//       return { error: '❌ Nenhum turno ativo no momento. Aguarde um turno começar.' };
//     }
    
//     const toId = game.current_player_id;
//     if (!toId) {
//       return { error: '❌ Nenhum jogador no paredão agora.' };
//     }
    
//     // Verificar se o turno ainda está ativo (no mapa local)
//     if (!this.activeTurns.has(toId)) {
//       return { error: '❌ O turno atual já foi encerrado. Aguarde o próximo turno.' };
//     }
    
//     const fromPlayer = await db.findPlayerByAnyId(fromId);
//     const toPlayer = await db.findPlayerByGroupId(toId);
    
//     if (fromPlayer && toPlayer && fromPlayer.id === toPlayer.id) {
//       return { error: '❌ Você não pode enviar perguntas para si mesmo!' };
//     }
    
//     const isRevealed = text.trim().startsWith('#');
//     const questionText = isRevealed ? text.trim().substring(1).trim() : text.trim();
    
//     if (!questionText) {
//       return { error: '❌ Pergunta vazia!' };
//     }
    
//     const questionId = await db.saveQuestion(
//       game.id, fromId, toId, questionText, !isRevealed, null
//     );
    
//     try {
//       let dmChat = null;
//       if (toPlayer?.dm_id) {
//         try {
//           dmChat = await this.client.getChatById(toPlayer.dm_id);
//         } catch (dmError) {
//           console.log(`⚠️ DM ${toPlayer.dm_id} falhou`);
//         }
//       }
      
//       if (!dmChat) {
//         try {
//           dmChat = await this.client.getChatById(toId);
//         } catch (groupDmError) {
//           console.log(`⚠️ Não consegui DM para ${toId}`);
//           return { error: '❌ Não consegui enviar pergunta' };
//         }
//       }
      
//       const senderEmoji = isRevealed ? '👤' : '🎭';
//       const senderInfo = isRevealed ? 
//         (fromPlayer?.name || 'Alguém') : 
//         'Anônimo';
      
//       // REMOVIDO: contador #${questionId}
//       const questionMessage = `${senderEmoji} ${senderInfo}\n\n` +
//         `${questionText}`;
      
//       const sentMsg = await dmChat.sendMessage(questionMessage);
      
//       if (sentMsg?.id?._serialized) {
//         await db.query(
//           'UPDATE questions SET dm_message_id = $1 WHERE id = $2',
//           [sentMsg.id._serialized, questionId]
//         );
//       }
      
//       const turnData = this.activeTurns.get(toId);
//       if (turnData) {
//         turnData.questionsReceived++;
//       }
      
//       console.log(`📨 Pergunta ${questionId} enviada para ${toPlayer?.name || toId}`);
      
//       return { success: true, questionId, anonymous: !isRevealed };
      
//     } catch (error) {
//       console.error('❌ Erro ao enviar pergunta:', error.message);
//       return { error: '❌ Falha ao enviar pergunta' };
//     }
//   }

//   async processAnswer(fromId, quotedMsgId, answerText) {
//     console.log(`💬 Tentativa de resposta de ${fromId}`);
    
//     const question = await db.getQuestionByDmMessageId(quotedMsgId);
//     if (!question) {
//       try {
//         const dmChat = await this.client.getChatById(fromId);
//         await dmChat.sendMessage(
//           `ℹ️ *PARA RESPONDER A UMA PERGUNTA:*\n\n` +
//           `1. Toque e segure na pergunta\n` +
//           `2. Selecione "Responder"\n` +
//           `3. Digite sua resposta\n` +
//           `4. Envie\n\n` +
//           `📤 *Sua resposta será publicada automaticamente no grupo*`
//         );
//       } catch (error) {
//         console.log('⚠️ Não pude enviar instruções');
//       }
//       return { error: 'Para responder, use a função "Responder" do WhatsApp na pergunta específica.' };
//     }
    
//     // VERIFICAÇÃO CRÍTICA: Turno ainda está ativo?
//     const game = await db.query('SELECT current_player_id FROM games WHERE id = $1', [question.game_id]);
//     const currentPlayerId = game.rows[0]?.current_player_id;
    
//     if (!currentPlayerId) {
//       return { error: '❌ Este turno já foi encerrado. Não é possível responder mais perguntas.' };
//     }
    
//     // Verificar se a pergunta é para o jogador atual no paredão
//     if (question.to_player_id !== currentPlayerId) {
//       return { error: '❌ Esta pergunta não é do turno atual. Aguarde seu turno.' };
//     }
    
//     const player = await db.findPlayerByAnyId(fromId);
//     if (!player || player.id !== question.to_player_id) {
//       return { error: '❌ Esta pergunta não é para você.' };
//     }
    
//     if (question.answer_text) {
//       return { error: '❌ Esta pergunta já foi respondida.' };
//     }
    
//     await db.saveAnswer(question.id, answerText);
    
//     const success = await this.publishAnswerToGroup(question, answerText);
    
//     if (success) {
//       const turnData = this.activeTurns.get(player.id);
//       if (turnData) {
//         turnData.questionsAnswered++;
//       }
      
//       console.log(`✅ Resposta publicada para pergunta ${question.id}`);
      
//       return { success: true, questionId: question.id };
//     } else {
//       return { error: '❌ Falha ao publicar resposta no grupo.' };
//     }
//   }

//   async publishAnswerToGroup(question, answerText) {
//     try {
//       const game = await db.query('SELECT group_id FROM games WHERE id = $1', [question.game_id]);
//       if (!game.rows[0]) return false;
      
//       const groupId = game.rows[0].group_id;
//       const player = await db.findPlayerByGroupId(question.to_player_id);
      
//       // REMOVIDO: contador #${question.id}
//       const formattedMessage = `🎤 *${player?.name || 'Jogador'} responde:*\n\n` +
//         `> ${question.question_text}\n\n` +
//         `${answerText}`;
      
//       const groupChat = await this.client.getChatById(groupId);
//       const sentMsg = await groupChat.sendMessage(formattedMessage);
      
//       if (sentMsg?.id?._serialized) {
//         await db.query(
//           'UPDATE questions SET group_message_id = $1 WHERE id = $2',
//           [sentMsg.id._serialized, question.id]
//         );
//       }
      
//       return true;
      
//     } catch (error) {
//       console.error('❌ Erro ao publicar resposta:', error.message);
//       return false;
//     }
//   }

//   async isAdmin(playerId) {
//     return await db.isAdmin(playerId);
//   }

//   async isSupremo(playerId) {
//     const player = await db.findPlayerByAnyId(playerId);
//     if (!player) return false;
    
//     return player.id === this.SUPREMO_GROUP_ID || 
//            player.dm_id === this.SUPREMO_ID ||
//            (player.id.endsWith('@lid') && 
//             player.id.replace('@lid', '@c.us') === this.SUPREMO_ID);
//   }

//   async getPlayerOrder(gameId, playerId) {
//     const players = await db.getGamePlayers(gameId);
//     const player = await db.findPlayerByAnyId(playerId);
    
//     if (!player) return null;
    
//     const idx = players.findIndex(p => p.id === player.id);
//     return idx !== -1 ? { position: idx + 1, total: players.length } : null;
//   }

//   async getGameStatus(gameId) {
//     const game = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
//     if (!game.rows[0]) return null;
    
//     const players = await db.getGamePlayers(gameId);
//     const currentPlayer = game.rows[0].current_player_id 
//       ? await db.findPlayerByGroupId(game.rows[0].current_player_id)
//       : null;
    
//     return {
//       game: game.rows[0],
//       players,
//       currentPlayer,
//       totalPlayers: players.length
//     };
//   }

//   async finishGame(gameId, groupId) {
//     const game = await this.getActiveGame(groupId);
//     if (game && game.current_player_id) {
//       await this.endTurn(gameId, groupId);
//     }
    
//     await db.updateGameStatus(gameId, 'finished', null);
    
//     this.stopTurnTimer(groupId);
    
//     const originalName = await db.restoreGroupName(gameId, groupId);
//     if (originalName) {
//       try {
//         const chat = await this.client.getChatById(groupId);
//         await chat.setSubject(originalName);
//         console.log(`🔤 Nome restaurado ao finalizar: "${originalName}"`);
//       } catch (error) {
//         console.error('❌ Erro ao restaurar nome:', error.message);
//       }
//     }
    
//     console.log(`🏁 Jogo ${gameId} finalizado`);
//   }
// }

// module.exports = GameManager;