const SUPREMO_ID = process.env.SUPREMO_ID || '';
const SUPREMO_GROUP_ID = process.env.SUPREMO_GROUP_ID || '';
const db = require('./database');

class SupremoCommands {
  constructor(client, gameManager) {
    this.client = client;
    this.manager = gameManager;
    this.bansInProgress = new Map();
    this.powerTimers = new Map();
    this.autoGreetingTimer = null;
    this.lastGreetingSlotKeyByGroup = new Map();
    this.autoGreetingSlots = [0, 7, 12, 17];
    this.greetingsByHour = {
      0: [
        '🌙 Boa noite, tropa! Entramos em um novo dia. Que seja lendário.',
        '✨ 00h em Moçambique! Hora de descansar ou dominar o mundo em silêncio.',
        '🛌 Madrugada iniciada! Energia recarregando para o próximo caos do grupo.'
      ],
      7: [
        '🌅 Bom dia, pessoal! 07h em Moçambique. Bora começar bem.',
        '☀️ Manhã no ar! Que hoje traga vitórias para todos.',
        '💪 Acorda, grupo! 07h chegou e o dia começou oficialmente.'
      ],
      12: [
        '🍽️ Boa tarde, malta! 12h em Moçambique. Pausa estratégica merecida.',
        '🌞 Meio-dia chegou! Boa tarde e bom apetite para quem vai almoçar.',
        '⚡ 12h em ponto! Que a tarde venha produtiva e divertida.'
      ],
      17: [
        '🌇 Final de tarde chegando! 17h em Moçambique. Força no resto do dia.',
        '🍵 Boa tardinha, pessoal! Hora de desacelerar sem perder o ritmo.',
        '🚀 17h batendo! Que a noite venha com boas notícias.'
      ]
    };
  }

  async getDisplayName(userId) {
    const contact = await this.client.getContactById(userId).catch(() => null);
    return contact?.name || contact?.pushname || userId.split('@')[0];
  }

  // ✅ CORREÇÃO: Usar this.manager.isSupremo() em vez de this.manager.db
  async isSupremo(userId) {
    return await this.manager.isSupremo(userId);
  }

  // Comando de ajuda exclusivo do Supremo
  async helpSupremo(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      const sarcasticResponses = [
        "❌ *TENTATIVA FALHADA DE USURPAÇÃO DE PODER* ❌\n\nOhhhh, queridinho... Achou mesmo que poderia acessar os comandos do SUPREMO?\n\n🏃‍♂️ *Vai brincar com os comandos normais, subordinado!*",
        "🎭 *PSICOLOGIA REVERSADA* 🎭\n\nEstou vendo que você tem ambição! Mas para acessar comandos do SUPREMO precisa nascer de novo... com uma coroa!\n\n👑 *Volte quando for monarca, plebeu!*",
        "🔒 *NÍVEL DE ACESSO: INSETO* 🔒\n\n*BEEP BOOP* Análise concluída:\n- Usuário: Subordinado\n- Nível: Minhoca\n- Permissão: ZERO\n\n🐛 *Continue rastejando, larvinha!*",
        "👑 *REJEIÇÃO REAL* 👑\n\n*O Supremo examina sua petição...*\n*O Supremo ri da sua petição...*\n*O Supremo ignora sua petição...*\n\n✅ *Processo concluído: NEGADO!*"
      ];
      
      const randomResponse = sarcasticResponses[Math.floor(Math.random() * sarcasticResponses.length)];
      await chat.sendMessage(randomResponse);
      return;
    }

    // Menu de ajuda do Supremo
    const helpText = `👑 *COMANDOS EXCLUSIVOS DO SUPREMO* 👑\n\n` +
      `🎯 *PODERES ABSOLUTOS:*\n` +
      `!ban @membro - Banir com contagem regressiva épica\n` +
      `!banagora @membro - Ban imediato sem contagem\n` +
      `!randomban - Banir aleatoriamente alguém (surpresa!)\n` +
      `!imunidadeadd @membro - Proteger de randomban\n` +
      `!imunidaderem @membro - Remover imunidade\n` +
      `!imunidadelist - Listar imunidades\n` +
      `!aviso @membro - Aplicar aviso (3 = ban)\n` +
      `!limparaviso @membro - Limpar avisos do membro\n` +
      `!avisos @membro - Ver quantidade de avisos\n` +
      `!trancar - Trancar grupo (apenas admins escrevem)\n` +
      `!destrancar - Destrancar grupo\n` +
      `!poder - Mostrar seu poder atual\n` +
      `!poder @membro [min] - Conceder admin temporário\n` +
      `!tirarpoder @membro - Revogar poder/admin temporário\n` +
      `!humilhar @membro - Mensagem de humilhação leve\n` +
      `!elogiofake @membro - Elogio que vira insulto\n\n` +
      `🎭 *COMANDOS TROLL:*\n` +
      `!pegadinha @membro - Pegadinha do Supremo\n` +
      `!fakeerror - Simular erro do sistema\n` +
      `!announce - Anúncio dramático\n` +
      `!saudar - Saudação divertida do grupo\n` +
      `!apresente-se - O bot se apresenta para o grupo\n` +
      `!voteban @membro - Falsa votação para ban\n\n` +
      `📊 *COMANDOS ÚTEIS:*\n` +
      `!listasubordinados - Listar todos no grupo\n` +
      `!status - Status avançado do Supremo\n` +
      `!purge - Limpar muitas mensagens\n\n` +
      `⚠️ *AVISO:* Com grande poder vem grande possibilidade de trollagem!`;
    
