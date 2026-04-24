require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Database = require('./database');
const GameManager = require('./game-manager');
const SupremoCommands = require('./supremo-commands');

// ====== CONFIGURAÇÕES ======
const SUPREMO_ID = process.env.SUPREMO_ID || '';
const SUPREMO_GROUP_ID = process.env.SUPREMO_GROUP_ID || '';

// ====== INICIALIZAÇÃO ======
const db = Database;

// ✅ CORREÇÃO: Configuração SIMPLES que funciona
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'paredao-bot',
    dataPath: './.wwebjs_auth'
  }),
puppeteer: { 
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
}
});

const manager = new GameManager(client);
const supremoCommands = new SupremoCommands(client, manager);
let isReady = false;

// ====== EVENTOS DO CLIENTE ======
client.on('qr', qr => {
  console.log('====================================');
  console.log('📸 QR Code gerado - escaneie com WhatsApp');
  console.log('====================================');
  qrcode.generate(qr, { small: true });
  console.log('====================================');
});

client.on('ready', () => {
  isReady = true;
  console.log('====================================');
  console.log('🤖 BOT DO PAREDÃO PRONTO PARA AÇÃO!');
  console.log('====================================');
  console.log(`👑 SUPREMO DM: ${SUPREMO_ID || 'NÃO CONFIGURADO'}`);
  console.log(`👑 SUPREMO GRUPO: ${SUPREMO_GROUP_ID || 'NÃO CONFIGURADO'}`);
  console.log('====================================');
});

client.on('authenticated', () => {
  console.log('✅ Autenticado!');
});

client.on('auth_failure', err => {
  console.error('❌ Falha na autenticação:', err.message);
});

client.on('disconnected', (reason) => {
  console.log('🔌 Desconectado:', reason);
  isReady = false;
  console.log('🔄 Reinicie o bot manualmente');
  process.exit(0);
});

// ====== FUNÇÕES AUXILIARES ======
async function getSafeName(id) {
  try {
    const player = await db.findPlayerByAnyId(id);
    if (player?.name) return player.name;
    
    const contact = await client.getContactById(id).catch(() => null);
    return contact?.pushname || contact?.name || id.split('@')[0];
  } catch (error) {
    return id.split('@')[0];
  }
}

async function mentionAllGroupMembers(chat, excludeIds = []) {
  try {
    const participants = await chat.participants;
    const mentions = [];
    
    for (const participant of participants) {
      const participantId = participant.id._serialized;
      
      if (participantId.includes('@bot') || excludeIds.includes(participantId)) {
        continue;
      }
      
      try {
        const contact = await client.getContactById(participantId);
        if (contact) mentions.push(contact);
      } catch (error) {
        console.log(`⚠️ Não consegui contato para ${participantId}`);
      }
    }
    
    return mentions;
  } catch (error) {
    console.error('❌ Erro ao obter membros:', error.message);
    return [];
  }
}

async function mentionPlayers(chat, playerIds) {
  try {
    const mentions = [];
    for (const playerId of playerIds) {
      try {
        const contact = await client.getContactById(playerId);
        if (contact) mentions.push(contact);
      } catch (error) {
        console.log(`⚠️ Não consegui contato para ${playerId}`);
      }
    }
    return mentions;
  } catch (error) {
    console.error('❌ Erro ao mencionar:', error.message);
    return [];
  }
}

