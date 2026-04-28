const { getMentionedIds } = require('../../utils/messageUtils');

class SupremoHandler {
  constructor(supremoCommands) {
    this.supremoCommands = supremoCommands;
  }

  async tryHandle({ chat, senderId, command, msg, args = [] }) {
    if (!chat.isGroup || !command.startsWith('!')) return false;

    const mentionedIds = await getMentionedIds(msg);

    if (command === '!helpsupremo') {
      await this.supremoCommands.helpSupremo(chat, senderId);
      return true;
    }

    if (command === '!ban') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.banMember(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !ban @membro');
      }
      return true;
    }


    if (command === '!banagora') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.banImmediate(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !banagora @membro');
      }
      return true;
    }

    if (command === '!randomban') {
      await this.supremoCommands.randomBan(chat, senderId);
      return true;
    }

    if (command === '!imunidadeadd') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.addImmunity(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !imunidadeadd @membro');
      }
      return true;
    }

    if (command === '!imunidaderem') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.removeImmunity(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !imunidaderem @membro');
      }
      return true;
    }

    if (command === '!imunidadelist') {
      await this.supremoCommands.listImmunity(chat, senderId);
      return true;
    }

    if (command === '!aviso') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.addWarning(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !aviso @membro');
      }
      return true;
    }

    if (command === '!limparaviso') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.clearWarning(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !limparaviso @membro');
      }
      return true;
    }

    if (command === '!avisos') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.showWarning(chat, senderId, mentionedIds[0]);
      } else {
        await this.supremoCommands.showWarning(chat, senderId, senderId);
      }
      return true;
    }

    if (command === '!trancar') {
      await this.supremoCommands.lockGroup(chat, senderId);
      return true;
    }

    if (command === '!destrancar') {
      await this.supremoCommands.unlockGroup(chat, senderId);
      return true;
    }

    if (command === '!poder') {
      if (mentionedIds.length > 0) {
        const parsed = Number.parseInt(args[1], 10);
        const duration = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        await this.supremoCommands.grantPower(chat, senderId, mentionedIds[0], duration);
      } else {
        await this.supremoCommands.showPower(chat, senderId);
      }
      return true;
    }

    if (command === '!tirarpoder') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.revokePower(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !tirarpoder @alvo');
      }
      return true;
    }

    if (command === '!humilhar') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.humiliate(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !humilhar @alvo');
      }
      return true;
    }

    if (command === '!elogiofake') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.fakePraise(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !elogiofake @alvo');
      }
      return true;
    }

    if (command === '!pegadinha') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.prank(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !pegadinha @alvo');
      }
      return true;
    }

    if (command === '!fakeerror') {
      await this.supremoCommands.fakeError(chat, senderId);
      return true;
    }

    if (command === '!announce') {
      await this.supremoCommands.dramaticAnnouncement(chat, senderId);
      return true;
    }

    if (command === '!saudar') {
      await this.supremoCommands.greetRoyal(chat, senderId);
      return true;
    }

    if (command === '!apresente-se') {
      await this.supremoCommands.introduceBot(chat);
      return true;
    }

    if (command === '!voteban') {
      if (mentionedIds.length > 0) {
        await this.supremoCommands.fakeVoteBan(chat, senderId, mentionedIds[0]);
      } else {
        await chat.sendMessage('❌ Use: !voteban @alvo');
      }
      return true;
    }

    if (command === '!listasubordinados') {
      await this.supremoCommands.listSubordinates(chat, senderId);
      return true;
    }

    return false;
  }
}

module.exports = SupremoHandler;
