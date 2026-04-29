class WppInteractiveService {
  constructor({ groupGameHandler, supremoHandler }) {
    this.groupGameHandler = groupGameHandler;
    this.supremoHandler = supremoHandler;
  }

  async sendMainPanel(chat, senderId, msg) {
    const sections = [
      {
        title: 'Jogos',
        rows: [
          { rowId: '!comandos', title: 'Comandos gerais', description: 'Lista completa' },
          { rowId: '!status', title: 'Status da partida', description: 'Resumo do jogo atual' },
          { rowId: '!entrar', title: 'Entrar no jogo', description: 'Entrar na rodada ativa' },
          { rowId: '!meuhistorico', title: 'Meu histórico', description: 'Últimas participações' },
        ],
      },
      {
        title: 'Impostor',
        rows: [
          { rowId: '!iniciarimpostor', title: 'Iniciar impostor', description: 'Criar nova sessão' },
          { rowId: '!encerrarinscricoes', title: 'Encerrar inscrições', description: 'Começar dinâmica' },
          { rowId: '!encerrarvotacao', title: 'Encerrar votação', description: 'Forçar resultado' },
        ],
      },
      {
        title: 'Supremo',
        rows: [
          { rowId: '!helpsupremo', title: 'Painel Supremo', description: 'Comandos exclusivos' },
          { rowId: '!randomban', title: 'Roleta de ban', description: 'Ban aleatório' },
          { rowId: '!imunidadelist', title: 'Lista imunidade', description: 'Protegidos do randomban' },
        ],
      },
    ];

    if (typeof chat.sendListMessage === 'function') {
      if (!Array.isArray(sections)) {
        await msg.reply('⚠️ Falha ao montar menu interativo (sections inválido).');
        return true;
      }

      await chat.sendListMessage(
        '🎛️ *Painel Interativo Maestro*\nEscolha uma ação para executar sem digitar comandos.',
        sections,
        'Abrir painel',
        'Ações rápidas',
        'Bot Maestro'
      );
      return true;
    }

    await msg.reply('⚠️ Cliente atual não suporta lista interativa. Use !comandos.');
    return true;
  }
}

module.exports = WppInteractiveService;