// ====== HANDLER DE MENSAGENS ======
client.on('message', async (msg) => {
  if (!isReady || msg.fromMe) return;

  try {
    const chat = await msg.getChat();
    const senderId = msg.author || msg.from;
    const text = (msg.body || '').trim();

    console.log(`📩 ${senderId}: ${text.substring(0, 50)}...`);

    // ====== COMANDOS DO SUPREMO ======
    if (chat.isGroup && text.startsWith('!')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      
      // Comando de ajuda do Supremo
      if (command === '!helpsupremo') {
        await supremoCommands.helpSupremo(chat, senderId);
        return;
      }
      
      // Comando de ban
      if (command === '!ban') {
        if (msg.mentionedIds && msg.mentionedIds.length > 0) {
          await supremoCommands.banMember(chat, senderId, msg.mentionedIds[0]);
        } else {
          await chat.sendMessage("❌ Use: !ban @membro");
        }
        return;
      }
      
      // Comando de ban aleatório
      if (command === '!randomban') {
        await supremoCommands.randomBan(chat, senderId);
        return;
      }
      
      // Comando de poder
      if (command === '!poder') {
        await supremoCommands.showPower(chat, senderId);
        return;
      }
      
      // Comando de humilhação
      if (command === '!humilhar') {
        if (msg.mentionedIds && msg.mentionedIds.length > 0) {
          await supremoCommands.humiliate(chat, senderId, msg.mentionedIds[0]);
        } else {
          await chat.sendMessage("❌ Use: !humilhar @alvo");
        }
        return;
      }
      
      // Comando de elogio falso
      if (command === '!elogiofake') {
        if (msg.mentionedIds && msg.mentionedIds.length > 0) {
          await supremoCommands.fakePraise(chat, senderId, msg.mentionedIds[0]);
        } else {
          await chat.sendMessage('❌ Use: !elogiofake @alvo');
        }
        return;
      }
      
      // Comando de pegadinha
      if (command === '!pegadinha') {
        if (msg.mentionedIds && msg.mentionedIds.length > 0) {
          await supremoCommands.prank(chat, senderId, msg.mentionedIds[0]);
        } else {
          await chat.sendMessage("❌ Use: !pegadinha @alvo");
        }
        return;
      }
      
      // Comando de erro fake
      if (command === '!fakeerror') {
        await supremoCommands.fakeError(chat, senderId);
        return;
      }
      
      // Comando de anúncio
      if (command === '!announce') {
        await supremoCommands.dramaticAnnouncement(chat, senderId);
        return;
      }
      
      // Comando de votação fake
      if (command === '!voteban') {
        if (msg.mentionedIds && msg.mentionedIds.length > 0) {
          await supremoCommands.fakeVoteBan(chat, senderId, msg.mentionedIds[0]);
        } else {
          await chat.sendMessage('❌ Use: !voteban @alvo');
        }
        return;
      }
      
      // Comando para listar subordinados
      if (command === '!listasubordinados') {
        await supremoCommands.listSubordinates(chat, senderId);
        return;
      }
    }

    // ====== DM (MENSAGENS PRIVADAS) ======
    if (!chat.isGroup) {
      const player = await db.findPlayerByAnyId(senderId);
      
      if (!player) {
        const activeGame = await db.query(`
          SELECT g.id, g.group_id FROM games g 
          WHERE g.status = 'active' 
          ORDER BY g.id DESC LIMIT 1
        `);
        
        if (activeGame.rows.length === 0) {
          await msg.reply('❌ Nenhum paredão ativo.');
          return;
        }
        
        if (text && text.length > 0 && !msg.hasQuotedMsg) {
          const result = await manager.receiveQuestion(senderId, activeGame.rows[0].group_id, text);
          if (result.success) {
            const confirmation = result.anonymous 
              ? '✅ *Pergunta enviada (anônima)*' 
              : '✅ *Pergunta enviada (identificada)*';
            await msg.reply(confirmation);
          } else if (result.error) {
            await msg.reply(result.error);
          }
        }
        return;
      }

      // RESPOSTAS A PERGUNTAS
      if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        const quotedId = quotedMsg.id?._serialized;
        
        if (quotedId) {
          const result = await manager.processAnswer(senderId, quotedId, text);
          if (result.success) {
            await msg.reply('✅ Resposta enviada ao grupo!');
          } else if (result.error) {
            await msg.reply(result.error);
          }
          return;
        }
      }

      // MENSAGEM NORMAL NO DM
      if (text && text.length > 0) {
        const activeTurnRes = await db.query(`
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
            return;
          } else {
            const result = await manager.receiveQuestion(senderId, game.group_id, text);
            if (result.success) {
              const confirmation = result.anonymous 
                ? '✅ *Pergunta enviada (anônima)*' 
                : '✅ *Pergunta enviada (identificada)*';
              await msg.reply(confirmation);
            } else if (result.error) {
              await msg.reply(result.error);
            }
            return;
          }
        } else {
          const anyActiveGame = await db.query(`
            SELECT id, group_id FROM games WHERE status = 'active' ORDER BY id DESC LIMIT 1
          `);
          
          if (anyActiveGame.rows.length > 0) {
            const result = await manager.receiveQuestion(senderId, anyActiveGame.rows[0].group_id, text);
            if (result.success) {
              const confirmation = result.anonymous 
                ? '✅ *Pergunta enviada (anônima)*' 
                : '✅ *Pergunta enviada (identificada)*';
              await msg.reply(confirmation);
            } else if (result.error) {
              await msg.reply(result.error);
            }
          } else {
            await msg.reply('❌ Nenhum paredão ativo.');
          }
        }
      }
      return;
    }

    // ====== COMANDOS DO PAREDÃO NO GRUPO ======
    if (chat.isGroup && text.startsWith('!')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      console.log(`🎮 Comando: ${command}`);

      // COMANDOS PÚBLICOS
      if (command === '!ping') {
        await msg.reply('🏓 Pong!');
        return;
      }

      if (command === '!comandos' || command === '!help') {
        const helpText = `🤖 *COMANDOS DO PAREDÃO* 🤖\n\n` +
          `*PÚBLICOS:*\n` +
          `!entrar NUMERO NOME - Entrar\n` +
          `!sair - Sair\n` +
          `!minhaordem - Ver posição\n` +
          `!status - Status\n` +
          `!comandos - Esta lista\n\n` +
          `*ADMIN:*\n` +
          `!iniciarparedao - Novo paredão\n` +
          `!sortear - Sortear ordem\n` +
          `!comecar - Começar\n` +
          `!proximoturno - Próximo turno\n` +
          `!skipturno - Pular turno\n` +
          `!encerrarturno - Encerrar turno\n` +
          `!forcarentrar @ - Adicionar\n` +
          `!remover @ - Remover\n` +
          `!finalizar - Finalizar\n` +
          `!admin @ - Promover admin\n` +
          `!removeradmin @ - Remover admin`;
        
        await msg.reply(helpText);
        return;
      }

      if (command === '!entrar') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Use !iniciarparedao primeiro');
          return;
        }

        if (game.status !== 'waiting') {
          await msg.reply('❌ Jogo já começou!');
          return;
        }

        try {
          const isSupremo = await manager.isSupremo(senderId);
          
          if (isSupremo) {
            const playerInfo = await manager.registerPlayer(game.id, senderId, '', '');
            await msg.reply(`✅ ${playerInfo.name} entrou! Posição: ${playerInfo.order}º`);
            return;
          }
          
          if (args.length < 2) {
            await msg.reply('❌ Formato: !entrar NUMERO NOME\nEx: !entrar 258866630883 João');
            return;
          }
          
          const phoneNumber = args[0];
          const playerName = args.slice(1).join(' ');
          
          const playerInfo = await manager.registerPlayer(game.id, senderId, phoneNumber, playerName);
          
          // DM de confirmação
          try {
            let dmChat = null;
            if (playerInfo.dmId) {
              dmChat = await client.getChatById(playerInfo.dmId).catch(() => null);
            }
            
            if (!dmChat) {
              dmChat = await client.getChatById(senderId).catch(() => null);
            }
            
            if (dmChat) {
              await dmChat.sendMessage(
                `✅ *Você entrou no Paredão!*\n\n` +
                `📌 Grupo: ${chat.name}\n` +
                `🎮 Jogo: #${game.id}\n` +
                `📋 Posição: ${playerInfo.order}º`
              );
            }
          } catch (dmError) {
            console.log('⚠️ Não foi possível enviar DM');
          }

          await msg.reply(`✅ ${playerInfo.name} entrou! Posição: ${playerInfo.order}º`);
          
        } catch (error) {
          if (error.message.includes('já está')) {
            await msg.reply('❌ Você já está no paredão!');
          } else if (error.message.includes('Número inválido')) {
            await msg.reply('❌ ' + error.message);
          } else if (error.message.includes('Digite seu nome')) {
            await msg.reply('❌ ' + error.message);
          } else {
            console.error('Erro no !entrar:', error);
            await msg.reply('❌ Erro ao entrar');
          }
        }
        return;
      }

      if (command === '!sair') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        if (game.current_player_id === senderId) {
          await msg.reply('❌ Não pode sair durante turno!');
          return;
        }

        try {
          await manager.removePlayer(game.id, senderId);
          await msg.reply('🏳️ Você saiu');
        } catch (error) {
          await msg.reply('❌ Você não está');
        }
        return;
      }

      if (command === '!minhaordem') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        const orderInfo = await manager.getPlayerOrder(game.id, senderId);
        
        if (!orderInfo) {
          await msg.reply('❌ Você não está. Use !entrar');
          return;
        }

        let response = `📋 *POSIÇÃO:* ${orderInfo.position}º de ${orderInfo.total}\n`;
        
        if (senderId === game.current_player_id) {
          response += '🎤 *VOCÊ ESTÁ NO PAREDÃO!*';
        } else if (orderInfo.position === 1 && !game.current_player_id) {
          response += '⏭️ *Você é o próximo!*';
        } else if (orderInfo.position > 1) {
          response += `⏳ *Faltam ${orderInfo.position - 1} turnos*`;
        }

        await msg.reply(response);
        return;
      }

      if (command === '!status') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        const status = await manager.getGameStatus(game.id);
        
        let statusText = `🎮 *PAREDÃO #${game.id}*\n`;
        statusText += `📊 ${status.statusText}\n`;
        statusText += `👥 ${status.totalPlayers} jogadores\n`;

        if (status.currentPlayer) {
          statusText += `\n🎤 *ATUAL:* ${status.currentPlayer.name}`;
        }

        statusText += `\n\n📋 *ORDEM:*\n`;
        status.players.forEach((player, index) => {
          const indicator = player.id === game.current_player_id ? '🎤' : 
                          index === 0 && !game.current_player_id ? '⏭️' : 
                          `${index + 1}º`;
          statusText += `${indicator} ${player.name}\n`;
        });

        await msg.reply(statusText);
        return;
      }

      // ====== COMANDOS DE ADMIN ======
      const isAdmin = await manager.isAdmin(senderId);
      const isSupremo = await manager.isSupremo(senderId);

      if (!isAdmin && !isSupremo) {
        const adminCommands = [
          '!iniciarparedao', '!sortear', '!comecar', '!proximoturno', 
          '!skipturno', '!encerrarturno', '!forcarentrar', '!remover', 
          '!finalizar', '!admin', '!removeradmin'
        ];

        if (adminCommands.includes(command)) {
          await msg.reply('❌ Apenas administradores');
          return;
        }
      }

      if (command === '!iniciarparedao') {
        const existingGame = await manager.getActiveGame(chat.id._serialized);
        
        if (existingGame && existingGame.status !== 'finished') {
          await msg.reply('❌ Já existe um paredão');
          return;
        }

        const gameId = await manager.createGame(chat.id._serialized);
        
        // Marcar todos os membros
        try {
          const mentions = await mentionAllGroupMembers(chat, [senderId]);
          
          let announcement = `🎮 *NOVO PAREDÃO #${gameId}!*\n\n`;
          
          if (mentions.length > 0) {
            const mentionNames = [];
            for (const contact of mentions) {
              const firstName = contact.name?.split(' ')[0] || contact.pushname?.split(' ')[0] || 'Amigo';
              mentionNames.push(`@${firstName}`);
            }
            
            announcement += `🎯 *CONVITE PARA TODOS:*\n`;
            announcement += `${mentionNames.join(' ')}\n\n`;
          }
          
          announcement += `📝 *PARA PARTICIPAR:*\n` +
            `!entrar NUMERO SEU_NOME\n` +
            `Ex: !entrar 258866630883 João`;
          
          if (mentions.length > 0) {
            await chat.sendMessage(announcement, { mentions });
          } else {
            await chat.sendMessage(announcement);
          }
          
        } catch (error) {
          console.error('❌ Erro ao marcar:', error.message);
          await chat.sendMessage(
            `🎮 *NOVO PAREDÃO #${gameId}!*\n\n` +
            `Use !entrar NUMERO NOME para participar`
          );
        }

        await msg.reply(`✅ Paredão #${gameId} iniciado!`);
        return;
      }

      if (command === '!sortear') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        if (game.status !== 'waiting') {
          await msg.reply('❌ Jogo já começou!');
          return;
        }

        const shuffledPlayers = await manager.shufflePlayers(game.id);
        
        let resultText = '🎲 *ORDEM SORTEADA*\n\n';
        shuffledPlayers.forEach((player, index) => {
          resultText += `${index + 1}º ${player.name}\n`;
        });

        resultText += `\n✅ Use !comecar`;

        await msg.reply(resultText);
        return;
      }

      if (command === '!comecar') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        if (game.status !== 'waiting') {
          await msg.reply('❌ Jogo já começou!');
          return;
        }

        const players = await db.getGamePlayers(game.id);
        
        if (players.length === 0) {
          await msg.reply('❌ Nenhum jogador');
          return;
        }

        const firstPlayer = players[0];
        
        // Marcar primeiro jogador
        try {
          const contact = await client.getContactById(firstPlayer.id).catch(() => null);
          
          let announcement = `🔥 *VAMOS COMEÇAR!*\n\n`;
          
          if (contact) {
            announcement += `🎤 Primeiro: @${firstPlayer.name.split(' ')[0]}\n`;
          } else {
            announcement += `🎤 Primeiro: ${firstPlayer.name}\n`;
          }
          
          if (contact) {
            await chat.sendMessage(announcement, { mentions: [contact] });
          } else {
            await chat.sendMessage(announcement);
          }
          
        } catch (error) {
          await msg.reply(`🔥 *COMEÇANDO!* ${firstPlayer.name}`);
        }
        
        await manager.startTurn(game.id, chat.id._serialized, firstPlayer);
        return;
      }

      if (command === '!proximoturno') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        const result = await manager.nextTurn(game.id, chat.id._serialized);
        
        if (result.success) {
          try {
            const contact = await client.getContactById(result.player.id).catch(() => null);
            
            let announcement = `⏭️ *PRÓXIMO TURNO*\n\n`;
            
            if (contact) {
              announcement += `🎤 Agora: @${result.player.name.split(' ')[0]}\n`;
            } else {
              announcement += `🎤 Agora: ${result.player.name}\n`;
            }
            
            if (contact) {
              await chat.sendMessage(announcement, { mentions: [contact] });
            } else {
              await chat.sendMessage(announcement);
            }
            
          } catch (error) {
            await msg.reply(`⏭️ *PRÓXIMO:* ${result.player.name}`);
          }
        } else if (result.error) {
          await msg.reply(`❌ ${result.error}`);
        }
        return;
      }

      if (command === '!skipturno') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        const result = await manager.skipTurn(game.id, chat.id._serialized);
        
        if (result.success) {
          try {
            const contact = await client.getContactById(result.player.id).catch(() => null);
            
            let announcement = `⏩ *TURNO PULADO*\n\n`;
            
            if (contact) {
              announcement += `🎤 Próximo: @${result.player.name.split(' ')[0]}\n`;
            } else {
              announcement += `🎤 Próximo: ${result.player.name}\n`;
            }
            
            if (contact) {
              await chat.sendMessage(announcement, { mentions: [contact] });
            } else {
              await chat.sendMessage(announcement);
            }
            
          } catch (error) {
            await msg.reply(`⏩ *PULADO!* Próximo: ${result.player.name}`);
          }
        } else if (result.error) {
          await msg.reply(`❌ ${result.error}`);
        }
        return;
      }

      if (command === '!encerrarturno') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        if (!game.current_player_id) {
          await msg.reply('❌ Nenhum turno ativo');
          return;
        }

        const result = await manager.endTurn(game.id, chat.id._serialized);
        if (result) {
          await msg.reply(`⏹️ *Turno encerrado!*`);
        }
        return;
      }

      if (command === '!forcarentrar') {
        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
          await msg.reply('❌ Use: !forcarentrar @membro');
          return;
        }

        const targetId = msg.mentionedIds[0];
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        try {
          const name = await getSafeName(targetId);
          const playerInfo = await manager.forceAddPlayer(game.id, targetId, name);
          await msg.reply(`✅ ${playerInfo.name} adicionado! Posição: ${playerInfo.order}º`);
        } catch (error) {
          console.error('Erro:', error);
          await msg.reply('❌ Erro ao adicionar');
        }
        return;
      }

      if (command === '!remover') {
        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
          await msg.reply('❌ Use: !remover @membro');
          return;
        }

        const targetId = msg.mentionedIds[0];
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        if (game.current_player_id === targetId) {
          await msg.reply('❌ Não pode remover durante turno');
          return;
        }

        try {
          await manager.removePlayer(game.id, targetId);
          await msg.reply('✅ Jogador removido');
        } catch (error) {
          await msg.reply('❌ Erro ao remover');
        }
        return;
      }

      if (command === '!finalizar') {
        const game = await manager.getActiveGame(chat.id._serialized);
        
        if (!game) {
          await msg.reply('❌ Nenhum paredão');
          return;
        }

        await manager.finishGame(game.id, chat.id._serialized);
        
        const players = await db.getGamePlayers(game.id);
        if (players.length > 0) {
          const mentions = await mentionPlayers(chat, players.map(p => p.id));
          
          let finalMessage = `🏁 *PAREDÃO #${game.id} FINALIZADO!*\n\n`;
          finalMessage += `🎉 *OBRIGADO A TODOS!*\n\n`;
          
          if (mentions.length > 0) {
            const mentionNames = [];
            for (const contact of mentions) {
              const firstName = contact.name?.split(' ')[0] || contact.pushname?.split(' ')[0] || 'Jogador';
              mentionNames.push(`@${firstName}`);
            }
            
            finalMessage += `👏 *PARABÉNS:*\n`;
            finalMessage += `${mentionNames.join(' ')}\n\n`;
          }
          
          
          
          if (mentions.length > 0) {
            await chat.sendMessage(finalMessage, { mentions });
          } else {
            await chat.sendMessage(finalMessage);
          }
        } else {
          await msg.reply('🏁 *PAREDÃO FINALIZADO!*');
        }
        return;
      }

      if (command === '!admin') {
        if (!isSupremo) {
          await msg.reply('❌ Apenas SUPREMO');
          return;
        }

        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
          await msg.reply('❌ Use: !admin @membro');
          return;
        }

        const targetId = msg.mentionedIds[0];
        await db.promoteToAdmin(targetId);
        
        const name = await getSafeName(targetId);
        await msg.reply(`🛡️ ${name} promovido a admin`);
        return;
      }

      if (command === '!removeradmin') {
        if (!isSupremo) {
          await msg.reply('❌ Apenas SUPREMO');
          return;
        }

        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
          await msg.reply('❌ Use: !removeradmin @membro');
          return;
        }

        const targetId = msg.mentionedIds[0];
        
        if (await manager.isSupremo(targetId)) {
          await msg.reply('❌ Não pode remover SUPREMO');
          return;
        }

        await db.demoteAdmin(targetId);
        
        const name = await getSafeName(targetId);
        await msg.reply(`🛡️ ${name} removido como admin`);
        return;
      }

      // COMANDO NÃO RECONHECIDO
      await msg.reply('❌ Comando não reconhecido. Use !comandos');
    }

  } catch (error) {
    console.error('❌ Erro no handler:', error);
    try {
      await msg.reply('❌ Ocorreu um erro');
    } catch (replyError) {
      console.error('❌ Erro ao enviar mensagem:', replyError);
    }
  }
});

