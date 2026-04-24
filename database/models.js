const { Client } = require('pg');

class Database {
    constructor() {
        this.client = new Client({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });
    }

    async connect() {
        await this.client.connect();
        await this.initTables();
        console.log('✅ Banco de dados conectado');
    }

    async initTables() {
        await this.client.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                group_id VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'waiting',
                current_player_id VARCHAR(50),
                next_player_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS players (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                bio TEXT,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS game_players (
                game_id INTEGER REFERENCES games(id),
                player_id VARCHAR(50) REFERENCES players(id),
                turn_order INTEGER,
                status VARCHAR(20) DEFAULT 'active',
                removed_reason VARCHAR(100),
                removed_at TIMESTAMP,
                PRIMARY KEY (game_id, player_id)
            );

            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES games(id),
                from_player_id VARCHAR(50) REFERENCES players(id),
                to_player_id VARCHAR(50) REFERENCES players(id),
                question_text TEXT NOT NULL,
                answer_text TEXT,
                message_id VARCHAR(100),
                is_anonymous BOOLEAN DEFAULT TRUE,
                reactions_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS group_backup (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES games(id),
                group_id VARCHAR(50) NOT NULL,
                original_name VARCHAR(256),
                backup_time TIMESTAMP DEFAULT NOW(),
                restored BOOLEAN DEFAULT FALSE
            );
        `);
    }

    // Métodos CRUD básicos
    async savePlayer(id, name, bio = '') {
        await this.client.query(
            'INSERT INTO players (id, name, bio) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, bio = $3',
            [id, name, bio]
        );
    }

    async getPlayer(id) {
        const result = await this.client.query(
            'SELECT * FROM players WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }

    async createGame(groupId) {
        const result = await this.client.query(
            'INSERT INTO games (group_id, status) VALUES ($1, $2) RETURNING id',
            [groupId, 'waiting']
        );
        return result.rows[0].id;
    }

    async getActiveGame(groupId) {
        const result = await this.client.query(
            'SELECT * FROM games WHERE group_id = $1 AND status != $2 ORDER BY id DESC LIMIT 1',
            [groupId, 'finished']
        );
        return result.rows[0];
    }

    async addPlayerToGame(gameId, playerId) {
        // Pega a última ordem
        const result = await this.client.query(
            'SELECT MAX(turn_order) as max_order FROM game_players WHERE game_id = $1',
            [gameId]
        );
        const nextOrder = (result.rows[0].max_order || 0) + 1;

        await this.client.query(
            'INSERT INTO game_players (game_id, player_id, turn_order) VALUES ($1, $2, $3)',
            [gameId, playerId, nextOrder]
        );
    }

    async getGamePlayers(gameId) {
        const result = await this.client.query(`
            SELECT p.*, gp.turn_order, gp.status 
            FROM players p 
            JOIN game_players gp ON p.id = gp.player_id 
            WHERE gp.game_id = $1 AND gp.status = 'active'
            ORDER BY gp.turn_order
        `, [gameId]);
        return result.rows;
    }

    async saveQuestion(gameId, fromPlayerId, toPlayerId, question, isAnonymous = true) {
        const result = await this.client.query(`
            INSERT INTO questions (game_id, from_player_id, to_player_id, question_text, is_anonymous)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [gameId, fromPlayerId, toPlayerId, question, isAnonymous]);
        return result.rows[0].id;
    }

    async saveAnswer(questionId, answer) {
        await this.client.query(
            'UPDATE questions SET answer_text = $1 WHERE id = $2',
            [answer, questionId]
        );
    }
// Modificar saveGroupBackup
async saveFullGroupBackup(gameId, groupId, groupData) {
    await this.client.query(`
        INSERT INTO group_backup (
            game_id, 
            group_id, 
            original_name, 
            original_description,
            original_settings,
            backup_time,
            restored
        ) VALUES ($1, $2, $3, $4, $5, NOW(), false)
    `, [
        gameId, 
        groupId, 
        groupData.name,
        groupData.description,
        JSON.stringify({
            participants: groupData.participants,
            isAnnounce: groupData.isAnnounce,
            messagesAdminsOnly: groupData.messagesAdminsOnly,
            allowAddMembers: groupData.allowAddMembers
        })
    ]);
}

async getGroupBackup(gameId, groupId) {
    const result = await this.client.query(
        'SELECT * FROM group_backup WHERE game_id = $1 AND group_id = $2 AND restored = false ORDER BY id DESC LIMIT 1',
        [gameId, groupId]
    );
    
    if (result.rows.length === 0) return null;
    
    const backup = result.rows[0];
    if (backup.original_settings) {
        backup.original_settings = JSON.parse(backup.original_settings);
    }
    
    return backup;
}
    

