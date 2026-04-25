require('dotenv').config();
const { Client: PGClient } = require('pg');

class Database {
  constructor() {
    this.pg = null;
  }

  async connect() {
    if (this.pg) return;
    this.pg = new PGClient({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
      database: process.env.DB_NAME || 'paredao',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });
    await this.pg.connect();
    await this.createTables();
    
    const SUPREMO_ID = process.env.SUPREMO_ID;
    const SUPREMO_GROUP_ID = process.env.SUPREMO_GROUP_ID; // Novo: ID do grupo do Supremo
    
    if (SUPREMO_ID && SUPREMO_GROUP_ID) {
      await this.query(`
        INSERT INTO players(id, dm_id, name, is_admin, is_supremo) 
        VALUES($1, $2, '👑 SUPREMO', true, true)
        ON CONFLICT (id) DO UPDATE 
        SET dm_id = $2, is_admin = true, is_supremo = true
      `, [SUPREMO_GROUP_ID, SUPREMO_ID]);
      console.log(`👑 SUPREMO registrado: ${SUPREMO_GROUP_ID} ↔ ${SUPREMO_ID}`);
    }
    console.log('✅ Banco conectado!');
  }

  async createTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        group_id VARCHAR(80) NOT NULL,
        status VARCHAR(20) DEFAULT 'waiting',
        game_type VARCHAR(20) DEFAULT 'paredao',
        current_player_id VARCHAR(80),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(80) PRIMARY KEY,
        dm_id VARCHAR(80) UNIQUE,
        name VARCHAR(150) NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        is_supremo BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS game_players (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        player_id VARCHAR(80) REFERENCES players(id) ON DELETE CASCADE,
        turn_order INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(game_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        from_player_id VARCHAR(80),
        to_player_id VARCHAR(80),
        question_text TEXT NOT NULL,
        answer_text TEXT,
        dm_message_id VARCHAR(255),
        group_message_id VARCHAR(255),
        is_anonymous BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        answered_at TIMESTAMP,
        was_posted BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS turns (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        player_id VARCHAR(80),
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        questions_received INTEGER DEFAULT 0,
        questions_answered INTEGER DEFAULT 0,
        duration_minutes INTEGER
      );

      CREATE TABLE IF NOT EXISTS group_backup (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        group_id VARCHAR(80),
        original_name TEXT,
        backup_time TIMESTAMP DEFAULT NOW(),
        restored BOOLEAN DEFAULT false
      );

      ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) DEFAULT 'paredao';

      CREATE INDEX IF NOT EXISTS idx_games_group_status ON games(group_id, status);
      CREATE INDEX IF NOT EXISTS idx_games_group_type_status ON games(group_id, game_type, status);
      CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
      CREATE INDEX IF NOT EXISTS idx_questions_game_to_player ON questions(game_id, to_player_id);
      CREATE INDEX IF NOT EXISTS idx_questions_dm_message_id ON questions(dm_message_id);
      CREATE INDEX IF NOT EXISTS idx_players_dm_id ON players(dm_id) WHERE dm_id IS NOT NULL;
    `;
    await this.query(sql);
  }

  async query(text, params = []) {
    try {
      if (!this.pg) await this.connect();
      return await this.pg.query(text, params);
    } catch (e) {
      console.error('❌ Erro no banco:', e.message);
      return { rows: [] };
    }
  }

  async findPlayerByDmId(dmUserId) {
    const result = await this.query(
      'SELECT id, name FROM players WHERE dm_id = $1 LIMIT 1',
      [dmUserId]
    );
    return result.rows[0];
  }

  async findPlayerByGroupId(groupUserId) {
    const result = await this.query(
      'SELECT id, dm_id, name FROM players WHERE id = $1 LIMIT 1',
      [groupUserId]
    );
    return result.rows[0];
  }

  async findPlayerByAnyId(userId) {
    // Tenta primeiro pelo ID do grupo
    let player = await this.findPlayerByGroupId(userId);
    if (player) return player;
    
    // Tenta pelo ID do DM
    player = await this.findPlayerByDmId(userId);
    if (player) return player;
    
    return null;
  }

  async registerPlayerWithManualInfo(groupUserId, dmUserId, name, isSupremo = false) {
    await this.query(`
      INSERT INTO players(id, dm_id, name, is_supremo) 
      VALUES($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE 
      SET dm_id = EXCLUDED.dm_id,
          name = EXCLUDED.name,
          is_supremo = EXCLUDED.is_supremo
    `, [groupUserId, dmUserId, name, isSupremo]);
    
    console.log(`👤 Registrado: ${name} (${groupUserId} ↔ ${dmUserId})`);
  }

  async getGamePlayers(gameId) {
    const res = await this.query(`
      SELECT p.id, p.dm_id, p.name, gp.turn_order 
      FROM players p 
      JOIN game_players gp ON p.id = gp.player_id 
      WHERE gp.game_id = $1 AND gp.status = 'active' 
      ORDER BY gp.turn_order
    `, [gameId]);
    return res.rows;
  }

  async addPlayerToGame(gameId, playerId, turnOrder) {
    await this.query(`
      INSERT INTO game_players(game_id, player_id, turn_order) 
      VALUES($1, $2, $3)
      ON CONFLICT (game_id, player_id) DO UPDATE SET turn_order = $3
    `, [gameId, playerId, turnOrder]);
  }

  async removePlayerFromGame(gameId, playerId) {
    await this.query(
      'DELETE FROM game_players WHERE game_id = $1 AND player_id = $2',
      [gameId, playerId]
    );
  }

  async updateGameStatus(gameId, status, currentPlayerId = null) {
    await this.query(
      'UPDATE games SET status = $1, current_player_id = $2, updated_at = NOW() WHERE id = $3',
      [status, currentPlayerId, gameId]
    );
  }

  async saveQuestion(gameId, fromId, toId, text, isAnonymous, dmMessageId = null) {
    const res = await this.query(`
      INSERT INTO questions(game_id, from_player_id, to_player_id, question_text, is_anonymous, dm_message_id) 
      VALUES($1, $2, $3, $4, $5, $6) 
      RETURNING id
    `, [gameId, fromId, toId, text, isAnonymous, dmMessageId]);
    return res.rows[0]?.id;
  }

  async saveAnswer(questionId, answerText, groupMessageId = null) {
    await this.query(`
      UPDATE questions 
      SET answer_text = $1, answered_at = NOW(), group_message_id = $2, was_posted = true 
      WHERE id = $3
    `, [answerText, groupMessageId, questionId]);
  }

  async getQuestionByDmMessageId(dmMessageId) {
    const res = await this.query(
      'SELECT * FROM questions WHERE dm_message_id = $1 LIMIT 1',
      [dmMessageId]
    );
    return res.rows[0];
  }

  async startTurn(gameId, playerId) {
    await this.query(`
      INSERT INTO turns(game_id, player_id, start_time) 
      VALUES($1, $2, NOW())
    `, [gameId, playerId]);
  }

  async endTurn(gameId, playerId, stats) {
    await this.query(`
      UPDATE turns 
      SET end_time = NOW(), 
          questions_received = $1,
          questions_answered = $2,
          duration_minutes = $3
      WHERE game_id = $4 
        AND player_id = $5 
        AND end_time IS NULL
    `, [stats.total, stats.answered, stats.duration, gameId, playerId]);
  }

  async backupGroupName(gameId, groupId, originalName) {
    // Verificar se já existe backup para este jogo
    const existing = await this.query(
      'SELECT id FROM group_backup WHERE game_id = $1 AND group_id = $2',
      [gameId, groupId]
    );
    
    if (existing.rows.length === 0) {
      await this.query(`
        INSERT INTO group_backup(game_id, group_id, original_name) 
        VALUES($1, $2, $3)
      `, [gameId, groupId, originalName]);
      console.log(`💾 Backup do nome: "${originalName}"`);
    }
  }

  async restoreGroupName(gameId, groupId) {
    const res = await this.query(`
      SELECT id, original_name 
      FROM group_backup 
      WHERE game_id = $1 AND group_id = $2 
      ORDER BY id DESC LIMIT 1
    `, [gameId, groupId]);
    
    if (res.rows[0]) {
      return res.rows[0].original_name;
    }
    return null;
  }

  async isAdmin(playerId) {
    const player = await this.findPlayerByAnyId(playerId);
    if (!player) return false;
    
    const res = await this.query(
      'SELECT is_admin, is_supremo FROM players WHERE id = $1',
      [player.id]
    );
    return res.rows[0]?.is_admin || res.rows[0]?.is_supremo || false;
  }

  async promoteToAdmin(playerId) {
    const player = await this.findPlayerByAnyId(playerId);
    if (player) {
      await this.query(
        'UPDATE players SET is_admin = true WHERE id = $1 AND is_supremo = false',
        [player.id]
      );
    }
  }

  async demoteAdmin(playerId) {
    const player = await this.findPlayerByAnyId(playerId);
    if (player) {
      await this.query(
        'UPDATE players SET is_admin = false WHERE id = $1 AND is_supremo = false',
        [player.id]
      );
    }
  }

  async getTurnStats(gameId, playerId) {
    const res = await this.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(answer_text) as answered
      FROM questions 
      WHERE game_id = $1 AND to_player_id = $2
        AND created_at >= (SELECT start_time FROM turns WHERE game_id = $1 AND player_id = $2 ORDER BY id DESC LIMIT 1)
    `, [gameId, playerId]);
    
    const stats = res.rows[0];
    const turnRes = await this.query(`
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

  async getNextPlayer(gameId, currentPlayerId) {
    const players = await this.getGamePlayers(gameId);
    if (players.length === 0) return null;
    
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    if (currentIndex === -1) return players[0];
    
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex];
  }

  async getPlayerByGroupIdInGame(gameId, groupUserId) {
    const res = await this.query(`
      SELECT p.id, p.dm_id, p.name 
      FROM players p 
      JOIN game_players gp ON p.id = gp.player_id 
      WHERE gp.game_id = $1 AND p.id = $2
      LIMIT 1
    `, [gameId, groupUserId]);
    return res.rows[0];
  }
}

module.exports = new Database();