// ====== EVENTOS DO GRUPO ======
client.on('group_join', async (notification) => {
  console.log(`👥 ${notification.id} entrou no grupo`);
});

client.on('group_leave', async (notification) => {
  console.log(`👥 ${notification.id} saiu do grupo`);
  
  try {
    const game = await manager.getActiveGame(notification.chatId);
    if (game) {
      await manager.removePlayer(game.id, notification.id);
    }
  } catch (error) {
    console.error('Erro ao remover:', error);
  }
});

// ====== INICIALIZAÇÃO ======
(async () => {
  try {
    await db.connect();
    
    console.log('====================================');
    console.log('🤖 INICIANDO BOT DO PAREDÃO...');
    console.log('====================================');
    console.log('🔁 Aguardando conexão...');
    
    client.initialize();
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
})();

// ====== SHUTDOWN ======
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando bot...');
  
  manager.timers.forEach((timer, groupId) => {
    clearInterval(timer);
  });
  
  if (db.pg) {
    await db.pg.end();
    console.log('🗄️ Banco desconectado');
  }
  
  try {
    await client.destroy();
  } catch (error) {
    console.log('⚠️ Erro ao encerrar:', error.message);
  }
  
  console.log('👋 Bot desligado');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});


// require('dotenv').config();
// const { Client, LocalAuth } = require('whatsapp-web.js');
// const qrcode = require('qrcode-terminal');
// const Database = require('./database');
// const GameManager = require('./game-manager');

