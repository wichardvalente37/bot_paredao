const { normalizeText } = require('../../utils/messageUtils');

class DMHandler {
  constructor({ db, manager, namoroManager }) {
    this.db = db;
    this.manager = manager;
    this.namoroManager = namoroManager;
  }

  async handle({ msg, senderId }) {
    const text = normalizeText(msg);
    const player = await this.db.findPlayerByAnyId(senderId);


    const namoroGame = await this.db.getActiveGameForPlayerByType(senderId, 'namoro');
    if (namoroGame) {
      if (text.startsWith('!match ')) {
        try {
          const laneId = text.split(' ')[1];
          const result = await this.namoroManager.registerMatch({
            groupId: namoroGame.group_id,
            senderId: player?.id || senderId,
            laneIdRaw: laneId
          });
          await msg.reply(`❤️ Match registrado no lance #${result.laneId} (${result.countForLane}/3 neste lance).`);
        } catch (error) {
          await msg.reply(`❌ ${error.message}`);
        }
        return true;
      }

      const hasPlayableContent = text || msg.hasMedia || ['audio', 'ptt', 'image', 'video', 'sticker'].includes(msg.type);
      if (hasPlayableContent) {
        try {
          const lane = await this.namoroManager.submitLane({
            groupId: namoroGame.group_id,
            senderId: player?.id || senderId,
            msg,
            text
          });
          await msg.reply(`✅ Lance #${lane.id} registrado!`);
        } catch (error) {
          await msg.reply(`❌ ${error.message}`);
        }
        return true;
      }
    }

    if (text.startsWith('!editarmeunome ') || text.startsWith('!editarmeunumero ')) {
      await msg.reply('ℹ️ Edição de dados foi movida para o grupo. Use !editarmeunome ou !editarmeunumero no grupo do jogo.');
      return true;
    }

    if (!player) {
      const activeGame = await this.db.query(`
        SELECT g.id, g.group_id FROM games g
        WHERE g.status = 'active'
        ORDER BY g.id DESC LIMIT 1
      `);

      if (activeGame.rows.length === 0) {
        await msg.reply('❌ Nenhum jogo ativo no momento.');
        return true;
      }

      if (text && !msg.hasQuotedMsg) {
        const result = await this.manager.receiveQuestion(senderId, activeGame.rows[0].group_id, text);
        if (result.success) {
          const confirmation = result.anonymous
            ? '✅ *Pergunta enviada (anônima)*'
            : '✅ *Pergunta enviada (identificada)*';
          await msg.reply(confirmation);
        } else if (result.error) {
          await msg.reply(result.error);
        }
      }
      return true;
    }

    if (msg.hasQuotedMsg) {
      const quotedMsg = await msg.getQuotedMessage();
      const quotedId = quotedMsg.id?._serialized;

      if (quotedId) {
        const hasMedia = msg.hasMedia || msg.type === 'audio' || msg.type === 'ptt' || msg.type === 'image' || msg.type === 'video' || msg.type === 'sticker';
        const media = hasMedia
          ? { content: await msg.downloadMedia(), type: msg.type === 'ptt' ? 'audio' : msg.type }
          : null;
        const result = await this.manager.processAnswer(senderId, quotedId, text, media);
        if (result.success) {
          await msg.reply('✅ Resposta enviada ao grupo!');
        } else if (result.error) {
          await msg.reply(result.error);
        }
        return true;
      }
    }

    if (!text) return true;

    const activeTurnRes = await this.db.query(`
      SELECT g.id, g.group_id, g.current_player_id
      FROM games g
      JOIN game_players gp ON g.id = gp.game_id
      WHERE gp.player_id = $1 AND g.status = 'active'
      LIMIT 1
    `, [player.id]);

    if (activeTurnRes.rows.length > 0) {
      const game = activeTurnRes.rows[0];

      if (game.current_player_id === player.id) {
        await msg.reply(
          `ℹ️ *PARA RESPONDER:*\n\n` +
          `1. Toque e segure na pergunta\n` +
          `2. Selecione "Responder"\n` +
          `3. Digite sua resposta\n` +
          `4. Envie\n\n` +
          `📤 *Resposta vai pro grupo*`
        );
        return true;
      }

      const result = await this.manager.receiveQuestion(senderId, game.group_id, text);
      if (result.success) {
        const confirmation = result.anonymous
          ? '✅ *Pergunta enviada (anônima)*'
          : '✅ *Pergunta enviada (identificada)*';
        await msg.reply(confirmation);
      } else if (result.error) {
        await msg.reply(result.error);
      }

      return true;
    }

    const anyActiveGame = await this.db.query(`
      SELECT id, group_id FROM games WHERE status = 'active' ORDER BY id DESC LIMIT 1
    `);

    if (anyActiveGame.rows.length > 0) {
      const result = await this.manager.receiveQuestion(senderId, anyActiveGame.rows[0].group_id, text);
      if (result.success) {
        const confirmation = result.anonymous
          ? '✅ *Pergunta enviada (anônima)*'
          : '✅ *Pergunta enviada (identificada)*';
        await msg.reply(confirmation);
      } else if (result.error) {
        await msg.reply(result.error);
      }
    } else {
      await msg.reply('❌ Nenhum jogo ativo no momento.');
    }

    return true;
  }
}

module.exports = DMHandler;
