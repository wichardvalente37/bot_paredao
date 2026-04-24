class MentionHelper {
    static extractNumberFromMention(mention) {
        // Extrair número de @5511999999999
        const match = mention.match(/@(\d+)/);
        return match ? match[1] : null;
    }
    
    static formatMention(number) {
        return `@${number}`;
    }
    
    static async getContactFromMention(mention, chat, client) {
        const number = this.extractNumberFromMention(mention);
        if (!number) return null;
        
        try {
            // Buscar participante no grupo
            const participants = await chat.participants;
            const participant = participants.find(p => p.id.user === number);
            
            if (participant) {
                return {
                    id: participant.id._serialized,
                    number: participant.id.user,
                    isAdmin: participant.isAdmin || participant.isSuperAdmin || false
                };
            }
            
            // Se não encontrou no grupo, tentar buscar como contato
            const contactId = `${number}@c.us`;
            const contact = await client.getContactById(contactId);
            
            return {
                id: contact.id._serialized,
                number: contact.id.user,
                name: contact.name || contact.pushname,
                isAdmin: false
            };
            
        } catch (error) {
            console.log('Erro ao buscar contato da menção:', error);
            return null;
        }
    }
    
    static async createMention(playerId, client) {
        try {
            const contact = await client.getContactById(playerId);
            return `@${contact.id.user}`;
        } catch (error) {
            console.log('Erro ao criar menção:', error);
            return `@${playerId.split('@')[0]}`;
        }
    }
}

module.exports = MentionHelper;