// // ====== CONFIGURAÇÕES ======
// const SUPREMO_ID = process.env.SUPREMO_ID || '';
// const SUPREMO_GROUP_ID = process.env.SUPREMO_GROUP_ID || '';

// // ====== INICIALIZAÇÃO ======
// const db = Database;
// const client = new Client({
//   authStrategy: new LocalAuth({ clientId: 'paredao-bot', dataPath: './.wwebjs_auth' }),
//   puppeteer: { 
//     headless: 'new', 
//     args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
//   }
// });

// const manager = new GameManager(client);
// let isReady = false;

// // ====== EVENTOS DO CLIENTE ======
// client.on('qr', qr => {
//   qrcode.generate(qr, { small: true });
//   console.log('📸 QR Code gerado - escaneie com WhatsApp');
// });

// client.on('ready', () => {
//   isReady = true;
//   console.log('====================================');
//   console.log('🤖 BOT DO PAREDÃO PRONTO PARA AÇÃO!');
//   console.log('====================================');
//   console.log(`👑 SUPREMO DM: ${SUPREMO_ID || 'NÃO CONFIGURADO'}`);
//   console.log(`👑 SUPREMO GRUPO: ${SUPREMO_GROUP_ID || 'NÃO CONFIGURADO'}`);
//   console.log('====================================');
// });

