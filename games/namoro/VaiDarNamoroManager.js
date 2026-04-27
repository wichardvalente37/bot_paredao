class VaiDarNamoroManager {
  constructor({ client, db, manager }) {
    this.client = client;
    this.db = db;
    this.manager = manager;
    this.gamesByGroup = new Map();
    this.defaultDurationMinutes = 10;
    this.minDuration = 3;
    this.maxDuration = 180;
  }

  hydrateState(raw = {}) {
    return {
      phase: raw.phase || 'waiting',
      gameId: raw.gameId,
      durationMinutes: raw.durationMinutes || this.defaultDurationMinutes,
      startedAt: raw.startedAt || null,
      endsAt: raw.endsAt || null,
      originalGroupName: raw.originalGroupName || null,
      lanes: raw.lanes || [],
      laneCounter: raw.laneCounter || 0,
      playerGender: raw.playerGender || {},
      matchCountByPair: raw.matchCountByPair || {},
      totalMatchesByUser: raw.totalMatchesByUser || {},
      triggeredEvents: raw.triggeredEvents || {}
    };
  }

  async getState(groupId, gameId = null) {
    const cached = this.gamesByGroup.get(groupId);
    if (cached && (!gameId || cached.gameId === gameId)) return cached;

    const session = gameId
      ? await this.db.getGameSessionByGameId(gameId)
      : await this.db.getActiveGameSession(groupId, 'namoro');
    if (!session) return null;

    const state = this.hydrateState(session.state || {});
    state.gameId = session.game_id;
    this.gamesByGroup.set(groupId, state);
    return state;
  }

  async persistState(groupId, state, phase = null) {
    const finalPhase = phase || state.phase || 'waiting';
    state.phase = finalPhase;
    this.gamesByGroup.set(groupId, state);
    await this.db.upsertGameSession({
      gameId: state.gameId,
      groupId,
      gameType: 'namoro',
      phase: finalPhase,
      state,
      status: 'active'
    });
  }

  clearState(groupId) {
    this.gamesByGroup.delete(groupId);
  }

  parseDuration(raw) {
    if (!raw) return this.defaultDurationMinutes;
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < this.minDuration || n > this.maxDuration) {
      throw new Error(`Duração inválida. Use entre ${this.minDuration} e ${this.maxDuration} minutos.`);
    }
    return n;
  }

  async createGame(groupId, durationRaw) {
    const durationMinutes = this.parseDuration(durationRaw);
    const gameId = await this.manager.createGame(groupId, 'namoro');
    await this.persistState(groupId, {
      gameId,
      phase: 'waiting',
      durationMinutes,
      startedAt: null,
      endsAt: null,
      originalGroupName: null,
      lanes: [],
      laneCounter: 0,
      playerGender: {},
      matchCountByPair: {},
      totalMatchesByUser: {},
      triggeredEvents: {}
    }, 'waiting');
    return { gameId, durationMinutes };
  }

  async startGame({ groupId, chat }) {
    const state = await this.getState(groupId);
    if (!state || !state.gameId) throw new Error('Nenhum jogo Vai Dar Namoro criado.');
    if (state.phase !== 'waiting') throw new Error('Este jogo já começou.');

    const players = await this.db.getGamePlayers(state.gameId);
    if (players.length < 2) throw new Error('São necessários pelo menos 2 jogadores.');

    const missing = [];
    for (const player of players) {
      const profile = await this.db.getPlayerRegistrationProfile(player.id);
      const gender = (profile?.gender || '').toLowerCase();
      if (!['m', 'f'].includes(gender)) {
        missing.push(player.name);
      } else {
        state.playerGender[player.id] = gender;
      }
    }

    if (missing.length > 0) {
      throw new Error(`Faltam definir sexo/género (M/F): ${missing.join(', ')}. Use !sexo M ou !sexo F.`);
    }

    const originalName = chat.name;
    state.originalGroupName = originalName;
    state.startedAt = Date.now();
    state.endsAt = Date.now() + (state.durationMinutes * 60 * 1000);

    await this.db.backupGroupName(state.gameId, groupId, originalName);
    await this.db.updateGameStatus(state.gameId, 'active', null);

    await chat.setMessagesAdminsOnly(true).catch(() => null);
    await chat.setSubject(`💘 Vai Dar Namoro #${state.gameId}`).catch(() => null);

    await this.persistState(groupId, state, 'active');

    setTimeout(async () => {
      try {
        const running = await this.getState(groupId, state.gameId);
        if (running && running.phase === 'active') {
          await this.finishGame({ groupId, chat, reason: 'timer' });
        }
      } catch (error) {
        console.error('Erro ao fechar namoro por tempo:', error.message);
      }
    }, state.durationMinutes * 60 * 1000);

    return state;
  }

  normalizeGender(raw) {
    const value = (raw || '').toLowerCase();
    if (['m', 'masculino', 'homem'].includes(value)) return 'm';
    if (['f', 'feminino', 'mulher'].includes(value)) return 'f';
    return null;
  }

  async setGender(userId, genderRaw) {
    const gender = this.normalizeGender(genderRaw);
    if (!gender) throw new Error('Use !sexo M ou !sexo F');
    const profile = await this.db.getPlayerRegistrationProfile(userId);
    if (!profile) throw new Error('Você ainda não tem cadastro geral. Entre com !entrar NUMERO NOME SEXO');

    await this.db.updatePlayerGender(userId, gender);
    return gender;
  }

  buildLaneId(counter) {
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `AMR-${String(counter).padStart(3, '0')}${rand}`;
  }

  detectLaneType(msg, text) {
    if (msg.type === 'audio' || msg.type === 'ptt') return 'audio';
    if (msg.type === 'image') return 'foto';
    if (msg.type === 'sticker') return 'sticker';
    if (msg.type === 'video') return 'video';
    return text ? 'texto' : 'midia';
  }

  async submitLane({ groupId, senderId, msg, text }) {
    const state = await this.getState(groupId);
    if (!state || state.phase !== 'active') {
      throw new Error('O Vai Dar Namoro não está ativo agora.');
    }

    const players = await this.db.getGamePlayers(state.gameId);
    if (!players.some((p) => p.id === senderId)) throw new Error('Você não está inscrito neste jogo.');

    state.laneCounter += 1;
    const laneId = this.buildLaneId(state.laneCounter);
    const laneType = this.detectLaneType(msg, text);

    const lane = {
      id: laneId,
      ownerId: senderId,
      type: laneType,
      text: text || '',
      createdAt: Date.now(),
      matchers: []
    };
    state.lanes.push(lane);
    await this.persistState(groupId, state, 'active');

    await this.publishLaneToGroup({ groupId, lane, msg, text });
    await this.checkLiveEvents(groupId, state);

    return lane;
  }

  async publishLaneToGroup({ groupId, lane, msg, text }) {
    const chat = await this.client.getChatById(groupId).catch(() => null);
    if (!chat) return;

    const header = `🔥 *Novo lance!*\nID: *#${lane.id}*\nDê match no DM com: *!match ${lane.id}*`;

    if (msg.hasMedia || ['audio', 'ptt', 'image', 'video', 'sticker'].includes(msg.type)) {
      const media = await msg.downloadMedia().catch(() => null);
      if (media) {
        if (lane.type === 'sticker') {
          await chat.sendMessage(media);
          await chat.sendMessage(`${header}\n🧩 Sticker enviado.`);
          return;
        }
        const caption = text ? `${header}\n\n📝 ${text}` : header;
        await chat.sendMessage(media, { caption });
        return;
      }
    }

    await chat.sendMessage(`💬 ${header}\n\n${text || '[sem texto]'}`);
  }

  async registerMatch({ groupId, senderId, laneIdRaw }) {
    const state = await this.getState(groupId);
    if (!state || state.phase !== 'active') throw new Error('Jogo não está ativo.');

    const laneId = (laneIdRaw || '').replace('#', '').toUpperCase();
    const lane = state.lanes.find((item) => item.id === laneId);
    if (!lane) throw new Error('ID de lance não encontrado.');
    if (lane.ownerId === senderId) throw new Error('Você não pode dar match no seu próprio lance.');

    const fromGender = state.playerGender[senderId] || '';
    const toGender = state.playerGender[lane.ownerId] || '';
    if (!fromGender || !toGender) throw new Error('Sexo não configurado para este jogo.');
    if (fromGender === toGender) throw new Error('Match bloqueado: só é permitido entre M e F.');

    const key = `${senderId}::${lane.id}`;
    const current = state.matchCountByPair[key] || 0;
    if (current >= 3) throw new Error('Limite atingido: máximo de 3 matchs por usuário neste lance.');

    state.matchCountByPair[key] = current + 1;
    if (!lane.matchers.includes(senderId)) lane.matchers.push(senderId);
    state.totalMatchesByUser[senderId] = (state.totalMatchesByUser[senderId] || 0) + 1;

    await this.persistState(groupId, state, 'active');
    await this.checkLiveEvents(groupId, state, lane);

    return { laneId: lane.id, countForLane: state.matchCountByPair[key] };
  }

  async checkLiveEvents(groupId, state, changedLane = null) {
    const chat = await this.client.getChatById(groupId).catch(() => null);
    if (!chat) return;

    const topLane = [...state.lanes].sort((a, b) => b.matchers.length - a.matchers.length)[0];
    if (topLane && topLane.matchers.length >= 10 && !state.triggeredEvents.top10) {
      state.triggeredEvents.top10 = true;
      await chat.sendMessage(`🔔 Alerta! O lance #${topLane.id} chegou ao 10º match.`);
    }

    if (changedLane && changedLane.matchers.length >= 5 && !state.triggeredEvents[`hot_${changedLane.id}`]) {
      state.triggeredEvents[`hot_${changedLane.id}`] = true;
      await chat.sendMessage(`💥 Match quente no #${changedLane.id}!`);
    }

    await this.persistState(groupId, state, 'active');
  }

  async finishGame({ groupId, chat = null, reason = 'manual' }) {
    const state = await this.getState(groupId);
    if (!state) throw new Error('Sem sessão de namoro ativa.');

    const targetChat = chat || await this.client.getChatById(groupId).catch(() => null);
    const analysis = this.buildFinalAnalysis(state);

    await this.db.updateGameStatus(state.gameId, 'finished', null);
    await this.db.closeGameSession(state.gameId);

    if (targetChat) {
      await targetChat.setMessagesAdminsOnly(false).catch(() => null);
      if (state.originalGroupName) {
        await targetChat.setSubject(state.originalGroupName).catch(() => null);
      }

      await targetChat.sendMessage(
        `🏁 *VAI DAR NAMORO #${state.gameId} ENCERRADO* (${reason === 'timer' ? 'tempo esgotado' : 'manual'})\n\n${analysis.report}`
      );
    }

    await this.notifyTopPairs(analysis.pairs);
    this.clearState(groupId);
    return analysis;
  }

  buildFinalAnalysis(state) {
    const byOwner = {};
    for (const lane of state.lanes) {
      if (!byOwner[lane.ownerId]) byOwner[lane.ownerId] = new Set();
      for (const matcherId of lane.matchers) byOwner[lane.ownerId].add(matcherId);
    }

    const score = {};
    const users = new Set();
    for (const [ownerId, matchers] of Object.entries(byOwner)) {
      users.add(ownerId);
      for (const fromId of matchers) {
        users.add(fromId);
        const key = `${fromId}->${ownerId}`;
        score[key] = (score[key] || 0) + 1;
      }
    }

    const userList = [...users];
    const pairs = [];
    for (let i = 0; i < userList.length; i++) {
      for (let j = i + 1; j < userList.length; j++) {
        const a = userList[i];
        const b = userList[j];
        const ab = score[`${a}->${b}`] || 0;
        const ba = score[`${b}->${a}`] || 0;
        const total = ab + ba;
        if (total <= 0) continue;
        pairs.push({ a, b, total, affinity: Math.round((Math.min(ab, ba) / Math.max(ab, ba || 1)) * 100) });
      }
    }

    pairs.sort((x, y) => y.total - x.total || y.affinity - x.affinity);
    const top = pairs[0] || null;

    const topLane = [...state.lanes].sort((a, b) => b.matchers.length - a.matchers.length)[0];
    const topUser = Object.entries(state.totalMatchesByUser).sort((a, b) => b[1] - a[1])[0];

    const report = [
      topLane ? `🏆 Lance mais desejado: #${topLane.id} com ${topLane.matchers.length} matches.` : '🏆 Nenhum lance recebeu match.',
      topUser ? `👑 Pessoa que mais distribuiu match: ${topUser[0].split('@')[0]} (${topUser[1]} matchs).` : '👑 Sem destaque de matchs.',
      top ? `💍 Casal perfeito: ${top.a.split('@')[0]} ↔ ${top.b.split('@')[0]} (${top.total} matches, ${top.affinity}% afinidade).` : '💍 Sem casal formado.'
    ].join('\n');

    return { report, pairs };
  }

  async notifyTopPairs(pairs) {
    const topPairs = pairs.slice(0, 5);
    for (const pair of topPairs) {
      const a = await this.db.findPlayerByAnyId(pair.a);
      const b = await this.db.findPlayerByAnyId(pair.b);
      if (!a?.dm_id || !b?.dm_id) continue;

      const chatA = await this.client.getChatById(a.dm_id).catch(() => null);
      const chatB = await this.client.getChatById(b.dm_id).catch(() => null);
      const line = `💘 Match confirmado!\nContato: ${a.name} (${a.dm_id.split('@')[0]}) ↔ ${b.name} (${b.dm_id.split('@')[0]})`;
      if (chatA) await chatA.sendMessage(line);
      if (chatB) await chatB.sendMessage(line);
    }
  }
}

module.exports = VaiDarNamoroManager;
