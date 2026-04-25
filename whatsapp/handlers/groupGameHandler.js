const { getMentionedIds } = require('../helpers/messageUtils');
const { listGames, isSupportedGame } = require('../../games/core/gameRegistry');
const { parseTurnSettings } = require('../../games/paredao/constants');

class GroupGameHandler {
  constructor({ client, db, manager, impostorManager }) {
    this.client = client;
    this.db = db;
    this.manager = manager;
    this.impostorManager = impostorManager;
    this.selectedGameByGroup = new Map();
  }

  async getSafeName(id) {
    try {
      const player = await this.db.findPlayerByAnyId(id);
      if (player?.name) return player.name;

      const contact = await this.client.getContactById(id).catch(() => null);
      return contact?.pushname || contact?.name || id.split('@')[0];
    } catch {
      return id.split('@')[0];
    }
  }

  async getSelectedGame(groupId) {
    const cached = this.selectedGameByGroup.get(groupId);
    if (cached) return cached;
    const selected = await this.manager.getSelectedGame(groupId);
    this.selectedGameByGroup.set(groupId, selected);
    return selected;
  }

  async setSelectedGame(groupId, gameName) {
    this.selectedGameByGroup.set(groupId, gameName);
    await this.manager.setSelectedGame(groupId, gameName);
  }

  async sendUserRegistrationStatus(msg, targetId, isSelf = false) {
    const profile = await this.db.getPlayerRegistrationProfile(targetId);
    if (!profile) {
      const guidance = isSelf
        ? '\n\n💡 Para se cadastrar: *!entrar NUMERO NOME*\nEx: !entrar 258866630883 João'
        : '';
      await msg.reply(`❌ ${isSelf ? 'Você não está' : 'Usuário não está'} cadastrado(a) no sistema geral.${guidance}`);
      return;
    }

    const fullyRegistered = Boolean(profile.id && profile.dm_id && profile.name);
    const status = fullyRegistered ? '✅ Cadastrado(a)' : '⚠️ Cadastro incompleto';
    const dmNumber = profile.dm_id ? profile.dm_id.split('@')[0] : 'não informado';
    const groupNumber = profile.id ? profile.id.split('@')[0] : 'não informado';

    await msg.reply(
      `👤 *STATUS DO USER*\n\n` +
      `📌 Estado: ${status}\n` +
      `🧾 Nome: ${profile.name || 'não informado'}\n` +
      `👥 Número do grupo: ${groupNumber}\n` +
      `💬 Número do DM: ${dmNumber}\n` +
      `🛡️ Admin: ${profile.is_admin ? 'sim' : 'não'}\n` +
      `👑 Supremo: ${profile.is_supremo ? 'sim' : 'não'}`
    );
  }

  async sendUserHistory(msg, targetId) {
    const history = await this.db.getPlayerHistory(targetId, 8);
    if (history.length === 0) {
      await msg.reply('📭 Sem histórico de jogos para este usuário.');
      return;
    }

    const lines = history.map((entry, idx) => (
      `${idx + 1}. #${entry.game_id} (${(entry.game_type || 'paredao').toUpperCase()})\n` +
      `   • status: ${entry.status}\n` +
      `   • posição: ${entry.turn_order ?? '-'}\n` +
      `   • perguntas: ${entry.questions_received}/${entry.questions_answered} resp.\n` +
      `   • duração turno: ${entry.duration_minutes ?? 0} min`
    ));

    await msg.reply(`📚 *HISTÓRICO RECENTE*\n\n${lines.join('\n')}`);
  }

  async mentionAllGroupMembers(chat, excludeIds = []) {
    try {
      const participants = chat.participants || [];
      const mentionIds = [];

      for (const participant of participants) {
        const participantId = participant.id._serialized;
        if (participantId.includes('@bot') || excludeIds.includes(participantId)) continue;
        mentionIds.push(participantId);
      }

      return mentionIds;
    } catch (error) {
      console.error('❌ Erro ao obter membros:', error.message);
      return [];
    }
  }