// client.on('authenticated', () => console.log('🔐 Autenticado'));
// client.on('auth_failure', err => console.error('❌ Falha na auth:', err));
// client.on('disconnected', reason => {
//   console.log('🔌 Desconectado:', reason);
//   process.exit(0);
// });

// // ====== FUNÇÕES AUXILIARES ======
// async function getSafeName(id) {
//   try {
//     const player = await db.findPlayerByAnyId(id);
//     if (player?.name) return player.name;
    
//     const contact = await client.getContactById(id).catch(() => null);
//     return contact?.pushname || contact?.name || id.split('@')[0];
//   } catch (error) {
//     return id.split('@')[0];
//   }
// }

// // ====== HANDLER DE MENSAGENS ======
// client.on('message', async (msg) => {
//   if (!isReady || msg.fromMe) return;

//   try {
//     const chat = await msg.getChat();
//     const senderId = msg.author || msg.from;
//     const text = (msg.body || '').trim();

//     console.log(`📩 Mensagem de ${senderId}: ${text.substring(0, 50)}...`);

//     // ====== DM (MENSAGENS PRIVADAS) ======
//     if (!chat.isGroup) {
//       // IGNORAR MENSAGENS DE OUTROS GRUPOS (APENAS DO GRUPO DO PAREDÃO)
//       // Verificar se o remetente está em algum jogo ativo
//       const player = await db.findPlayerByAnyId(senderId);
//       if (!player) {
//         // Não é jogador registrado, verificar se é uma pergunta para algum jogo
//         const activeGame = await db.query(`
//           SELECT g.id, g.group_id FROM games g 
//           WHERE g.status = 'active' 
//           ORDER BY g.id DESC LIMIT 1
//         `);
        
//         if (activeGame.rows.length === 0) {
//           // Não há jogo ativo
//           await msg.reply('❌ Nenhum paredão ativo no momento.');
//           return;
//         }
        
//         // É uma pergunta de alguém não registrado
//         if (text && text.length > 0 && !msg.hasQuotedMsg) {
//           const result = await manager.receiveQuestion(senderId, activeGame.rows[0].group_id, text);
//           if (result.success) {
//             // ENVIAR CONFIRMAÇÃO COMO RESPOSTA À MENSAGEM ORIGINAL
//             const confirmation = result.anonymous 
//               ? '✅ *Pergunta enviada (anônima)*' 
//               : '✅ *Pergunta enviada (identificada)*';
//             await msg.reply(confirmation);
//           } else if (result.error) {
//             await msg.reply(result.error);
//           }
//         }
//         return;
//       }

//       // JOGADOR REGISTRADO
//       // RESPOSTAS A PERGUNTAS (COM REPLY)
//       if (msg.hasQuotedMsg) {
//         const quotedMsg = await msg.getQuotedMessage();
//         const quotedId = quotedMsg.id?._serialized;
        
//         if (quotedId) {
//           const result = await manager.processAnswer(senderId, quotedId, text);
//           if (result.success) {
//             await msg.reply('✅ Resposta enviada ao grupo!');
//           } else if (result.error) {
//             await msg.reply(result.error);
//           }
//           return;
//         }
//       }

//       // MENSAGEM NORMAL NO DM (NÃO É RESPOSTA)
//       if (text && text.length > 0) {
//         // Verificar se o jogador está em um turno ativo
//         const activeTurnRes = await db.query(`
//           SELECT g.id, g.group_id, g.current_player_id 
//           FROM games g 
//           JOIN game_players gp ON g.id = gp.game_id 
//           WHERE gp.player_id = $1 AND g.status = 'active'
//           LIMIT 1
//         `, [player.id]);
        
//         if (activeTurnRes.rows.length > 0) {
//           const game = activeTurnRes.rows[0];
          
//           // Se o jogador é o atual no paredão
//           if (game.current_player_id === player.id) {
//             // É o jogador no paredão enviando mensagem sem responder
//             await msg.reply(
//               `ℹ️ *PARA RESPONDER A UMA PERGUNTA:*\n\n` +
//               `1. Toque e segure na pergunta\n` +
//               `2. Selecione "Responder"\n` +
//               `3. Digite sua resposta\n` +
//               `4. Envie\n\n` +
//               `📤 *Sua resposta será publicada automaticamente no grupo*`
//             );
//             return;
//           } else {
//             // É outro jogador tentando enviar pergunta
//             const result = await manager.receiveQuestion(senderId, game.group_id, text);
//             if (result.success) {
//               const confirmation = result.anonymous 
//                 ? '✅ *Pergunta enviada (anônima)*' 
//                 : '✅ *Pergunta enviada (identificada)*';
//               await msg.reply(confirmation);
//             } else if (result.error) {
//               await msg.reply(result.error);
//             }
//             return;
//           }
//         } else {
//           // Jogador não está em turno ativo, verificar se há algum jogo ativo
//           const anyActiveGame = await db.query(`
//             SELECT id, group_id FROM games WHERE status = 'active' ORDER BY id DESC LIMIT 1
//           `);
          
