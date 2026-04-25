const impostorWords = require('./impostorWords');

class ImpostorGameManager {
  constructor({ client, db, manager }) {
    this.client = client;
    this.db = db;
    this.manager = manager;
    this.gamesByGroup = new Map();
    this.defaultSharesPerPlayer = 3;
  }

  hydrateState(raw) {
    if (!raw) return null;
    const state = { ...raw };
    state.playerShares = new Map(Object.entries(raw.playerShares || {}));
    state.votes = new Map(Object.entries(raw.votes || {}));
    return state;
  }

  serializeState(state) {
    return {
      ...state,
      playerShares: Object.fromEntries(state.playerShares || []),
      votes: Object.fromEntries(state.votes || [])
    };
  }

  async getState(groupId, gameId = null) {
    const cached = this.gamesByGroup.get(groupId);
    if (cached && (!gameId || cached.gameId === gameId)) {
      return cached;
    }

    const session = gameId
      ? await this.db.getGameSessionByGameId(gameId)
      : await this.db.getActiveGameSession(groupId, 'impostor');
    if (!session) return null;

    const hydrated = this.hydrateState(session.state || {});
    hydrated.gameId = session.game_id;
    this.gamesByGroup.set(groupId, hydrated);
    return hydrated;
  }

  async persistState(groupId, state, phase = null) {
    const finalPhase = phase || state.phase || 'waiting';
    state.phase = finalPhase;
    this.gamesByGroup.set(groupId, state);
    await this.db.upsertGameSession({
      gameId: state.gameId,
      groupId,
      gameType: 'impostor',
      phase: finalPhase,
      state: this.serializeState(state),
      status: 'active'
    });
  }

  clearState(groupId) {
    this.gamesByGroup.delete(groupId);
  }

  async configureShares(groupId, value) {
    const shares = Number.parseInt(value, 10);
    if (!Number.isInteger(shares) || shares < 1 || shares > 10) {
      throw new Error('Valor inválido. Use de 1 a 10 partilhas por jogador.');
    }

    const state = await this.getState(groupId);
    if (!state) {
      throw new Error('Inicie primeiro com !iniciarimpostor.');
    }

    if (state.phase !== 'waiting') {
      throw new Error('Só é possível ajustar partilhas antes de encerrar inscrições.');
    }

    state.sharesPerPlayer = shares;
    await this.persistState(groupId, state, 'waiting');
    return shares;
  }

  async createGame(groupId) {
    const gameId = await this.manager.createGame(groupId, 'impostor');
    const state = {
      phase: 'waiting',
      sharesPerPlayer: this.defaultSharesPerPlayer,
      players: [],
      gameId,
      currentTurnIndex: 0,
      playerShares: new Map(),
      votes: new Map(),
      impostorIds: [],
      secretWord: null,
      shareLog: []
    };
    await this.persistState(groupId, state, 'waiting');

    return gameId;
  }

  async closeEntriesAndStart({ groupId, chat }) {
    const state = await this.getState(groupId);
    if (!state || !state.gameId) throw new Error('Nenhum jogo do impostor criado.');
    if (state.phase !== 'waiting') throw new Error('As inscrições já foram encerradas.');

    const players = await this.db.getGamePlayers(state.gameId);
    if (players.length < 3) {
      throw new Error('São necessários pelo menos 3 jogadores para começar o impostor.');
    }

    state.players = players;
    state.secretWord = impostorWords[Math.floor(Math.random() * impostorWords.length)];
    const impostorCount = Math.max(1, Math.floor(players.length / 5));
    state.impostorIds = this.pickRandomPlayers(players, impostorCount).map((p) => p.id);

    state.phase = 'sharing';
    state.currentTurnIndex = 0;
    state.playerShares = new Map(players.map((p) => [p.id, 0]));
    state.shareLog = [];

    await this.db.updateGameStatus(state.gameId, 'active', players[0].id);
    await this.persistState(groupId, state, 'sharing');

    await this.sendRoles(players, state.secretWord, state.impostorIds);

    const first = players[0];
    await chat.sendMessage(
      `🕵️ *JOGO DO IMPOSTOR INICIADO!*

` +
      `✅ Papéis enviados no privado.
` +
      `🎯 Palavra secreta definida.
` +
      `🔁 Cada jogador tem *${state.sharesPerPlayer} partilhas* na sua vez.
` +
      `📌 Para partilhar use: *!fala sua dica aqui*.
` +
      `⛔ Só fala quem estiver na vez.

` +
      `🎤 Primeiro da fila: *${first.name}*`
    );
  }

