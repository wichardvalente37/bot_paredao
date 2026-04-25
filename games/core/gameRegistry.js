const GAME_REGISTRY = {
  paredao: {
    key: 'paredao',
    name: 'Paredão',
    description: 'Jogo de perguntas e respostas por turno.'
  },
  impostor: {
    key: 'impostor',
    name: 'Impostor',
    description: 'Jogo de papéis secretos com partilhas e votação.'
  }
};

function listGames() {
  return Object.values(GAME_REGISTRY);
}

function getGameDefinition(key) {
  return GAME_REGISTRY[key] || null;
}

function isSupportedGame(key) {
  return Boolean(getGameDefinition(key));
}

module.exports = {
  GAME_REGISTRY,
  listGames,
  getGameDefinition,
  isSupportedGame
};