//           if (anyActiveGame.rows.length > 0) {
//             // Enviar pergunta para o jogo ativo
//             const result = await manager.receiveQuestion(senderId, anyActiveGame.rows[0].group_id, text);
//             if (result.success) {
//               const confirmation = result.anonymous 
//                 ? '✅ *Pergunta enviada (anônima)*' 
//                 : '✅ *Pergunta enviada (identificada)*';
//               await msg.reply(confirmation);
//             } else if (result.error) {
//               await msg.reply(result.error);
//             }
//           } else {
//             await msg.reply('❌ Nenhum paredão ativo no momento.');
//           }
//         }
//       }
      
//       return;
//     }

//     // ====== COMANDOS NO GRUPO ======
//     if (chat.isGroup && text.startsWith('!')) {
//       const parts = text.split(' ');
//       const command = parts[0].toLowerCase();
//       const args = parts.slice(1);

//       console.log(`🎮 Comando no grupo: ${command} por ${senderId}`);

//       // ====== COMANDOS PÚBLICOS ======
//       if (command === '!ping') {
//         await msg.reply('🏓 Pong! Bot do Paredão online!');
//         return;
//       }

//       if (command === '!comandos' || command === '!help') {
//         const helpText = `🤖 *COMANDOS DO PAREDÃO* 🤖\n\n` +
//           `*PÚBLICOS:*\n` +
//           `!entrar NUMERO NOME - Entrar no paredão\n` +
//           `  Exemplo: !entrar 258866630883 João Silva\n` +
//           `!sair - Sair do paredão\n` +
//           `!minhaordem - Ver sua posição\n` +
//           `!status - Status do jogo\n` +
//           `!comandos - Esta mensagem\n\n` +
//           `*ADMIN/SUPREMO:*\n` +
//           `!iniciarparedao - Iniciar novo paredão\n` +
//           `!sortear - Sortear ordem\n` +
//           `!comecar - Começar primeiro turno\n` +
//           `!proximoturno - Iniciar próximo turno\n` +
//           `!skipturno - Pular turno atual\n` +
//           `!encerrarturno - Encerrar turno atual\n` +
//           `!forcarentrar @membro - Adicionar jogador\n` +
//           `!remover @membro - Remover jogador\n` +
//           `!finalizar - Finalizar paredão\n` +
//           `!admin @membro - Promover a admin\n` +
//           `!removeradmin @membro - Remover admin\n\n` +
//           `*COMO JOGAR:*\n` +
//           `1. !entrar SEU_NUMERO SEU_NOME\n` +
//           `2. Aguarde seu turno\n` +
//           `3. Receba perguntas no DM\n` +
//           `4. Responda usando "Responder"\n` +
//           `5. Resposta vai pro grupo`;
        
//         await msg.reply(helpText);
//         return;
//       }

//       if (command === '!entrar') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo. Use !iniciarparedao para começar.');
//           return;
//         }

//         if (game.status !== 'waiting') {
//           await msg.reply('❌ O jogo já começou! Aguarde o próximo.');
//           return;
//         }

//         try {
//           // VERIFICAR SE É SUPREMO
//           const isSupremo = await manager.isSupremo(senderId);
          
//           if (isSupremo) {
//             // SUPREMO ENTRA AUTOMATICAMENTE
//             const playerInfo = await manager.registerPlayer(game.id, senderId, '', '');
//             await msg.reply(`✅ ${playerInfo.name} entrou automaticamente! Posição: ${playerInfo.order}º`);
//             return;
//           }
          
//           // JOGADOR NORMAL: PRECISA DE NÚMERO E NOME
//           if (args.length < 2) {
//             await msg.reply(
//               '❌ *Formato correto:* !entrar NUMERO NOME\n\n' +
//               '*Exemplo:* !entrar 258866630883 João Silva\n' +
//               '*Dica:* O número deve ter 12 dígitos'
//             );
//             return;
//           }
          
//           const phoneNumber = args[0];
//           const playerName = args.slice(1).join(' ');
          
//           const playerInfo = await manager.registerPlayer(game.id, senderId, phoneNumber, playerName);
          
//           // TENTAR ENVIAR CONFIRMAÇÃO POR DM
//           try {
//             let dmChat = null;
//             if (playerInfo.dmId) {
//               dmChat = await client.getChatById(playerInfo.dmId).catch(() => null);
//             }
            
//             if (!dmChat) {
//               dmChat = await client.getChatById(senderId).catch(() => null);
//             }
            
//             if (dmChat) {
//               await dmChat.sendMessage(
//                 `✅ *Você entrou no Paredão!*\n\n` +
//                 `📌 Grupo: ${chat.name}\n` +
//                 `🎮 Jogo: #${game.id}\n` +
//                 `📋 Posição: ${playerInfo.order}º\n\n` +
//                 `🏃 Use !sair para sair (antes do jogo começar)\n` +
//                 `📋 Use !minhaordem para ver sua posição`
//               );
//             }
//           } catch (dmError) {
//             console.log('⚠️ Não foi possível enviar DM de confirmação');
//           }

//           await msg.reply(`✅ ${playerInfo.name} entrou no paredão! Posição: ${playerInfo.order}º`);
          
//         } catch (error) {
//           if (error.message.includes('já está')) {
//             await msg.reply('❌ Você já está no paredão!');
//           } else if (error.message.includes('Número inválido')) {
//             await msg.reply('❌ ' + error.message + '\nExemplo: !entrar 258866630883 João');
//           } else if (error.message.includes('Digite seu nome')) {
//             await msg.reply('❌ ' + error.message + '\nExemplo: !entrar 258866630883 João');
//           } else {
//             console.error('Erro no !entrar:', error);
//             await msg.reply('❌ Erro ao entrar no paredão');
//           }
//         }
//         return;
//       }