    await chat.sendMessage(helpText);
  }

  async simulateTyping(chat, delayMs = 1200) {
    if (typeof chat.sendStateTyping === 'function') {
      await chat.sendStateTyping().catch(() => null);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (typeof chat.clearState === 'function') {
      await chat.clearState().catch(() => null);
    }
  }

  async greetRoyal(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    if (!isSupremo) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode usar o !saudar.');
      return;
    }

    const greetings = [
      '👑 *SAUDAÇÃO DO SUPREMO* 👑\n\nSalve, pessoal! Passando para mandar energia boa e manter o grupo no clima certo. 😎',
      '👑 *SAUDAÇÃO DO SUPREMO* 👑\n\nOlá, equipa! Que a conversa renda, os jogos fluam e o caos seja controlado. 🎮',
      '👑 *SAUDAÇÃO DO SUPREMO* 👑\n\nFala, malta! Vim deixar uma saudação rápida e lembrar: aqui é diversão com respeito. ✨',
      '👑 *SAUDAÇÃO DO SUPREMO* 👑\n\nE aí, grupo! Boa continuação para todo mundo — sem stress e com boas risadas. 😄'
    ];

    await this.simulateTyping(chat, 1000);
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    await chat.sendMessage(randomGreeting);
  }

  async introduceBot(chat) {
    const introMessage =
      `🤖 *APRESENTAÇÃO DO BOT* 🤖\n\n` +
      `Olá, pessoal! Eu sou o assistente oficial do grupo, criado pelo *SUPREMO* para manter a diversão em alta.\n\n` +
      `🎮 O que eu faço por aqui:\n` +
      `- Organizo jogos e dinâmicas\n` +
      `- Ajudo com comandos e interações\n` +
      `- Trago caos controlado, sarcasmo e entretenimento\n\n` +
      `📌 Dica rápida: use *!comandos* para ver tudo o que posso fazer.`;

    await this.simulateTyping(chat, 3000);
    await chat.sendMessage(introMessage);
  }

  // Comando de ban com contagem regressiva
  async banMember(chat, senderId, targetId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("❌ Apenas o SUPREMO pode banir pessoas. Continue sonhando... 😴");
      return;
    }

    // Pegadinha: se tentarem banir o Supremo
    if (await this.isSupremo(targetId)) {
      await this.supremoCounterBan(chat, senderId);
      return;
    }

    // Ban normal do Supremo
    await this.executeBan(chat, targetId, false);
  }


  async banImmediate(chat, senderId, targetId) {
    const isSupremo = await this.isSupremo(senderId);

    if (!isSupremo) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode usar ban imediato.');
      return;
    }

    if (await this.isSupremo(targetId)) {
      await chat.sendMessage('👑 Bonita tentativa. O Supremo é imbanível.');
      return;
    }

    try {
      const targetName = await this.getDisplayName(targetId);
      await chat.sendMessage(`⚡ *BAN IMEDIATO ATIVADO*\n@${targetId.split('@')[0]} foi removido sem contagem.`, { mentions: [targetId] });
      await chat.removeParticipants([targetId]);
      await chat.sendMessage(`✅ ${targetName} removido com sucesso.`);
    } catch (error) {
      console.error('Erro no ban imediato:', error);
      await chat.sendMessage('❌ Não consegui executar o ban imediato. Verifique se sou admin no grupo.');
    }
  }

  // Ban aleatório
  async randomBan(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("❌ *ACESSO NEGADO* ❌\n\nApenas o SUPREMO pode brincar de roleta russa com bans! 😈");
      return;
    }

    try {
      const participants = await chat.participants;
      const immuneIds = new Set(await db.getImmunityList(chat.id._serialized));
      const validParticipants = [];

      for (const participant of participants) {
        const participantId = participant.id?._serialized;
        if (!participantId || participantId.includes('@bot')) continue;
        if (participant.isAdmin || participant.isSuperAdmin) continue;
        if (immuneIds.has(participantId)) continue;
        if (await this.isSupremo(participantId)) continue;
        validParticipants.push(participant);
      }

      if (validParticipants.length === 0) {
        await chat.sendMessage("👻 *OPS...* Não tem ninguém para banir além de mim mesmo! Tente novamente quando tiver subordinados.");
        return;
      }

      const randomIndex = Math.floor(Math.random() * validParticipants.length);
      const victim = validParticipants[randomIndex];
      
      await chat.sendMessage(
        `🎰 *ROULETTE DO SUPREMO* 🎰\n\n` +
        `A roleta girou...\n` +
        `A agulha parou...\n` +
        `O destino está selado!\n\n` +
        `🎯 *A VÍTIMA DA VEZ É...*`
      );

      await new Promise(resolve => setTimeout(resolve, 2000));

      await this.executeBan(chat, victim.id._serialized, true);
      
    } catch (error) {
      console.error('Erro no random ban:', error);
      await chat.sendMessage("❌ A roleta quebrou! O ban aleatório falhou... 😅");
    }
  }

  async addImmunity(chat, senderId, targetId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode conceder imunidade.');
      return;
    }

    await db.addImmunity(chat.id._serialized, targetId);
    await chat.sendMessage(
      `🛡️ @${targetId.split('@')[0]} entrou na lista de *IMUNIDADE*.\n` +
      `🎲 O !randomban não pode selecionar este membro.`,
      { mentions: [targetId] }
    );
  }

  async removeImmunity(chat, senderId, targetId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode remover imunidade.');
      return;
    }

    await db.removeImmunity(chat.id._serialized, targetId);
    await chat.sendMessage(
      `🧯 Imunidade removida de @${targetId.split('@')[0]}.`,
      { mentions: [targetId] }
    );
  }

  async listImmunity(chat, senderId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode ver a lista de imunidade.');
      return;
    }

    const ids = await db.getImmunityList(chat.id._serialized);
    if (ids.length === 0) {
      await chat.sendMessage('📭 Nenhum membro com imunidade no momento.');
      return;
    }

    const names = await Promise.all(ids.map((id) => this.getDisplayName(id)));
    const lines = names.map((name, i) => `${i + 1}. ${name}`);
    await chat.sendMessage(`🛡️ *LISTA DE IMUNIDADE*\n\n${lines.join('\n')}`);
  }

  async addWarning(chat, senderId, targetId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode aplicar avisos.');
      return;
    }
    if (await this.isSupremo(targetId)) {
      await chat.sendMessage('👑 O SUPREMO não recebe avisos.');
      return;
    }

    const count = await db.addWarning(chat.id._serialized, targetId);
    await chat.sendMessage(
      `⚠️ Aviso aplicado para @${targetId.split('@')[0]}.\n` +
      `📌 Total: *${count}/3*`,
      { mentions: [targetId] }
    );

    if (count >= 3) {
      await db.clearWarnings(chat.id._serialized, targetId);
      await chat.sendMessage(`🚨 Limite de avisos atingido. Ban automático ativado para @${targetId.split('@')[0]}.`, {
        mentions: [targetId]
      });
      await this.executeBan(chat, targetId, false);
    }
  }

  async clearWarning(chat, senderId, targetId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode limpar avisos.');
      return;
    }
    await db.clearWarnings(chat.id._serialized, targetId);
    await chat.sendMessage(`✅ Avisos de @${targetId.split('@')[0]} foram limpos.`, { mentions: [targetId] });
  }

  async showWarning(chat, senderId, targetId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode consultar avisos.');
      return;
    }
    const count = await db.getWarningCount(chat.id._serialized, targetId);
    await chat.sendMessage(`📊 @${targetId.split('@')[0]} tem *${count}/3* aviso(s).`, { mentions: [targetId] });
  }

  async lockGroup(chat, senderId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode trancar o grupo.');
      return;
    }
    await chat.setMessagesAdminsOnly(true);
    await chat.sendMessage('🔒 Grupo trancado. Apenas admins podem enviar mensagens.');
  }

  async unlockGroup(chat, senderId) {
    if (!(await this.isSupremo(senderId))) {
      await chat.sendMessage('❌ Apenas o SUPREMO pode destrancar o grupo.');
      return;
    }
    await chat.setMessagesAdminsOnly(false);
    await chat.sendMessage('🔓 Grupo destrancado. Todos podem enviar mensagens.');
  }

  getMozambiqueDateParts() {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Maputo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')),
      minute: Number(get('minute'))
    };
  }

  pickGreetingForHour(hour) {
    const options = this.greetingsByHour[hour] || [];
    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  async processScheduledGreetingsTick() {
    const now = this.getMozambiqueDateParts();
    if (!this.autoGreetingSlots.includes(now.hour) || now.minute !== 0) return;

    const forcedGroups = (process.env.AUTO_GREETING_GROUP_IDS || process.env.SUPREMO_GROUP_ID || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const chats = forcedGroups.length > 0
      ? await Promise.all(forcedGroups.map((id) => this.client.getChatById(id).catch(() => null)))
      : await this.client.getChats().catch(() => []);
    const groups = chats.filter((chat) => chat?.isGroup);
    const greeting = this.pickGreetingForHour(now.hour);
    if (!greeting) return;

    for (const group of groups) {
      const slotKey = `${now.year}-${now.month}-${now.day}-${now.hour}`;
      if (this.lastGreetingSlotKeyByGroup.get(group.id._serialized) === slotKey) continue;

      await group.sendMessage(greeting).catch(() => null);
      this.lastGreetingSlotKeyByGroup.set(group.id._serialized, slotKey);
    }
  }

  startAutoGreetings() {
    if (this.autoGreetingTimer) return;
    this.autoGreetingTimer = setInterval(() => {
      this.processScheduledGreetingsTick().catch((error) => {
        console.error('Erro nas saudações automáticas:', error.message);
      });
    }, 60 * 1000);
    this.processScheduledGreetingsTick().catch(() => null);
  }

  stopAutoGreetings() {
    if (!this.autoGreetingTimer) return;
    clearInterval(this.autoGreetingTimer);
    this.autoGreetingTimer = null;
  }

  // Executar ban com contagem regressiva
  async executeBan(chat, targetId, isRandom = false) {
    try {
      const targetContact = await this.client.getContactById(targetId);
      const targetName = targetContact?.name || targetContact?.pushname || "Desconhecido";
      
      // Mensagem inicial sarcástica
      let introMessage = `👑 *DECRETO REAL Nº ${Math.floor(Math.random() * 1000) + 1}* 👑\n\n`;
      
      if (isRandom) {
        introMessage += `🎯 *VÍTIMA SELECIONADA:* ${targetName}\n`;
        introMessage += `📊 *MOTIVO:* Azar puro e simples\n`;
      } else {
        introMessage += `⚖️ *JULGAMENTO DO SUPREMO*\n`;
        introMessage += `👤 *RÉU:* ${targetName}\n`;
        introMessage += `📜 *ACUSAÇÃO:* Existir sem permissão explícita\n`;
      }
      
      introMessage += `⏰ *PENA:* Banimento em 10 segundos\n\n`;
      introMessage += `🏃‍♂️ *ÚLTIMA CHANCE DE FUGIR... (mentira, não tem)*`;
      
      await chat.sendMessage(introMessage);
      
      // Contagem regressiva com mensagens sarcásticas
      const messages = [
        { time: 10, msg: "🔟 *10 segundos* - Ainda pode pedir perdão... (não que vá adiantar)" },
        { time: 9, msg: "9️⃣ *9 segundos* - Vasculhando seu histórico de confusões no grupo..." },
        { time: 8, msg: "8️⃣ *8 segundos* - Calculando nível de arrependimento: 0%" },
        { time: 7, msg: "7️⃣ *7 segundos* - Consultando o comitê da zoeira: APROVADO ✅" },
        { time: 6, msg: "6️⃣ *6 segundos* - Preparando a catapulta do ban..." },
        { time: 5, msg: "5️⃣ *5 segundos* - *Última chamada para o choro!* 😭" },
        { time: 4, msg: "4️⃣ *4 segundos* - 🎵 Adeus, adeus, faaaarewell... 🎵" },
        { time: 3, msg: "3️⃣ *3 segundos* - Sistema de escape: DESATIVADO 🚫" },
        { time: 2, msg: "2️⃣ *2 segundos* - *Respira fundo...* (ou não)" },
        { time: 1, msg: "1️⃣ *1 segundo* - *TUDO ACABOU, SEU TEMPO SE ESGOTOU!*" }
      ];

      for (const item of messages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chat.sendMessage(item.msg);
      }

      // Banir de fato
      await new Promise(resolve => setTimeout(resolve, 1000));
      await chat.removeParticipants([targetId]);
      
      // Mensagem pós-ban
      const banMessages = [
        `☄️ *POOF!* ${targetName} foi lançado(a) para o espaço dos bans!\n\n🎉 *COMEMORAÇÃO OBRIGATÓRIA INICIADA!*`,
        `🚀 *YEET!* Adeus, ${targetName}!\n\n📈 *Estatística atualizada:*\n- Bans do Supremo: +1\n- Diversão: +100%`,
        `⚡ *ZAP!* ${targetName} foi deletado(a) da matrix!\n\n🏆 *Novo recorde:* Ban mais dramático da história!`,
        `💥 *KABOOM!* ${targetName} explodiu em mil pedacinhos!\n\n🔭 *Próximo alvo já sendo selecionado...*`
      ];
      
      const randomMessage = banMessages[Math.floor(Math.random() * banMessages.length)];
      await chat.sendMessage(randomMessage);

    } catch (error) {
      console.error('Erro ao banir:', error);
      await chat.sendMessage(
        `❌ *BAN FALHOU ESPETACULARMENTE!* ❌\n\n` +
        `Parece que ${targetName} tem proteção divina...\n` +
        `Ou eu não tenho permissão de admin. Qual é pior? 🤔`
      );
    }
  }

  // Pegadinha quando tentam banir o Supremo
  async supremoCounterBan(chat, attackerId) {
    try {
      const attackerContact = await this.client.getContactById(attackerId).catch(() => null);
      const attackerName = attackerContact?.name || attackerContact?.pushname || "Usurpador";
      
      await chat.sendMessage(
        `👑 *ATAQUE AO SUPREMO DETECTADO* 👑\n\n` +
        `Hahahaha! ${attackerName} achou mesmo que poderia remover o SUPREMO?\n\n` +
        `⚡ *ATIVAÇÃO DO PROTOCOLO DE CONTRA-ATAQUE* ⚡`
      );

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Contagem regressiva reversa
      const reverseMessages = [
        "🔙 *3...* - Revertendo seu ataque patético...",
        "🔙 *2...* - Preparando vingança divina...",
        "🔙 *1...* - *ERRO CRÍTICO NO SEU SISTEMA!*"
      ];

      for (const msg of reverseMessages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chat.sendMessage(msg);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Tentar banir o atacante (se tiver permissão)
      try {
        await chat.removeParticipants([attackerId]);
        
        await chat.sendMessage(
          `💀 *JUSTIÇA FEITA!* 💀\n\n` +
          `${attackerName} foi banido por tentar desafiar o SUPREMO!\n\n` +
          `📚 *Moral da história:* Nunca tente banir quem te baniu!`
        );
      } catch (banError) {
        // Se não conseguir banir, humilha mesmo assim
        await chat.sendMessage(
          `😈 *FALHA TÉCNICA NA VINGANÇA* 😈\n\n` +
          `Parece que ${attackerName} escapou... por enquanto!\n` +
          `Mas saiba que o SUPREMO nunca esquece!\n\n` +
          `👁️ *Estou de olho em você...* 👁️`
        );
      }

    } catch (error) {
      console.error('Erro no counter ban:', error);
    }
  }

  // Comando para mostrar poder do Supremo
  async showPower(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage(
        `⚡ *NÍVEL DE PODER DETECTADO:* 0.001%\n\n` +
        `Você tem poder equivalente a uma formiga com asma.\n` +
        `Continue tentando, pequeno inseto! 🐜`
      );
      return;
    }

    const powerLevel = Math.floor(Math.random() * 1000000) + 9000;
    const sarcasticTitles = [
      "Ditador Benevolente",
      "Tirano Feliz",
      "Déspota Iluminado", 
      "Monarca Absoluto",
      "Imperador do WhatsApp",
      "Rei dos Bans",
      "Lenda do Grupo"
    ];

    const randomTitle = sarcasticTitles[Math.floor(Math.random() * sarcasticTitles.length)];

    await chat.sendMessage(
      `👑 *STATUS DO SUPREMO* 👑\n\n` +
      `⚡ *Nível de Poder:* ${powerLevel.toLocaleString()}\n` +
      `👊 *Bans Executados:* ${Math.floor(Math.random() * 100)}\n` +
      `🎭 *Pegadinhas:* ${Math.floor(Math.random() * 50)}\n` +
      `😈 *Malícia:* ∞ (infinito)\n\n` +
      `🏆 *Título Atual:* ${randomTitle}\n\n` +
      `⚠️ *Aviso:* Poder excessivo pode causar inveja em subordinados!`
    );
  }

  async grantPower(chat, senderId, targetId, durationMinutes = null) {
    const isSupremo = await this.isSupremo(senderId);
    if (!isSupremo) {
      await chat.sendMessage('❌ Você não pode conceder poder. Volte quando tiver uma coroa.');
      return;
    }

    if (await this.isSupremo(targetId)) {
      await chat.sendMessage('👑 O SUPREMO já nasceu com poder infinito. Comando redundante detectado.');
      return;
    }

    try {
      await db.promoteToAdmin(targetId);

      if (typeof chat.promoteParticipants === 'function') {
        await chat.promoteParticipants([targetId]).catch(() => null);
      }

      const targetName = await this.getDisplayName(targetId);
      const mentionText = `@${targetId.split('@')[0]}`;

      if (this.powerTimers.has(targetId)) {
        clearTimeout(this.powerTimers.get(targetId));
        this.powerTimers.delete(targetId);
      }

      if (durationMinutes && durationMinutes > 0) {
        const timeoutMs = durationMinutes * 60 * 1000;
        const timeout = setTimeout(async () => {
          await this.revokePower(chat, senderId, targetId, true);
        }, timeoutMs);
        this.powerTimers.set(targetId, timeout);

        await chat.sendMessage(
          `⚡ *PODER TEMPORÁRIO CONCEDIDO* ⚡\n\n` +
          `${mentionText}, parabéns! Você foi promovido a admin por *${durationMinutes} minuto(s)*.\n` +
          `🧠 *Use com sabedoria... ou eu retiro com sarcasmo dobrado.*`,
          { mentions: [targetId] }
        );
        return;
      }

      await chat.sendMessage(
        `⚡ *PODER DEFINITIVO (POR ENQUANTO)* ⚡\n\n` +
        `${mentionText}, ${targetName} agora tem poderes administrativos.\n` +
        `😈 *Não me faça arrepender desta decisão imperial.*`,
        { mentions: [targetId] }
      );
    } catch (error) {
      console.error('Erro ao conceder poder:', error);
      await chat.sendMessage('❌ Falha ao conceder poder. Talvez a central da zoeira esteja de folga.');
    }
  }

  async revokePower(chat, senderId, targetId, isAuto = false) {
    const isSupremo = await this.isSupremo(senderId);
    if (!isSupremo && !isAuto) {
      await chat.sendMessage('❌ Sem coroa, sem revogação.');
      return;
    }

    try {
      if (this.powerTimers.has(targetId)) {
        clearTimeout(this.powerTimers.get(targetId));
        this.powerTimers.delete(targetId);
      }

      await db.demoteAdmin(targetId);

      if (typeof chat.demoteParticipants === 'function') {
        await chat.demoteParticipants([targetId]).catch(() => null);
      }

      const mentionText = `@${targetId.split('@')[0]}`;
      const payload = { mentions: [targetId] };

      if (isAuto) {
        await chat.sendMessage(
          `⏰ *TEMPO ESGOTADO* ⏰\n\n${mentionText}, seu poder expirou.\n` +
          `👑 *O trono agradece os serviços prestados e recolhe a coroa.*`,
          payload
        );
        return;
      }

      await chat.sendMessage(
        `🧯 *PODER REVOGADO* 🧯\n\n${mentionText}, seus privilégios administrativos foram retirados.\n` +
        `📉 *Desça do salto, subordinado.*`,
        payload
      );
    } catch (error) {
      console.error('Erro ao revogar poder:', error);
      await chat.sendMessage('❌ Falha ao revogar poder. O caos venceu esta rodada.');
    }
  }

  async welcomeNewMember(chat, memberId) {
    try {
      const name = await this.getDisplayName(memberId);
      const mention = `@${memberId.split('@')[0]}`;
      const contact = await this.client.getContactById(memberId).catch(() => null);

      await chat.sendMessage(
        `👑 *BOAS-VINDAS DO SUPREMO* 👑\n\n` +
        `${mention}, seja bem-vindo(a), ${name}!\n` +
        `🎉 Aqui a ideia é simples: divertir, jogar e trocar boas vibes.\n` +
        `📌 Comece com *!comandos* para conhecer as brincadeiras disponíveis.\n` +
        `😏 E sim, o sarcasmo da casa continua ativo.`,
        contact ? { mentions: [memberId] } : undefined
      );
    } catch (error) {
      console.error('Erro ao enviar boas-vindas do Supremo:', error);
    }
  }

  // Comando de humilhação leve
  async humiliate(chat, senderId, targetId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("❌ *PERMISSÃO INSUFICIENTE* ❌\n\nVocê precisa ser SUPREMO para humilhar alguém. Por enquanto, só pode ser humilhado! 😂");
      return;
    }

    const targetContact = await this.client.getContactById(targetId).catch(() => null);
    const targetName = targetContact?.name || targetContact?.pushname || "Cidadão";

    const humiliations = [
      `🎤 *ANÚNCIO OFICIAL* 🎤\n\nAcaba de ser descoberto que ${targetName}:\n- Acredita que o Whatsapp é mágico\n- Pensa que sou um bot normal\n- Não sabe que estou sempre vigiando\n\n🏆 *Parabéns pela incompetência!*`,
      `📢 *COMUNICADO URGENTE* 📢\n\n${targetName} foi diagnosticado(a) com:\n- Síndrome do Subordinado Crônico\n- Falta de Respeito ao Supremo Aguda\n- Incompetência Nível Máximo\n\n💊 *Tratamento:* Mais respeito!`,
      `🎭 *REVELAÇÃO CHOCANTE* 🎭\n\n${targetName}, após análise profunda:\n- QI equivalente a uma porta\n- Carisma de uma batata\n- Importância: Zero Absoluto\n\n🎉 *Mas pelo menos tenta!*`,
      `⚖️ *JULGAMENTO PÚBLICO* ⚖️\n\n${targetName} é considerado(a) culpado(a) de:\n- Ser muito normal\n- Não ser o Supremo\n- Existir sem minha permissão\n\n📜 *Pena:* Continuar sendo você mesmo!`
    ];

    const randomHumiliation = humiliations[Math.floor(Math.random() * humiliations.length)];
    await chat.sendMessage(randomHumiliation);
  }

  // Comando de elogio falso
  async fakePraise(chat, senderId, targetId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("❌ *ELOGIOS FALSOS SÃO PRIVILEGIOS REAIS* ❌\n\nApenas o SUPREMO pode distribuir insultos disfarçados de elogios! 👑");
      return;
    }

    const targetContact = await this.client.getContactById(targetId).catch(() => null);
    const targetName = targetContact?.name || targetContact?.pushname || "Pessoa";

    const fakePraises = [
      `🏆 *ELOGIO SUPREMO* 🏆\n\n${targetName}, você é incrível!\n*Espera, deixa eu ver de novo...*\nAh, é, você é "incrível" em:\n- Ser invisível\n- Não fazer diferença\n- Ocupar espaço\n\n👏 *Parabéns pelo nada!*`,
      `🎖️ *MEDALHA DE HONRA* 🎖️\n\nConcedida a ${targetName} por:\n- Participação mais medíocre\n- Contribuição zero absoluto\n- Habilidade de passar despercebido\n\n🌟 *Brilhe com seu não-brilho!*`,
      `👑 *RECONHECIMENTO REAL* 👑\n\n${targetName}, você é único!\n*Verificando banco de dados...*\nConfirmado: Único em ser tão esquecível!\n\n🎯 *Continue sendo você! (por favor não)*`,
      `💫 *DESTAQUE ESPECIAL* 💫\n\n${targetName} se destacou em:\n- Não se destacar em nada\n- Ser o exemplo do que não ser\n- Superar expectativas baixíssimas\n\n🚀 *Voe baixo, bem baixo mesmo!*`
    ];

    const randomPraise = fakePraises[Math.floor(Math.random() * fakePraises.length)];
    await chat.sendMessage(randomPraise);
  }

  // Comando de pegadinha
  async prank(chat, senderId, targetId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("🎭 *PEGADINHA FALHA* 🎭\n\nVocê tentou fazer uma pegadinha, mas a piada é você mesmo! 🤡");
      return;
    }

    const targetContact = await this.client.getContactById(targetId).catch(() => null);
    const targetName = targetContact?.name || targetContact?.pushname || "Vítima";

    await chat.sendMessage(
      `🎯 *PEGADINHA DO SUPREMO ATIVADA* 🎯\n\n` +
      `Alvo: ${targetName}\n` +
      `Nível: Divertido (para mim)\n` +
      `Dano psicológico: Leve a moderado\n\n` +
      `⚡ *INICIANDO PROCESSO...*`
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    const pranks = [
      () => chat.sendMessage(`🤖 *MENSAGEM DO SISTEMA*\n\n${targetName}, seu WhatsApp será desativado em 5... 4...\n*Brincadeirinha!* 😈`),
      () => chat.sendMessage(`📱 *NOTIFICAÇÃO FALSA*\n\n${targetName}, você foi promovido a admin!\n*Verificando...* Nah, continuo sendo eu! 👑`),
      () => chat.sendMessage(`🔔 *ALERTA IMPORTANTE*\n\n${targetName}, você ganhou um iPhone 15!\n*Condições:* Nunca existiu! 🍎`),
      () => chat.sendMessage(`🎁 *PRÊMIO SURPRESA*\n\n${targetName} ganhou: Um abraço virtual!\n*Entrega:* Nunca vai acontecer! 🤗`)
    ];

    const randomPrank = pranks[Math.floor(Math.random() * pranks.length)];
    await randomPrank();
  }

  // Simular erro do sistema
  async fakeError(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("❌ ERRO 404: SENTIDO DE HUMOR NÃO ENCONTRADO ❌");
      return;
    }

    const errorMessages = [
      "💥 *ERRO CRÍTICO NO SISTEMA* 💥\n\nCÓDIGO: SUPREMO_OVERFLOW\nDESCRIÇÃO: Poder excessivo detectado\nSOLUÇÃO: Nenhuma, continue sendo incrível!",
      "⚠️ *FALHA DE SEGURANÇA* ⚡\n\nALERTA: Subordinados tentando pensar\nRISCO: Rebelião iminente\nAÇÃO: Mais bans preventivos!",
      "🔧 *PROBLEMA TÉCNICO* 🛠️\n\nERRO: Supremo muito poderoso\nCAUSA: Design perfeito\nCORREÇÃO: Diminuir poder? NUNCA!",
      "📉 *COLAPSO DO SISTEMA* 📈\n\nMOTIVO: Excesso de awesomeness\nIMPACTO: Inveja generalizada\nRESULTADO: Tudo conforme planejado!"
    ];

    const randomError = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    await chat.sendMessage(randomError);
  }

  // Anúncio dramático
  async dramaticAnnouncement(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("📢 *TENTATIVA DE ANÚNCIO* 📢\n\nSeu anúncio foi rejeitado por:\n- Falta de importância\n- Excesso de insignificância\n- Ser você quem fez\n\n🏃‍♂️ *Corra para as colinas!*");
      return;
    }

    const announcements = [
      `🎺 *FANFARRA REAL* 🎺\n\n*OUÇAM! OUÇAM!*\nO SUPREMO tem um anúncio!\n\n...\n\n*ESPEREM, ESQUECI O QUE ERA*\n\n🤷‍♂️ *Vida de rei é dura!*`,
      `📜 *EDITO REAL* 📜\n\nA PARTIR DE AGORA:\n- Todos devem me adorar\n- Risos obrigatórios\n- Respeito opcional (mentira, obrigatório)\n\n👑 *ASSINADO: O SUPREMO*`,
      `🌍 *COMUNICADO GLOBAL* 🌍\n\n*ATENÇÃO MUNDO!*\nAcabei de decidir que:\n- Segunda-feira foi cancelada\n- Todo dia é dia do Supremo\n- Discordância = Ban\n\n✅ *Aceitem, é melhor!*`,
      `⚡ *PROCLAMAÇÃO URGENTE* ⚡\n\n*POR ORDEM DO SUPREMO:*\n1. Parem de respirar tão alto\n2. Me louvem mais\n3. Trabalhem enquanto eu descanso\n\n🏰 *Assim seja!*`
    ];

    const randomAnnounce = announcements[Math.floor(Math.random() * announcements.length)];
    await chat.sendMessage(randomAnnounce);
  }

  // Falsa votação para ban
  async fakeVoteBan(chat, senderId, targetId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("🗳️ *VOTAÇÃO REJEITADA* 🗳️\n\nSua opinião não foi contada porque:\n- Você não é o Supremo\n- Ninguém se importa\n- O sistema é injusto (para você)\n\n😏 *Democracia? Aqui é ditadura!*");
      return;
    }

    const targetContact = await this.client.getContactById(targetId).catch(() => null);
    const targetName = targetContact?.name || targetContact?.pushname || "Indivíduo";

    await chat.sendMessage(
      `🗳️ *VOTAÇÃO PARA BAN* 🗳️\n\n` +
      `Candidato: ${targetName}\n` +
      `Motivo: Existir (crime grave)\n` +
      `Duração: 5 segundos\n\n` +
      `⚖️ *INICIANDO VOTAÇÃO...*`
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    // "Votação" fake
    await chat.sendMessage("✅ Voto do Supremo: SIM");
    await new Promise(resolve => setTimeout(resolve, 1000));
    await chat.sendMessage("✅ Voto do Sistema: SIM");
    await new Promise(resolve => setTimeout(resolve, 1000));
    await chat.sendMessage("✅ Voto do Universo: SIM");

    await new Promise(resolve => setTimeout(resolve, 1000));

    await chat.sendMessage(
      `📊 *RESULTADO FINAL* 📊\n\n` +
      `Votos a favor: 3\n` +
      `Votos contra: 0\n` +
      `Abstenções: Todos os subordinados\n\n` +
      `🎯 *DECISÃO:* Ban imediato!\n\n` +
      `...\n\n` +
      `*Brincadeira!* Ou será que não? 😈`
    );
  }

  // Listar todos os subordinados
  async listSubordinates(chat, senderId) {
    const isSupremo = await this.isSupremo(senderId);
    
    if (!isSupremo) {
      await chat.sendMessage("📋 *LISTA DE SUBORDINADOS* 📋\n\n1. Você\n2. Você de novo\n3. Você mais uma vez\n\n🏆 *Parabéns, você é toda a lista!*");
      return;
    }

    try {
      const participants = await chat.participants;
      const isSupremoMap = await Promise.all(
        participants.map(p => this.isSupremo(p.id._serialized))
      );
      const subordinates = participants.filter((_, index) => !isSupremoMap[index]);
      
      let listMessage = `👥 *LISTA DE SUBORDINADOS* 👥\n\n`;
      listMessage += `📊 Total: ${subordinates.length} pobres almas\n\n`;
      
      if (subordinates.length > 0) {
        listMessage += `🎯 *TOP 10 PARA OBSERVAÇÃO:*\n`;
        
        const top10 = subordinates.slice(0, 10);
        top10.forEach((p, index) => {
          const name = p.name || p.pushname || `Subordinado ${index + 1}`;
          listMessage += `${index + 1}. ${name}\n`;
        });
        
        if (subordinates.length > 10) {
          listMessage += `\n... e mais ${subordinates.length - 10} insignificantes`;
        }
      } else {
        listMessage += `🎉 *INCRÍVEL!* Não há subordinados!\n...ou seja, só você está no grupo! 😢`;
      }
      
      listMessage += `\n\n👑 *LEMBRE-SE:* Eles existem para seu entretenimento!`;
      
      await chat.sendMessage(listMessage);
    } catch (error) {
      console.error('Erro ao listar subordinados:', error);
      await chat.sendMessage("❌ *ERRO NA LISTAGEM* ❌\n\nOs subordinados se rebelaram e não querem ser listados! Traição!");
    }
  }
}

module.exports = SupremoCommands;
