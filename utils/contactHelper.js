class ContactHelper {
    constructor(client) {
        this.client = client;
        this.contactCache = new Map();
    }
    
    async getContactSafe(contactId) {
        try {
            // Verificar cache primeiro
            if (this.contactCache.has(contactId)) {
                return this.contactCache.get(contactId);
            }
            
            // Tentar buscar contato
            let contact;
            try {
                contact = await this.client.getContactById(contactId);
            } catch (error) {
                // Se falhar, criar contato básico
                contact = this.createBasicContact(contactId);
            }
            
            // Cachear por 5 minutos
            this.contactCache.set(contactId, contact);
            setTimeout(() => this.contactCache.delete(contactId), 300000);
            
            return contact;
        } catch (error) {
            console.log(`⚠️ Erro ao buscar contato ${contactId}:`, error.message);
            return this.createBasicContact(contactId);
        }
    }
    
    createBasicContact(contactId) {
        const number = contactId.split('@')[0];
        return {
            id: {
                _serialized: contactId,
                user: number
            },
            name: `Usuário ${number}`,
            pushname: `Usuário ${number}`,
            number: number,
            isUser: true,
            isGroup: false,
            isWAContact: false,
            isMyContact: false
        };
    }
    
    async getContactName(contactId) {
        try {
            const contact = await this.getContactSafe(contactId);
            return contact.name || contact.pushname || `Usuário ${contactId.split('@')[0]}`;
        } catch (error) {
            return `Usuário ${contactId.split('@')[0]}`;
        }
    }
    
    async getContactBio(contactId) {
        try {
            const contact = await this.getContactSafe(contactId);
            return contact.about || '';
        } catch (error) {
            return '';
        }
    }
    
    async getProfilePic(contactId) {
        try {
            const contact = await this.getContactSafe(contactId);
            return await contact.getProfilePicUrl() || null;
        } catch (error) {
            return null;
        }
    }
    
    clearCache() {
        this.contactCache.clear();
    }
}

module.exports = ContactHelper;