//       if (command === '!sair') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         if (game.current_player_id === senderId) {
//           await msg.reply('❌ Você não pode sair durante seu turno!');
//           return;
//         }

//         try {
//           await manager.removePlayer(game.id, senderId);
//           await msg.reply('🏳️ Você saiu do paredão');
//         } catch (error) {
//           await msg.reply('❌ Você não está no paredão');
//         }
//         return;
//       }

//       if (command === '!minhaordem') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         const orderInfo = await manager.getPlayerOrder(game.id, senderId);
        
//         if (!orderInfo) {
//           await msg.reply('❌ Você não está no paredão. Use !entrar para participar.');
//           return;
//         }

//         let response = `📋 *SUA POSIÇÃO:* ${orderInfo.position}º de ${orderInfo.total}\n\n`;
        
//         if (senderId === game.current_player_id) {
//           response += '🎤 *VOCÊ ESTÁ NO PAREDÃO AGORA!*\n';
//           response += '💬 Responda às perguntas no meu privado';
//         } else if (orderInfo.position === 1 && !game.current_player_id) {
//           response += '⏭️ *Você é o próximo!*\n';
//           response += 'O jogo começará em breve';
//         } else if (orderInfo.position > 1) {
//           const turnsAhead = orderInfo.position - 1;
//           response += `⏳ *Faltam ${turnsAhead} ${turnsAhead === 1 ? 'turno' : 'turnos'}*\n`;
//           response += 'Aguarde sua vez';
//         }

//         await msg.reply(response);
//         return;
//       }

//       if (command === '!status') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo neste grupo');
//           return;
//         }

//         const status = await manager.getGameStatus(game.id);
        
//         let statusText = `🎮 *PAREDÃO #${game.id}* 🎮\n\n`;
//         statusText += `📊 Status: ${game.status === 'waiting' ? '🕒 Aguardando' : '🎤 Em andamento'}\n`;
//         statusText += `👥 Jogadores: ${status.totalPlayers}\n\n`;

//         if (status.currentPlayer) {
//           statusText += `🎤 *NO PAREDÃO AGORA:* ${status.currentPlayer.name}\n`;
//           statusText += `⏰ Turno ativo\n\n`;
//         }

//         statusText += `📋 *ORDEM DOS JOGADORES:*\n`;
//         status.players.forEach((player, index) => {
//           const indicator = player.id === game.current_player_id ? '🎤' : 
//                           index === 0 && !game.current_player_id ? '⏭️' : 
//                           `${index + 1}º`;
//           statusText += `${indicator} ${player.name}\n`;
//         });

//         if (game.status === 'waiting') {
//           statusText += `\n💡 Use !entrar NUMERO NOME para participar`;
//         } else {
//           statusText += `\n⏰ Use !encerrarturno para finalizar este turno`;
//         }

//         await msg.reply(statusText);
//         return;
//       }

//       // ====== COMANDOS DE ADMIN ======
//       const isAdmin = await manager.isAdmin(senderId);
//       const isSupremo = await manager.isSupremo(senderId);

//       if (!isAdmin && !isSupremo) {
//         const adminCommands = [
//           '!iniciarparedao', '!sortear', '!comecar', '!proximoturno', 
//           '!skipturno', '!encerrarturno', '!forcarentrar', '!remover', 
//           '!finalizar', '!admin', '!removeradmin'
//         ];

//         if (adminCommands.includes(command)) {
//           await msg.reply('❌ Apenas administradores podem usar este comando');
//           return;
//         }
//       }

//       if (command === '!iniciarparedao') {
//         const existingGame = await manager.getActiveGame(chat.id._serialized);
        
//         if (existingGame && existingGame.status !== 'finished') {
//           await msg.reply('❌ Já existe um paredão ativo neste grupo');
//           return;
//         }

//         const gameId = await manager.createGame(chat.id._serialized);
        
//         // MARCAR TODOS PARA ANUNCIAR
//         try {
//           const groupChat = await client.getChatById(chat.id._serialized);
//           const participants = await groupChat.participants;
//           const mentions = [];
          
//           for (const participant of participants) {
//             try {
//               const contact = await client.getContactById(participant.id._serialized);
//               mentions.push(contact);
//             } catch (error) {
//               // Ignora
//             }
//           }

//           if (mentions.length > 0) {
//             await chat.sendMessage(
//               `@${SUPREMO_ID.replace('@c.us', '')} *NOVO PAREDÃO INICIADO!* 🎮\n\n` +
//               `Use !entrar NUMERO NOME para participar\n` +
//               `Exemplo: !entrar 258866630883 João Silva`,
//               { mentions }
//             );
//           }
//         } catch (error) {
//           console.log('⚠️ Não foi possível marcar todos');
//         }

//         await msg.reply(`✅ Paredão #${gameId} iniciado! Use !entrar NUMERO NOME para participar.`);
//         return;
//       }

//       if (command === '!sortear') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         if (game.status !== 'waiting') {
//           await msg.reply('❌ O jogo já começou! Não é possível sortear agora.');
//           return;
//         }

//         const shuffledPlayers = await manager.shufflePlayers(game.id);
        
//         let resultText = '🎲 *ORDEM SORTEADA* 🎲\n\n';
//         shuffledPlayers.forEach((player, index) => {
//           resultText += `${index + 1}º ${player.name}\n`;
//         });

//         resultText += `\n✅ Use !comecar para iniciar o primeiro turno`;

//         await msg.reply(resultText);
//         return;
//       }

//       if (command === '!comecar') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         if (game.status !== 'waiting') {
//           await msg.reply('❌ O jogo já começou!');
//           return;
//         }

//         const players = await db.getGamePlayers(game.id);
        
//         if (players.length === 0) {
//           await msg.reply('❌ Nenhum jogador no paredão. Use !entrar para participar.');
//           return;
//         }

//         const firstPlayer = players[0];
//         await manager.startTurn(game.id, chat.id._serialized, firstPlayer);
        
//         await msg.reply(`🔥 *COMEÇANDO!* Primeiro turno: ${firstPlayer.name}`);
//         return;
//       }