  async promoteGroupAdmin(chat, targetId) {
    if (typeof chat.promoteParticipants !== 'function') return false;
    try {
      await chat.promoteParticipants([targetId]);
      return true;
    } catch (error) {
      console.error('⚠️ Falha ao promover admin do grupo:', error.message);
      return false;
    }
  }

  async demoteGroupAdmin(chat, targetId) {
    if (typeof chat.demoteParticipants !== 'function') return false;
    try {
      await chat.demoteParticipants([targetId]);
      return true;
    } catch (error) {
      console.error('⚠️ Falha ao remover admin do grupo:', error.message);
      return false;
    }
  }

  async handleImpostorFlow({ msg, chat, senderId, command, args, isAdmin, isSupremo }) {
    const groupId = chat.id._serialized;
    const currentGame = await this.manager.getActiveGame(groupId, 'impostor');

    if (command === '!iniciarimpostor') {
      if (!isAdmin && !isSupremo) {
        await msg.reply('❌ Apenas administradores podem iniciar o impostor.');
        return true;
      }
      if (currentGame) {
        await msg.reply('❌ Já existe um jogo de impostor ativo neste grupo.');
        return true;
      }

      const gameId = await this.impostorManager.createGame(groupId);
      await this.setSelectedGame(groupId, 'impostor');

      await chat.sendMessage(
        `🕵️ *JOGO DO IMPOSTOR #${gameId} CRIADO!*

` +
        `📝 Entrada: *!entrar* (se já cadastrado) ou *!entrar NUMERO NOME*
` +
        `⚙️ Partilhas padrão: 3 por pessoa (mude com !partilhas N)
` +
        `✅ Quando terminar inscrições: *!encerrarinscricoes*`
      );
      return true;
    }

    if (command === '!partilhas') {
      if (!isAdmin && !isSupremo) {
        await msg.reply('❌ Apenas administradores podem configurar partilhas.');
        return true;
      }

      if (!currentGame) {
        await msg.reply('❌ Inicie primeiro com !iniciarimpostor.');
        return true;
      }

      try {
        const value = await this.impostorManager.configureShares(groupId, args[0]);
        await msg.reply(`✅ Partilhas por jogador ajustadas para *${value}*.`);
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
      return true;
    }

    if (command === '!encerrarinscricoes') {
      if (!isAdmin && !isSupremo) {
        await msg.reply('❌ Apenas administradores podem encerrar inscrições.');
        return true;
      }

      if (!currentGame) {
        await msg.reply('❌ Nenhum jogo do impostor em preparação.');
        return true;
      }

      try {
        await this.impostorManager.closeEntriesAndStart({ groupId, chat });
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
      return true;
    }

    if (command === '!fala') {
      const text = args.join(' ');
      try {
        await this.impostorManager.handleShare({ groupId, senderId, text, chat });
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
      return true;
    }

    if (command === '!votar') {
      const mentionedIds = await getMentionedIds(msg);
      if (mentionedIds.length === 0) {
        await msg.reply('❌ Use !votar @jogador');
        return true;
      }

      try {
        const vote = await this.impostorManager.handleVote({
          groupId,
          senderId,
          targetId: mentionedIds[0]
        });

        await msg.reply(`✅ Voto registado em *${vote.targetName}* (${vote.totalVotes}/${vote.needed})`);

        if (vote.done) {
          await this.impostorManager.forceCloseVoting({ groupId, chat });
        }
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }

      return true;
    }

    if (command === '!encerrarvotacao') {
      if (!isAdmin && !isSupremo) {
        await msg.reply('❌ Apenas administradores podem encerrar votação.');
        return true;
      }

      try {
        const state = await this.impostorManager.getState(groupId, currentGame?.id);
        if (state?.phase === 'sharing') {
          await this.impostorManager.forceCloseSharing({ groupId, chat });
        } else {
          await this.impostorManager.forceCloseVoting({ groupId, chat });
        }
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
      return true;
    }

    return false;
  }

  async handle({ msg, chat, senderId, command, args }) {
    if (!chat.isGroup || !command.startsWith('!')) return false;

    const groupId = chat.id._serialized;
    const selectedGame = await this.getSelectedGame(groupId);

    if (command === '!ping') {
      await msg.reply('🏓 Pong!');
      return true;
    }

    if (command === '!menujogos') {
      const games = listGames();
      await msg.reply(
        `🎮 *MENU DE JOGOS*\n\n` +
        `${games.map((game) => `• *${game.key}* → ${game.description}`).join('\n')}\n\n` +
        `Comando: *!selecionarjogo paredao* ou *!selecionarjogo impostor*\n` +
        `Jogo selecionado neste grupo: *${selectedGame.toUpperCase()}*`
      );
      return true;
    }

    if (command === '!selecionarjogo') {
      const option = (args[0] || '').toLowerCase();
      if (!isSupportedGame(option)) {
        await msg.reply('❌ Jogos disponíveis: paredao, impostor. Use !menujogos');
        return true;
      }
      await this.setSelectedGame(groupId, option);
      await msg.reply(`✅ Jogo ativo do grupo definido para *${option.toUpperCase()}*.`);
      return true;
    }

    if (command === '!comandos' || command === '!help') {
      await msg.reply(
        `🤖 *HELP GERAL* 🤖\n\n` +
        `🎮 *GERAL*\n` +
        `!menujogos - Lista de jogos\n` +
        `!selecionarjogo [paredao|impostor] - Selecionar fluxo\n` +
        `!entrar [NUMERO NOME] - Entrar no jogo atual\n` +
        `!user [@membro] - Ver cadastro geral\n` +
        `!userhis [@membro] - Ver histórico de jogos\n` +
        `!sair - Sair do jogo atual\n` +
        `!status - Status detalhado\n\n` +
        `🎤 *PAREDÃO*\n` +
        `!iniciarparedao [DURACAO UPDATE], !sortear, !comecar, !proximoturno, !skipturno, !encerrarturno, !finalizar\n` +
        `Exemplo: !iniciarparedao 60 10\n\n` +
        `🕵️ *IMPOSTOR*\n` +
        `!iniciarimpostor, !partilhas N, !encerrarinscricoes\n` +
        `!fala texto (na sua vez), !votar @jogador, !encerrarvotacao\n\n` +
        `👮 *ADMIN EXTRA*\n` +
        `!forcarentrar @, !remover @, !admin @, !removeradmin @`
      );
      return true;
    }

    if (command === '!comojogar') {
      await msg.reply(
        `📚 *GUIA RÁPIDO*\n\n` +
        `No *PAREDÃO*: cada participante passa por um turno no paredão e responde perguntas no privado.\n\n` +
        `No *IMPOSTOR*:\n` +
        `1) Admin cria com !iniciarimpostor\n` +
        `2) Todos entram com !entrar NUMERO NOME\n` +
        `3) Admin usa !encerrarinscricoes\n` +
        `4) Cada um recebe papel no privado\n` +
        `5) Em ordem, cada jogador usa !fala ...\n` +
        `6) No final todos votam com !votar @\n` +
        `7) Bot revela impostor(es)`
      );
      return true;
    }

    const isAdmin = await this.manager.isAdmin(senderId);
    const isSupremo = await this.manager.isSupremo(senderId);

    const handledImpostor = await this.handleImpostorFlow({ msg, chat, senderId, command, args, isAdmin, isSupremo });
    if (handledImpostor) return true;

    if (command === '!user') {
      const mentionedIds = await getMentionedIds(msg);
      const targetId = mentionedIds[0] || senderId;
      await this.sendUserRegistrationStatus(msg, targetId, targetId === senderId);
      return true;
    }

    if (command === '!userhis' || command === '!historico') {
      const mentionedIds = await getMentionedIds(msg);
      const targetId = mentionedIds[0] || senderId;
      await this.sendUserHistory(msg, targetId);
      return true;
    }

    if (command === '!entrar') {
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game) return msg.reply(`❌ Não há ${selectedGame} pronto. Use o comando de iniciar.`).then(() => true);
      if (game.status !== 'waiting') return msg.reply('❌ Jogo já começou!').then(() => true);

      try {
        const isSupremoPlayer = await this.manager.isSupremo(senderId);
        if (isSupremoPlayer) {
          const playerInfo = await this.manager.registerPlayer(game.id, senderId, '', '');
          await msg.reply(`✅ ${playerInfo.name} entrou! Posição: ${playerInfo.order}º`);
          return true;
        }

        let playerInfo;
        if (args.length === 0) {
          const isFullyRegistered = await this.db.isPlayerFullyRegistered(senderId);
          if (!isFullyRegistered) {
            await msg.reply('❌ Você não tem cadastro geral completo.\nUse: !entrar NUMERO NOME\nEx: !entrar 258866630883 João');
            return true;
          }

          playerInfo = await this.manager.registerExistingPlayer(game.id, senderId);
        } else {
          if (args.length < 2) {
            await msg.reply('❌ Formato: !entrar NUMERO NOME\nEx: !entrar 258866630883 João');
            return true;
          }

          playerInfo = await this.manager.registerPlayer(game.id, senderId, args[0], args.slice(1).join(' '));
        }
        const dmId = playerInfo.dmId || senderId;
        const dmChat = await this.client.getChatById(dmId).catch(() => null);
        if (dmChat) {
          await dmChat.sendMessage(
            `✅ *Você entrou no ${game.game_type.toUpperCase()}!*\n\n` +
            `📌 Grupo: ${chat.name}\n` +
            `🎮 Jogo: #${game.id}\n` +
            `📋 Posição: ${playerInfo.order}º`
          );
        }

        await msg.reply(`✅ ${playerInfo.name} entrou! Posição: ${playerInfo.order}º`);
      } catch (error) {
        await msg.reply(`❌ ${error.message.includes('já está') || error.message.includes('Número inválido') || error.message.includes('Digite seu nome') ? error.message : 'Erro ao entrar'}`);
      }
      return true;
    }

    if (command === '!sair') {
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game) return msg.reply('❌ Nenhum jogo ativo').then(() => true);
      if (game.current_player_id === senderId) return msg.reply('❌ Não pode sair durante turno/rodada!').then(() => true);
      await this.manager.removePlayer(game.id, senderId).then(() => msg.reply('🏳️ Você saiu')).catch(() => msg.reply('❌ Você não está'));
      return true;
    }

    if (command === '!status') {
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game) return msg.reply('❌ Nenhum jogo ativo').then(() => true);

      if (game.game_type === 'impostor') {
        const state = await this.impostorManager.getState(groupId, game.id);
        const players = await this.db.getGamePlayers(game.id);
        const phase = state?.phase || game.status;
        const votes = state?.votes?.size || 0;
        const shares = state?.sharesPerPlayer || 0;

        await msg.reply(
          `🕵️ *STATUS DO IMPOSTOR*\n\n` +
          `🎮 Jogo: #${game.id}\n` +
          `📍 Fase: ${phase}\n` +
          `👥 Jogadores: ${players.length}\n` +
          `🗣️ Partilhas por jogador: ${shares || 'não definido'}\n` +
          `🗳️ Votos registados: ${votes}\n\n` +
          `${players.length ? `Ordem: ${players.map((p, i) => `${i + 1}. ${p.name}`).join(' | ')}` : ''}`
        );
        return true;
      }

      const status = await this.manager.getGameStatus(game.id);
      let statusText = `🎮 *PAREDÃO #${game.id}*\n📊 ${status.statusText}\n👥 ${status.totalPlayers} jogadores\n`;
      if (status.currentPlayer) statusText += `\n🎤 *ATUAL:* ${status.currentPlayer.name}`;
      statusText += '\n\n📋 *ORDEM:*\n';
      status.players.forEach((player, index) => {
        const indicator = player.id === game.current_player_id ? '🎤' : index === 0 && !game.current_player_id ? '⏭️' : `${index + 1}º`;
        statusText += `${indicator} ${player.name}\n`;
      });
      await msg.reply(statusText);
      return true;
    }

    const adminCommands = ['!iniciarparedao', '!sortear', '!comecar', '!proximoturno', '!skipturno', '!encerrarturno', '!forcarentrar', '!remover', '!finalizar', '!admin', '!removeradmin'];
    if (!isAdmin && !isSupremo && adminCommands.includes(command)) {
      await msg.reply('❌ Apenas administradores');
      return true;
    }

    if (command === '!iniciarparedao') {
      const existingGame = await this.manager.getActiveGame(groupId, 'paredao');
      if (existingGame && existingGame.status !== 'finished') return msg.reply('❌ Já existe um paredão').then(() => true);
      let turnSettings;
      try {
        turnSettings = parseTurnSettings(args);
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
        return true;
      }

      const gameId = await this.manager.createGame(groupId, 'paredao');
      const configured = this.manager.configureTurnSettings(groupId, turnSettings);
      await this.setSelectedGame(groupId, 'paredao');

      const mentionIds = await this.mentionAllGroupMembers(chat, [senderId]);
      let announcement = `🎮 *NOVO PAREDÃO #${gameId}!*\n\n`;
      if (mentionIds.length > 0) {
        announcement += `🎯 *CONVITE PARA TODOS:*\n${mentionIds.map((id) => `@${id.split('@')[0]}`).join(' ')}\n\n`;
      }
      announcement += `📝 *PARA PARTICIPAR:*\n!entrar (se já cadastrado)\nou\n!entrar NUMERO SEU_NOME\nEx: !entrar 258866630883 João\n\n`;
      announcement += `⏱️ *Configuração deste jogo:*\n• Turno: ${configured.turnDurationMinutes} min\n• Atualização: ${configured.updateIntervalMinutes} min`;
      await chat.sendMessage(announcement, mentionIds.length > 0 ? { mentions: mentionIds } : undefined);
      await msg.reply(`✅ Paredão #${gameId} iniciado!`);
      return true;
    }

    if (command === '!sortear') {
      const game = await this.manager.getActiveGame(groupId, 'paredao');
      if (!game) return msg.reply('❌ Nenhum paredão').then(() => true);
      if (game.status !== 'waiting') return msg.reply('❌ Jogo já começou!').then(() => true);
      const shuffled = await this.manager.shufflePlayers(game.id);
      await msg.reply(`🎲 *ORDEM SORTEADA*\n\n${shuffled.map((p, i) => `${i + 1}º ${p.name}`).join('\n')}\n\n✅ Use !comecar`);
      return true;
    }

    if (command === '!comecar') {
      const game = await this.manager.getActiveGame(groupId, 'paredao');
      if (!game) return msg.reply('❌ Nenhum paredão').then(() => true);
      if (game.status !== 'waiting') return msg.reply('❌ Jogo já começou!').then(() => true);
      const players = await this.db.getGamePlayers(game.id);
      if (players.length === 0) return msg.reply('❌ Nenhum jogador').then(() => true);
      const first = players[0];
      await chat.sendMessage(`🔥 *VAMOS COMEÇAR!*\n\n🎤 Primeiro: @${first.id.split('@')[0]}\n`, { mentions: [first.id] });
      await this.manager.startTurn(game.id, groupId, first);
      return true;
    }

    if (command === '!proximoturno' || command === '!skipturno') {
      const game = await this.manager.getActiveGame(groupId, 'paredao');
      if (!game) return msg.reply('❌ Nenhum paredão').then(() => true);
      const result = command === '!proximoturno'
        ? await this.manager.nextTurn(game.id, groupId)
        : await this.manager.skipTurn(game.id, groupId);
      if (result.success) {
        const title = command === '!proximoturno' ? '⏭️ *PRÓXIMO TURNO*' : '⏩ *TURNO PULADO*';
        const lead = command === '!proximoturno' ? 'Agora' : 'Próximo';
        await chat.sendMessage(`${title}\n\n🎤 ${lead}: @${result.player.id.split('@')[0]}\n`, { mentions: [result.player.id] });
      } else if (result.error) {
        await msg.reply(`❌ ${result.error}`);
      }
      return true;
    }

    if (command === '!encerrarturno') {
      const game = await this.manager.getActiveGame(groupId, 'paredao');
      if (!game) return msg.reply('❌ Nenhum paredão').then(() => true);
      if (!game.current_player_id) return msg.reply('❌ Nenhum turno ativo').then(() => true);
      await this.manager.endTurn(game.id, groupId);
      await msg.reply('⏹️ *Turno encerrado!*');
      return true;
    }

    if (command === '!forcarentrar' || command === '!remover' || command === '!admin' || command === '!removeradmin') {
      const mentionedIds = await getMentionedIds(msg);
      if (mentionedIds.length === 0) {
        await msg.reply(`❌ Use: ${command} @membro`);
        return true;
      }
      const targetId = mentionedIds[0];
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game && (command === '!forcarentrar' || command === '!remover')) return msg.reply('❌ Nenhum jogo ativo').then(() => true);

      if (command === '!forcarentrar') {
        try {
          const name = await this.getSafeName(targetId);
          const playerInfo = await this.manager.forceAddPlayer(game.id, targetId, name);
          await msg.reply(`✅ ${playerInfo.name} adicionado! Posição: ${playerInfo.order}º`);
        } catch (error) {
          await msg.reply(`❌ ${error.message}`);
        }
        return true;
      }

      if (command === '!remover') {
        if (game.current_player_id === targetId) return msg.reply('❌ Não pode remover durante turno').then(() => true);
        await this.manager.removePlayer(game.id, targetId).then(() => msg.reply('✅ Jogador removido')).catch(() => msg.reply('❌ Erro ao remover'));
        return true;
      }

      if (command === '!admin') {
        if (!isSupremo) return msg.reply('❌ Apenas SUPREMO').then(() => true);
        await this.db.promoteToAdmin(targetId);
        const promotedOnGroup = await this.promoteGroupAdmin(chat, targetId);
        await msg.reply(
          promotedOnGroup
            ? `🛡️ ${await this.getSafeName(targetId)} promovido a admin do jogo e do grupo`
            : `🛡️ ${await this.getSafeName(targetId)} promovido a admin do jogo (não consegui promover no grupo)`
        );
        return true;
      }

      if (command === '!removeradmin') {
        if (!isSupremo) return msg.reply('❌ Apenas SUPREMO').then(() => true);
        if (await this.manager.isSupremo(targetId)) return msg.reply('❌ Não pode remover SUPREMO').then(() => true);
        await this.db.demoteAdmin(targetId);
        const demotedOnGroup = await this.demoteGroupAdmin(chat, targetId);
        await msg.reply(
          demotedOnGroup
            ? `🛡️ ${await this.getSafeName(targetId)} removido como admin do jogo e do grupo`
            : `🛡️ ${await this.getSafeName(targetId)} removido como admin do jogo`
        );
        return true;
      }
    }

    if (command === '!finalizar') {
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game) return msg.reply('❌ Nenhum jogo ativo').then(() => true);

      if (game.game_type === 'impostor') {
        this.impostorManager.clearState(groupId);
      }

      await this.manager.finishGame(game.id, groupId);
      const players = await this.db.getGamePlayers(game.id);
      if (players.length === 0) {
        await msg.reply(`🏁 *${game.game_type.toUpperCase()} FINALIZADO!*`);
        return true;
      }

      const mentionIds = players.map((p) => p.id);
      let finalMessage = `🏁 *${game.game_type.toUpperCase()} #${game.id} FINALIZADO!*\n\n🎉 *OBRIGADO A TODOS!*\n\n`;
      if (mentionIds.length > 0) {
        finalMessage += `👏 *PARABÉNS:*\n${mentionIds.map((id) => `@${id.split('@')[0]}`).join(' ')}\n\n`;
      }
      await chat.sendMessage(finalMessage, mentionIds.length > 0 ? { mentions: mentionIds } : undefined);
      return true;
    }

    return false;
  }
}

module.exports = GroupGameHandler;