  pickRandomPlayers(players, count) {
    const copy = [...players];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  async sendRoles(players, word, impostorIds) {
    for (const player of players) {
      const targetId = player.dm_id || player.id;
      const dmChat = await this.client.getChatById(targetId).catch(() => null);
      if (!dmChat) continue;

      const isImpostor = impostorIds.includes(player.id);
      const roleText = isImpostor ? '🕵️ *Seu papel: IMPOSTOR*' : `🧩 *Sua palavra é:* ${word}`;

      await dmChat.sendMessage(
        `🎮 *JOGO: O IMPOSTOR*

` +
        `${roleText}

` +
        `⚠️ Não partilhe este privado.
` +
        `🗣️ No grupo, na sua vez, use *!fala ...* para dar dicas sem entregar demais.`
      );
    }
  }

  async handleShare({ groupId, senderId, text, chat }) {
    const state = await this.getState(groupId);
    if (!state || state.phase !== 'sharing') {
      throw new Error('Não há rodada de partilhas ativa.');
    }

    const current = state.players[state.currentTurnIndex];
    if (!current || current.id !== senderId) {
      const expected = current ? current.name : 'ninguém';
      throw new Error(`Ainda não é sua vez. Aguarde *${expected}*.`);
    }

    const clean = text.trim();
    if (!clean) throw new Error('Partilha vazia. Use: !fala sua dica');

    const used = state.playerShares.get(senderId) || 0;
    if (used >= state.sharesPerPlayer) {
      throw new Error('Você já concluiu suas partilhas nesta rodada.');
    }

    const shareNumber = used + 1;
    state.playerShares.set(senderId, shareNumber);
    state.shareLog.push({ playerId: senderId, text: clean, shareNumber });
    await this.persistState(groupId, state, 'sharing');

    await chat.sendMessage(`💬 *${current.name}* (${shareNumber}/${state.sharesPerPlayer}): ${clean}`);

    if (shareNumber < state.sharesPerPlayer) {
      const remaining = state.sharesPerPlayer - shareNumber;
      await chat.sendMessage(`⏭️ ${current.name}, faltam ${remaining} partilha(s) suas nesta vez.`);
      return { phase: state.phase };
    }

    state.currentTurnIndex += 1;

    if (state.currentTurnIndex < state.players.length) {
      const next = state.players[state.currentTurnIndex];
      await this.db.updateGameStatus(state.gameId, 'active', next.id);
      await this.persistState(groupId, state, 'sharing');
      await chat.sendMessage(`🎤 Vez de *${next.name}*. Use !fala ...`);
      return { phase: state.phase };
    }

    state.phase = 'voting';
    await this.db.updateGameStatus(state.gameId, 'active', null);
    await this.persistState(groupId, state, 'voting');

    await chat.sendMessage(
      `🗳️ *Rodada de partilhas encerrada!*

` +
      `Agora todos votam em quem acham que é impostor.
` +
      `Use: *!votar @jogador*.
` +
      `Quando todos votarem (ou admin usar *!encerrarvotacao*), eu revelo o resultado.`
    );

    return { phase: state.phase };
  }

  async handleVote({ groupId, senderId, targetId }) {
    const state = await this.getState(groupId);
    if (!state || state.phase !== 'voting') {
      throw new Error('A votação não está ativa.');
    }

    const voterInGame = state.players.some((p) => p.id === senderId);
    if (!voterInGame) throw new Error('Apenas jogadores podem votar.');

    if (senderId === targetId) throw new Error('Você não pode votar em si mesmo.');

    const target = state.players.find((p) => p.id === targetId);
    if (!target) throw new Error('Jogador votado não está nesta partida.');

    if (state.votes.has(senderId)) throw new Error('Você já votou.');

    state.votes.set(senderId, targetId);
    await this.persistState(groupId, state, 'voting');

    return {
      totalVotes: state.votes.size,
      needed: state.players.length,
      targetName: target.name,
      done: state.votes.size >= state.players.length
    };
  }

  async forceCloseVoting({ groupId, chat }) {
    const state = await this.getState(groupId);
    if (!state || state.phase !== 'voting') throw new Error('Nenhuma votação ativa.');

    const tally = new Map();
    for (const targetId of state.votes.values()) {
      tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }

    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const highest = sorted[0]?.[1] || 0;
    const mostVoted = sorted.filter(([, votes]) => votes === highest).map(([id]) => id);

    const impostorNames = state.players
      .filter((p) => state.impostorIds.includes(p.id))
      .map((p) => p.name);

    const pickedNames = state.players
      .filter((p) => mostVoted.includes(p.id))
      .map((p) => p.name);

    const allCaught = state.impostorIds.every((id) => mostVoted.includes(id));

    let report = `📊 *RESULTADO DA VOTAÇÃO - IMPOSTOR*

`;
    report += `🕵️ Impostor(es): ${impostorNames.join(', ') || 'Não identificado'}
`;
    report += `🗳️ Mais votado(s): ${pickedNames.join(', ') || 'Sem votos'} (${highest} voto(s))
`;
    report += `${allCaught ? '✅ Os jogadores acertaram!' : '❌ O impostor escapou!'}

`;
    report += `📌 Palavra da rodada: *${state.secretWord}*`;

    await chat.sendMessage(report);
    await this.db.updateGameStatus(state.gameId, 'finished', null);
    await this.db.closeGameSession(state.gameId);

    this.clearState(groupId);
  }
}

module.exports = ImpostorGameManager;