    // Adicionar estas funções ao Database em database/models.js

async getActiveGameByPlayer(playerId) {
    const result = await this.client.query(`
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

async updateGameStatus(gameId, status) {
    await this.client.query(
        'UPDATE games SET status = $1 WHERE id = $2',
        [status, gameId]
    );
}

async getGamePlayersWithStatus(gameId) {
    const result = await this.client.query(`
        SELECT p.*, gp.turn_order, gp.status as player_status, gp.removed_reason
        FROM players p 
        JOIN game_players gp ON p.id = gp.player_id 
        WHERE gp.game_id = $1
        ORDER BY gp.turn_order
    `, [gameId]);
    
    return result.rows;
}

async getQuestionsWithReactions(gameId, playerId) {
    const result = await this.client.query(`
        SELECT q.*, COUNT(*) as reaction_count
        FROM questions q
        LEFT JOIN reactions r ON q.message_id = r.message_id
        WHERE q.game_id = $1 
        AND q.to_player_id = $2
        AND q.answer_text IS NOT NULL
        GROUP BY q.id
        ORDER BY reaction_count DESC
        LIMIT 5
    `, [gameId, playerId]);
    
    return result.rows;
}

// Adicionar ao Database em database/models.js

async getPlayerActiveGames(playerId) {
    const result = await this.client.query(`
        SELECT g.*, gp.turn_order
        FROM games g
        JOIN game_players gp ON g.id = gp.game_id
        WHERE gp.player_id = $1 
        AND g.status != 'finished'
        AND gp.status = 'active'
        ORDER BY g.created_at DESC
    `, [playerId]);
    
    return result.rows;
}

async getQuestionThread(questionId) {
    const result = await this.client.query(`
        SELECT q.*, 
               p_from.name as from_player_name,
               p_to.name as to_player_name,
               g.group_id
        FROM questions q
        JOIN players p_from ON q.from_player_id = p_from.id
        JOIN players p_to ON q.to_player_id = p_to.id
        JOIN games g ON q.game_id = g.id
        WHERE q.id = $1
    `, [questionId]);
    
    return result.rows[0];
}

async updateMessageReactions(messageId, reactionCount) {
    await this.client.query(
        'UPDATE questions SET reactions_count = $1 WHERE message_id = $2',
        [reactionCount, messageId]
    );
}
// Adicionar função para atualizar biografia
async updatePlayerBio(playerId, bio) {
    await this.client.query(
        'UPDATE players SET bio = $1 WHERE id = $2',
        [bio, playerId]
    );
}

// Buscar jogador com bio atualizada
async getPlayerWithBio(playerId, client) {
    const player = await this.getPlayer(playerId);
    
    if (!player) {
        // Criar jogador se não existe
        const contact = await client.getContactById(playerId);
        await this.savePlayer(playerId, contact.name || contact.pushname, contact.about || '');
        return await this.getPlayer(playerId);
    }
    
    // Atualizar bio se estiver vazia
    if (!player.bio || player.bio === '') {
        try {
            const contact = await client.getContactById(playerId);
            if (contact.about) {
                await this.updatePlayerBio(playerId, contact.about);
                player.bio = contact.about;
            }
        } catch (error) {
            console.log(`Não foi possível buscar bio de ${playerId}:`, error.message);
        }
    }
    
    return player;
}

async getPlayerWithBio(playerId, client) {
    try {
        // Buscar jogador existente
        const player = await this.getPlayer(playerId);
        
        if (!player) {
            // Criar novo jogador se não existe
            const contact = await client.getContactById(playerId);
            const name = contact.name || contact.pushname || 'Jogador';
            const bio = contact.about || '';
            
            await this.savePlayer(playerId, name, bio);
            return { id: playerId, name, bio };
        }
        
        // Se não tem bio, tentar atualizar
        if (!player.bio || player.bio.trim() === '') {
            try {
                const contact = await client.getContactById(playerId);
                if (contact.about && contact.about.trim() !== '') {
                    await this.updatePlayerBio(playerId, contact.about);
                    player.bio = contact.about;
                }
            } catch (error) {
                console.log(`⚠️ Não foi possível atualizar bio de ${player.name}:`, error.message);
            }
        }
        
        return player;
        
    } catch (error) {
        console.log(`❌ Erro em getPlayerWithBio:`, error.message);
        return { id: playerId, name: 'Jogador', bio: '' };
    }
}

async updatePlayerBio(playerId, bio) {
    await this.client.query(
        'UPDATE players SET bio = $1 WHERE id = $2',
        [bio, playerId]
    );
}

async getGameStats(gameId) {
    const result = await this.client.query(`
        SELECT 
            COUNT(DISTINCT gp.player_id) as total_players,
            COUNT(DISTINCT CASE WHEN gp.status = 'active' THEN gp.player_id END) as active_players,
            COUNT(DISTINCT CASE WHEN gp.status != 'active' THEN gp.player_id END) as removed_players,
            COUNT(DISTINCT q.id) as total_questions,
            COUNT(DISTINCT CASE WHEN q.answer_text IS NOT NULL THEN q.id END) as answered_questions,
            COALESCE(AVG(q.reactions_count), 0) as avg_reactions
        FROM game_players gp
        LEFT JOIN questions q ON q.game_id = gp.game_id
        WHERE gp.game_id = $1
    `, [gameId]);
    
    return result.rows[0];
}

async savePlayer(id, name, bio = '') {
    await this.client.query(
        'INSERT INTO players (id, name, bio) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, bio = $3',
        [id, name, bio]
    );
}

async addPlayerToGame(gameId, playerId) {
    // Pega a última ordem
    const result = await this.client.query(
        'SELECT MAX(turn_order) as max_order FROM game_players WHERE game_id = $1',
        [gameId]
    );
    const nextOrder = (result.rows[0].max_order || 0) + 1;

    await this.client.query(
        'INSERT INTO game_players (game_id, player_id, turn_order) VALUES ($1, $2, $3)',
        [gameId, playerId, nextOrder]
    );
}

async getGamePlayers(gameId) {
    const result = await this.client.query(`
        SELECT p.*, gp.turn_order, gp.status 
        FROM players p 
        JOIN game_players gp ON p.id = gp.player_id 
        WHERE gp.game_id = $1 AND gp.status = 'active'
        ORDER BY gp.turn_order
    `, [gameId]);
    return result.rows;
}

async getActiveGameById(gameId) {
    const result = await this.client.query(
        'SELECT * FROM games WHERE id = $1 AND status != $2',
        [gameId, 'finished']
    );
    return result.rows[0];
}

async getPlayer(playerId) {
    const result = await this.client.query(
        'SELECT * FROM players WHERE id = $1',
        [playerId]
    );
    return result.rows[0];
}

}

module.exports = new Database();