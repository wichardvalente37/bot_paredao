class MenuService {
  getMainOptions() {
    return [
      { id: '!comandos', title: 'Ver comandos', description: 'Lista completa de comandos disponiveis' },
      { id: '!entrar', title: 'Entrar no jogo', description: 'Entrar na rodada ativa do jogo' },
      { id: '!status', title: 'Status do jogo', description: 'Ver estado atual e participantes' },
      { id: '!meuhistorico', title: 'Meu historico', description: 'Ultimos jogos e resultados' },
      { id: '!musichelp', title: 'Midia e downloads', description: 'Comandos de midia e links' },
    ];
  }

  async sendMainMenu({ msg }) {
    const options = this.getMainOptions();
    const lines = options.map((item, index) => `${index + 1}. ${item.title}\n   -> ${item.id} - ${item.description}`);
    await msg.reply(`*MENU RAPIDO*\n\n${lines.join('\n')}`);
    return true;
  }
}

module.exports = MenuService;
