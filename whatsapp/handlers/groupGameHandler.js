const { getMentionedIds } = require('../../utils/messageUtils');
const { listGames, isSupportedGame } = require('../../games/core/gameRegistry');
const { parseTurnSettings } = require('../../games/paredao/constants');

class GroupGameHandler {
  constructor({ client, db, manager, impostorManager, namoroManager }) {
    this.client = client;
    this.db = db;
    this.manager = manager;
    this.impostorManager = impostorManager;
    this.namoroManager = namoroManager;
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

  async resolveRuntimeGame(groupId, configuredGame) {
    if (configuredGame && configuredGame !== 'auto') return configuredGame;
    const activeAny = await this.manager.getActiveGame(groupId);
    return activeAny?.game_type || 'paredao';
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
      `🛡️ Admin: ${profile.is_admin ? 'sim' : 'não'}`
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


  async handleNamoroFlow({ msg, chat, senderId, command, args, isAdmin, isSupremo }) {
    const groupId = chat.id._serialized;
    const currentGame = await this.manager.getActiveGame(groupId, 'namoro');

    if (command === '!iniciarnamoro') {
      if (!isAdmin && !isSupremo) {
        await msg.reply('❌ Apenas administradores podem iniciar o Vai Dar Namoro.');
        return true;
      }
      if (currentGame && currentGame.status !== 'finished') {
        await msg.reply('❌ Já existe um Vai Dar Namoro ativo/preparação neste grupo.');
        return true;
      }

      try {
        const created = await this.namoroManager.createGame(groupId, args[0]);
        await this.setSelectedGame(groupId, 'namoro');
        await chat.sendMessage(
          `💘 *VAI DAR NAMORO #${created.gameId} CRIADO!*\n\n` +
          `📝 Entrada: *!entrar SEXO* (se já cadastrado)\n` +
          `ou *!entrar NUMERO NOME SEXO* (novo cadastro)\n` +
          `⚧️ Sexo obrigatório: M ou F (também pode usar *!sexo M/F*)\n` +
          `⏱️ Duração configurada: ${created.durationMinutes} min\n` +
          `✅ Para começar e fechar inscrições: *!encerrarinscricoes*`
        );
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
      return true;
    }

    if (command === '!sexo') {
      try {
        const gender = await this.namoroManager.setGender(senderId, args[0]);
        await msg.reply(`✅ Sexo atualizado para: *${gender.toUpperCase()}*`);
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
      return true;
    }

    if (command === '!encerrarinscricoes' && currentGame) {
      if (!isAdmin && !isSupremo) {
        await msg.reply('❌ Apenas administradores podem encerrar inscrições.');
        return true;
      }

      try {
        const state = await this.namoroManager.startGame({ groupId, chat });
        await chat.sendMessage(
          `🔒 Grupo trancado para admins durante ${state.durationMinutes} min.\n` +
          `📩 Cada jogador pode mandar quantos lances quiser no meu DM (texto, foto, áudio, sticker).\n` +
          `❤️ Depois dê match por ID no DM: *!match AMR-001ABC*.`
        );
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
    const configuredGame = await this.getSelectedGame(groupId);
    const selectedGame = await this.resolveRuntimeGame(groupId, configuredGame);

    if (command === '!ping') {
      await msg.reply('🏓 Pong!');
      return true;
    }

    if (command === '!menujogos') {
      const games = listGames();
      await msg.reply(
        `🎮 *MENU DE JOGOS*\n\n` +
        `${games.map((game) => `• *${game.key}* → ${game.description}`).join('\n')}\n\n` +
        `Comando: *!selecionarjogo paredao* | *impostor* | *namoro*\n` +
        `Para desmarcar: *!deselecionarjogo* (modo automático)\n` +
        `Jogo configurado neste grupo: *${(configuredGame || 'auto').toUpperCase()}*`
      );
      return true;
    }

    if (command === '!selecionarjogo') {
      const option = (args[0] || '').toLowerCase();
      if (!isSupportedGame(option)) {
        await msg.reply('❌ Jogos disponíveis: paredao, impostor, namoro. Use !menujogos');
        return true;
      }

      if (configuredGame === option) {
        await this.setSelectedGame(groupId, 'auto');
        await msg.reply(`♻️ *${option.toUpperCase()}* foi desmarcado. O grupo voltou para modo *AUTO*.`);
        return true;
      }

      await this.setSelectedGame(groupId, option);
      await msg.reply(`✅ Jogo ativo do grupo definido para *${option.toUpperCase()}*.`);
      return true;
    }

    if (command === '!deselecionarjogo') {
      await this.setSelectedGame(groupId, 'auto');
      await msg.reply('✅ Seleção fixa removida. Agora o grupo usa modo *AUTO*.');
      return true;
    }

    if (command === '!comandos' || command === '!help') {
      await msg.reply(
        `🤖 *HELP GERAL* 🤖\n\n` +
        `🎮 *GERAL*\n` +
        `!menujogos - Lista de jogos\n` +
        `!selecionarjogo [paredao|impostor|namoro] - Selecionar fluxo\n` +
        `!deselecionarjogo - Voltar para seleção automática\n` +
        `!entrar [NUMERO NOME] - Entrar no jogo atual (auto-completa 258)\n` +
        `!adicionar @pessoa [NUMERO NOME] - Admin adiciona/atualiza e entra no jogo\n` +
        `!editarmeunome NOME - Edita seu nome no cadastro (no grupo)\n` +
        `!editarmeunumero NUMERO - Edita seu número de DM (no grupo)\n` +
        `!user [@membro] - Ver cadastro geral\n` +
        `!userhis [@membro] - Ver histórico de jogos\n` +
        `!sair - Sair do jogo atual\n` +
        `!status - Status detalhado\n\n` +
        `🎤 *PAREDÃO*\n` +
        `!iniciarparedao [DURACAO UPDATE], !sortear, !comecar, !proximoturno, !skipturno, !encerrarturno, !atualizarparedao D U, !finalizar\n` +
        `!helpparedao - Guia completo do paredão\n` +
        `Exemplo: !iniciarparedao 60 10\n\n` +
        `🕵️ *IMPOSTOR*\n` +
        `!iniciarimpostor, !partilhas N, !encerrarinscricoes\n` +
        `!fala texto (na sua vez), !votar @jogador, !encerrarvotacao\n\n` +
        `💘 *VAI DAR NAMORO*\n` +
        `!iniciarnamoro [min], !encerrarinscricoes, !sexo M/F\n` +
        `DM: envie lances e use !match ID\n\n` +
        `👮 *ADMIN EXTRA*\n` +
        `!forcarentrar/@adicionar @, !remover @, !admin @, !removeradmin @\n` +
        `!editarjogador @ NUMERO NOME, !bloquearedicao, !permitiredicao, !clonarjogo [tipo] [id]`
      );
      return true;
    }

    if (command === '!helpparedao') {
      await msg.reply(
        `🎤 *HELP PAREDÃO (COMPLETO)*\n\n` +
        `1) Admin cria: *!iniciarparedao [duração atualização]*\n` +
        `2) Jogadores entram: *!entrar* (cadastro existente) ou *!entrar NUMERO NOME*\n` +
        `   • Se mandar só 9 dígitos começando em 82-87, o bot completa com 258.\n` +
        `3) Admin pode ajustar ordem com *!sortear* (quantas vezes quiser).\n` +
        `4) Começar: *!comecar* (se não tiver sorteio, o bot sorteia automaticamente).\n` +
        `5) Durante turno, grupo envia perguntas no DM do bot.\n` +
        `   • Pergunta anônima: texto normal\n` +
        `   • Pergunta identificada: começar com #\n` +
        `6) Pessoa no paredão responde no DM usando *Responder* na pergunta.\n` +
        `   • Aceita texto, áudio, foto, vídeo e sticker.\n` +
        `7) Admin controla com: *!encerrarturno*, *!proximoturno*, *!skipturno*.\n` +
        `8) Fim do jogo: *!finalizar*.\n\n` +
        `Extras: *!adicionar*, *!remover*, *!atualizarparedao*, *!clonarjogo*`
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

    const handledNamoro = await this.handleNamoroFlow({ msg, chat, senderId, command, args, isAdmin, isSupremo });
    if (handledNamoro) return true;

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

    if (command === '!editarmeunome' || command === '!editarmeunumero') {
      if (!this.manager.isSelfEditAllowed(groupId)) {
        await msg.reply('⛔ Alterações de cadastro estão bloqueadas por um admin.');
        return true;
      }

      try {
        if (command === '!editarmeunome') {
          const name = args.join(' ').trim();
          if (name.length < 2) {
            await msg.reply('❌ Use: !editarmeunome SEU_NOME');
            return true;
          }
          await this.db.updatePlayerProfile(senderId, { name });
          await msg.reply(`✅ Nome atualizado para: ${name}`);
        } else {
          const normalized = this.manager.validatePhoneNumber(args[0] || '');
          if (!normalized) {
            await msg.reply('❌ Número inválido. Use 258XXXXXXXXX ou 9 dígitos válidos (82-87).');
            return true;
          }
          await this.db.updatePlayerProfile(senderId, { dmId: `${normalized}@c.us` });
          await msg.reply(`✅ Número de DM atualizado para: ${normalized}`);
        }
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
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
        if (game.game_type === 'namoro') {
          if (args.length === 0) {
            await msg.reply('❌ No Vai Dar Namoro use: !entrar SEXO (M/F) ou !entrar NUMERO NOME SEXO');
            return true;
          }

          if (args.length === 1) {
            const isFullyRegistered = await this.db.isPlayerFullyRegistered(senderId);
            if (!isFullyRegistered) {
              await msg.reply('❌ Cadastro geral incompleto. Use: !entrar NUMERO NOME SEXO');
              return true;
            }
            await this.namoroManager.setGender(senderId, args[0]);
            playerInfo = await this.manager.registerExistingPlayer(game.id, senderId);
          } else {
            if (args.length < 3) {
              await msg.reply('❌ Formato no Vai Dar Namoro: !entrar NUMERO NOME SEXO');
              return true;
            }
            const number = args[0];
            const gender = args[args.length - 1];
            const name = args.slice(1, -1).join(' ');
            playerInfo = await this.manager.registerPlayer(game.id, senderId, number, name);
            await this.namoroManager.setGender(senderId, gender);
          }
        } else if (args.length === 0) {
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
        await msg.reply(`❌ ${error.message || 'Erro ao entrar'}`);
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

      if (game.game_type === 'namoro') {
        const state = await this.namoroManager.getState(groupId, game.id);
        const players = await this.db.getGamePlayers(game.id);
        await msg.reply(
          `💘 *STATUS VAI DAR NAMORO*\n\n` +
          `🎮 Jogo: #${game.id}\n` +
          `📍 Fase: ${state?.phase || game.status}\n` +
          `👥 Jogadores: ${players.length}\n` +
          `🔥 Lances: ${state?.lanes?.length || 0}\n` +
          `❤️ Matches totais: ${Object.values(state?.totalMatchesByUser || {}).reduce((acc, n) => acc + n, 0)}\n` +
          `⏱️ Duração: ${state?.durationMinutes || 10} min`
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

    const adminCommands = ['!iniciarparedao', '!iniciarnamoro', '!sortear', '!comecar', '!proximoturno', '!skipturno', '!encerrarturno', '!forcarentrar', '!adicionar', '!remover', '!finalizar', '!admin', '!removeradmin', '!editarjogador', '!bloquearedicao', '!permitiredicao', '!atualizarparedao', '!clonarjogo'];
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
      const botContact = this.client.info?.wid?._serialized?.split('@')[0];
      if (botContact) {
        announcement += `📩 *Perguntas vão no DM do bot:* ${botContact}\n`;
      } else {
        announcement += `📩 *Perguntas vão no meu DM (bot)*\n`;
      }
      announcement += `\n`;
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
      const shuffled = await this.manager.shufflePlayers(game.id);
      const first = shuffled[0];
      await chat.sendMessage(`🎲 Ordem sorteada automaticamente antes de começar.`);
      await chat.sendMessage(`🔥 *VAMOS COMEÇAR!*\n\n🎤 Primeiro: @${first.id.split('@')[0]}\n`, { mentions: [first.id] });
      await this.manager.startTurn(game.id, groupId, first);
      return true;
    }

    if (command === '!atualizarparedao') {
      const game = await this.manager.getActiveGame(groupId, 'paredao');
      if (!game) return msg.reply('❌ Nenhum paredão').then(() => true);
      try {
        const parsed = parseTurnSettings(args);
        const configured = this.manager.configureTurnSettings(groupId, parsed);
        await msg.reply(`✅ Configuração atualizada: turno ${configured.turnDurationMinutes} min, update ${configured.updateIntervalMinutes} min.`);
      } catch (error) {
        await msg.reply(`❌ ${error.message}`);
      }
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

    if (command === '!forcarentrar' || command === '!adicionar' || command === '!remover' || command === '!admin' || command === '!removeradmin' || command === '!editarjogador') {
      const mentionedIds = await getMentionedIds(msg);
      if (mentionedIds.length === 0) {
        await msg.reply(`❌ Use: ${command} @membro`);
        return true;
      }
      const targetId = mentionedIds[0];
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game && (command === '!forcarentrar' || command === '!remover')) return msg.reply('❌ Nenhum jogo ativo').then(() => true);

      if (command === '!forcarentrar' || command === '!adicionar') {
        try {
          const name = await this.getSafeName(targetId);
          if (args.length >= 3) {
            const manualNumber = this.manager.validatePhoneNumber(args[1]);
            const manualName = args.slice(2).join(' ').trim();
            if (!manualNumber || manualName.length < 2) {
              await msg.reply('❌ Use: !adicionar @pessoa NUMERO NOME');
              return true;
            }
            await this.db.registerPlayerWithManualInfo(targetId, `${manualNumber}@c.us`, manualName, false);
          }
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

      if (command === '!editarjogador') {
        const number = this.manager.validatePhoneNumber(args[1] || '');
        const name = args.slice(2).join(' ').trim();
        if (!number || name.length < 2) {
          await msg.reply('❌ Use: !editarjogador @membro NUMERO NOME');
          return true;
        }
        await this.db.updatePlayerProfile(targetId, { dmId: `${number}@c.us`, name });
        await msg.reply(`✅ Cadastro atualizado para ${name} (${number}).`);
        return true;
      }
    }

    if (command === '!bloquearedicao') {
      this.manager.setSelfEditAllowed(groupId, false);
      await msg.reply('🔒 Edição de cadastro dos jogadores bloqueada neste grupo.');
      return true;
    }

    if (command === '!permitiredicao') {
      this.manager.setSelfEditAllowed(groupId, true);
      await msg.reply('🔓 Edição de cadastro dos jogadores liberada neste grupo.');
      return true;
    }

    if (command === '!clonarjogo') {
      const gameType = (args[0] || selectedGame || 'paredao').toLowerCase();
      const sourceId = Number.parseInt(args[1], 10);
      if (!isSupportedGame(gameType)) {
        await msg.reply('❌ Tipo inválido. Use paredao ou impostor.');
        return true;
      }
      const sourceGame = await this.db.getLatestGameWithPlayers(groupId, gameType, Number.isInteger(sourceId) ? sourceId : null);
      if (!sourceGame) {
        await msg.reply('❌ Não encontrei jogo para clonar.');
        return true;
      }
      const sourcePlayers = await this.db.getGamePlayers(sourceGame.id);
      if (sourcePlayers.length === 0) {
        await msg.reply('❌ O jogo de origem não tem jogadores.');
        return true;
      }
      const newGameId = gameType === 'impostor'
        ? await this.impostorManager.createGame(groupId)
        : await this.manager.createGame(groupId, 'paredao');
      for (let i = 0; i < sourcePlayers.length; i++) {
        await this.db.addPlayerToGame(newGameId, sourcePlayers[i].id, i + 1);
      }
      await this.setSelectedGame(groupId, gameType);
      await msg.reply(`✅ Jogo ${gameType.toUpperCase()} #${newGameId} clonado do #${sourceGame.id} com ${sourcePlayers.length} membros.`);
      return true;
    }

    if (command === '!finalizar') {
      const game = await this.manager.getActiveGame(groupId, selectedGame);
      if (!game) return msg.reply('❌ Nenhum jogo ativo').then(() => true);

      if (game.game_type === 'impostor') {
        this.impostorManager.clearState(groupId);
      }

      if (game.game_type === 'namoro') {
        await this.namoroManager.finishGame({ groupId, chat, reason: 'manual' });
        return true;
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
