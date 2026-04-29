class ListMessageBuilder {
  static createMainMenu() {
    const sections = [
      {
        title: 'Jogos',
        rows: [
          { rowId: '!comandos', title: 'Comandos gerais', description: 'Lista completa' },
          { rowId: '!status', title: 'Status da partida', description: 'Resumo do jogo atual' },
        ],
      },
    ];

    return {
      title: '🎛️ *Painel Interativo Maestro*\nEscolha uma ação para executar sem digitar comandos.',
      buttonText: 'Abrir painel',
      description: 'Ações rápidas',
      footer: 'Bot Maestro',
      sections,
    };
  }

  static validate(payload) {
    if (!payload || !Array.isArray(payload.sections)) {
      throw new Error('Payload inválido: sections deve ser um array.');
    }

    for (const section of payload.sections) {
      if (!Array.isArray(section.rows)) {
        throw new Error('Payload inválido: cada section deve conter rows[]');
      }
    }

    return payload;
  }
}

module.exports = ListMessageBuilder;
