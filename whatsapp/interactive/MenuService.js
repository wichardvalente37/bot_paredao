class MenuService {
  constructor(clientType = 'whatsapp-web.js') {
    this.clientType = clientType;
  }

  getMainOptions() {
    return [
      { id: '!comandos', title: '📚 Ver comandos', description: 'Lista completa de comandos disponíveis' },
      { id: '!entrar', title: '📝 Entrar no jogo', description: 'Entrar na rodada ativa do jogo' },
      { id: '!status', title: '📊 Status do jogo', description: 'Ver estado atual e participantes' },
      { id: '!meuhistorico', title: '📖 Meu histórico', description: 'Últimos jogos e resultados' },
      { id: '!helpmedia', title: '🎬 Mídia e downloads', description: 'Comandos de mídia e links' }
    ];
  }

  async sendMainMenu({ chat, msg }) {
    const options = this.getMainOptions();

    if (this.clientType === 'wppconnect' && typeof chat?.sendListMessage === 'function') {
      await chat.sendListMessage(
        '🤖 *Menu Interativo do Maestro*\nEscolhe uma opção abaixo:',
        [
          {
            title: 'Ações rápidas',
            rows: options.map((item) => ({
              rowId: item.id,
              title: item.title,
              description: item.description,
            })),
          },
        ],
        'Abrir menu',
        'Selecione uma ação',
        'Bot Maestro'
      );
      return true;
    }

    const lines = options.map((item, idx) => `${idx + 1}. ${item.title}\n   ↳ ${item.id} — ${item.description}`);
    await msg.reply(`🤖 *MENU RÁPIDO*\n\n${lines.join('\n')}`);
    return true;
  }
}

module.exports = MenuService;
