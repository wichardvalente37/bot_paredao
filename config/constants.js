// config/constants.js
module.exports = {
    // Tempos em minutos
    TURN_DURATION: 30,
    TIMER_UPDATE_INTERVAL: 5,
    
    // Estados do jogo
    GAME_STATUS: {
        WAITING: 'waiting',
        ACTIVE: 'active',
        FINISHED: 'finished'
    },
    
    // Estados do jogador
    PLAYER_STATUS: {
        ACTIVE: 'active',
        REMOVED: 'removed',
        QUIT: 'quit'
    },
    
    // Mensagens padrão
    MESSAGES: {
        NOT_IN_GAME: '❌ Você não está no paredão',
        NO_ACTIVE_GAME: '❌ Nenhum paredão ativo',
        NOT_YOUR_TURN: '❌ Não é seu turno',
        QUESTION_TOO_SHORT: '❌ Pergunta muito curta',
        ANSWER_TOO_SHORT: '❌ Resposta muito curta'
    }
};