//       if (command === '!proximoturno') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         const result = await manager.nextTurn(game.id, chat.id._serialized);
        
//         if (result.success) {
//           await msg.reply(`⏭️ *PRÓXIMO TURNO:* ${result.player.name}`);
//         } else if (result.error) {
//           await msg.reply(`❌ ${result.error}`);
//         } else {
//           await msg.reply('❌ Não foi possível iniciar próximo turno');
//         }
//         return;
//       }

//       if (command === '!skipturno') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         const result = await manager.skipTurn(game.id, chat.id._serialized);
        
//         if (result.success) {
//           await msg.reply(`⏭️ *TURNO PULADO!* Próximo: ${result.player.name}`);
//         } else if (result.error) {
//           await msg.reply(`❌ ${result.error}`);
//         } else {
//           await msg.reply('❌ Não foi possível pular turno');
//         }
//         return;
//       }

//       if (command === '!encerrarturno') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         if (!game.current_player_id) {
//           await msg.reply('❌ Nenhum turno ativo no momento');
//           return;
//         }

//         const result = await manager.endTurn(game.id, chat.id._serialized);
//         if (result) {
//           await msg.reply(`⏹️ *Turno de ${result.player.name} encerrado!*`);
//         } else {
//           await msg.reply('⏹️ *Turno encerrado*');
//         }
//         return;
//       }

//       if (command === '!forcarentrar') {
//         if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
//           await msg.reply('❌ Use: !forcarentrar @membro');
//           return;
//         }

//         const targetId = msg.mentionedIds[0];
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         try {
//           const name = await getSafeName(targetId);
//           const playerInfo = await manager.forceAddPlayer(game.id, targetId, name);

//           await msg.reply(`✅ ${playerInfo.name} foi adicionado ao paredão! Posição: ${playerInfo.order}º`);
//         } catch (error) {
//           console.error('Erro no !forcarentrar:', error);
//           await msg.reply('❌ Erro ao adicionar jogador');
//         }
//         return;
//       }

//       if (command === '!remover') {
//         if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
//           await msg.reply('❌ Use: !remover @membro');
//           return;
//         }

//         const targetId = msg.mentionedIds[0];
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         if (game.current_player_id === targetId) {
//           await msg.reply('❌ Não é possível remover o jogador durante seu turno');
//           return;
//         }

//         try {
//           await manager.removePlayer(game.id, targetId);
//           await msg.reply('✅ Jogador removido do paredão');
//         } catch (error) {
//           await msg.reply('❌ Erro ao remover jogador');
//         }
//         return;
//       }

//       if (command === '!finalizar') {
//         const game = await manager.getActiveGame(chat.id._serialized);
        
//         if (!game) {
//           await msg.reply('❌ Nenhum paredão ativo');
//           return;
//         }

//         await manager.finishGame(game.id, chat.id._serialized);
//         await msg.reply('🏁 *PAREDÃO FINALIZADO!* Obrigado a todos!');
//         return;
//       }

//       if (command === '!admin') {
//         if (!isSupremo) {
//           await msg.reply('❌ Apenas o SUPREMO pode promover administradores');
//           return;
//         }

//         if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
//           await msg.reply('❌ Use: !admin @membro');
//           return;
//         }

//         const targetId = msg.mentionedIds[0];
//         await db.promoteToAdmin(targetId);
        
//         const name = await getSafeName(targetId);
//         await msg.reply(`🛡️ ${name} foi promovido a administrador`);
//         return;
//       }

//       if (command === '!removeradmin') {
//         if (!isSupremo) {
//           await msg.reply('❌ Apenas o SUPREMO pode remover administradores');
//           return;
//         }

//         if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
//           await msg.reply('❌ Use: !removeradmin @membro');
//           return;
//         }

//         const targetId = msg.mentionedIds[0];
        
//         if (await manager.isSupremo(targetId)) {
//           await msg.reply('❌ Não é possível remover o SUPREMO');
//           return;
//         }

//         await db.demoteAdmin(targetId);
        
//         const name = await getSafeName(targetId);
//         await msg.reply(`🛡️ ${name} foi removido como administrador`);
//         return;
//       }

//       // COMANDO NÃO RECONHECIDO
//       await msg.reply('❌ Comando não reconhecido. Use !comandos para ver a lista.');
//     }

//   } catch (error) {
//     console.error('❌ Erro no handler:', error);
//     try {
//       await msg.reply('❌ Ocorreu um erro ao processar seu comando');
//     } catch (replyError) {
//       console.error('❌ Erro ao enviar mensagem de erro:', replyError);
//     }
//   }
// });

// // ====== EVENTOS DO GRUPO ======
// client.on('group_join', async (notification) => {
//   console.log(`👥 ${notification.id} entrou no grupo`);
// });

// client.on('group_leave', async (notification) => {
//   console.log(`👥 ${notification.id} saiu do grupo`);
  
//   try {
//     const game = await manager.getActiveGame(notification.chatId);
//     if (game) {
//       await manager.removePlayer(game.id, notification.id);
//     }
//   } catch (error) {
//     console.error('Erro ao remover jogador:', error);
//   }
// });

// // ====== INICIALIZAÇÃO ======
// (async () => {
//   try {
//     await db.connect();
//     client.initialize();
    
//     console.log('====================================');
//     console.log('🤖 INICIANDO BOT DO PAREDÃO...');
//     console.log('====================================');
//     console.log('🔁 Aguardando conexão com WhatsApp...');
    
//   } catch (error) {
//     console.error('❌ Erro na inicialização:', error);
//     process.exit(1);
//   }
// })();

// // ====== SHUTDOWN GRACEFUL ======
// process.on('SIGINT', async () => {
//   console.log('\n🛑 Desligando bot do Paredão...');
  
//   manager.timers.forEach((timer, groupId) => {
//     clearInterval(timer);
//     console.log(`⏰ Timer parado para grupo ${groupId}`);
//   });
  
//   if (db.pg) {
//     await db.pg.end();
//     console.log('🗄️ Banco desconectado');
//   }
  
//   console.log('👋 Bot desligado com sucesso');
//   process.exit(0);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('❌ Unhandled Rejection:', reason);
// });

// process.on('uncaughtException', (error) => {
//   console.error('❌ Uncaught Exception:', error);
// });