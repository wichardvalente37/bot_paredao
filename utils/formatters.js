class Formatters {
    static formatTurnStart(player, hasPhoto = false) {
        let message = `@${player.name.split(' ')[0]} NO PAREDÃO\n\n`;
        
        if (player.bio) {
            message += `📍 ${player.bio}\n\n`;
        }
        
        message += `Enviem perguntas no meu DM\nResponderei aqui as respostas`;
        
        return message;
    }

    static formatAnswer(player, question, answer) {
        return `${player.name}\n\n> ${question}\n\n${answer}`;
    }

    static formatTimerUpdate(player, minutes, stats) {
        return `⏰ ${minutes} minutos de ${player.name} no paredão\n${stats.received} perguntas recebidas • ${stats.answered} respondidas`;
    }

    static formatTurnEnd(player, stats) {
        return `📊 Turno de ${player.name} finalizado\n${stats.duration} minutos • ${stats.received} perguntas\n${stats.answered} respondidas • ${stats.ignored} não respondidas`;
    }

    static formatNextPlayer(player) {
        return `Próximo: @${player.name.split(' ')[0]}\n\nPreparem as perguntas...`;
    }

    // Para DM
    static formatDMQuestion(question) {
        return `📨 Nova pergunta:\n\n${question}`;
    }

    static formatDMInstructions() {
        return `🔥 SEU TURNO COMEÇOU\n\nVocê está no paredão agora.\nAs perguntas chegarão aqui.\n\nCOMO RESPONDER:\n1. Toque e segure na pergunta\n2. Toque em "Responder"\n3. Digite sua resposta\n4. Envie\n\nSua resposta aparecerá no grupo automaticamente.`;
    }

    static formatDMInstructions() {
        return `🔥 SEU TURNO NO PAREDÃO\n\nVocê está na berlinda agora.\nAs perguntas chegarão aqui.\n\nCOMO RESPONDER:\n1. Toque e segure na pergunta\n2. Toque em "Responder" (setinha)\n3. Digite sua resposta\n4. Envie\n\nSua resposta aparecerá no grupo automaticamente.\n\n⚠️ Não responda diretamente, use o botão "Responder".`;
    }
    
    static formatDMQuestion(question) {
        return `📨 NOVA PERGUNTA:\n\n${question}\n\n(Anônima - responda usando "Responder")`;
    }
    
    static formatDMRevealedQuestion(question, askerName) {
        return `📨 PERGUNTA DE ${askerName}:\n\n${question}\n\n(Responda usando "Responder")`;
    }
    
    static formatJoinConfirmation(position, totalPlayers) {
        return `✅ VOCÊ ENTROU NO PAREDÃO\n\nPosição: ${position}º de ${totalPlayers}\nAguarde o sorteio da ordem.`;
    }
    
    static formatTurnNotification(playerName, position) {
        return `🎤 SUA VEZ CHEGOU!\n\n${playerName} está no paredão agora.\nVocê é o ${position}º na fila.\nPrepare-se...`;
    }
    
    static formatErrorNotInGame() {
        return `❌ Você não está no paredão atual.\nUse !entrar no grupo para participar.`;
    }
    
    static formatErrorNoActiveGame() {
        return `❌ Nenhum paredão ativo no momento.\nAguarde um admin iniciar.`;
    }
    
    static formatAdminCommandExecuted() {
        return `⚡ Comando executado.\nOrdem do Supremo cumprida.`;
    }
}

module.exports = Formatters;