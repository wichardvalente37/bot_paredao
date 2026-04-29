async function getMentionedIds(msg) {
  if (Array.isArray(msg.mentionedIds) && msg.mentionedIds.length > 0) {
    return msg.mentionedIds;
  }

  if (typeof msg.getMentions === 'function') {
    try {
      const mentions = await msg.getMentions();
      return mentions.map((contact) => contact.id._serialized);
    } catch (error) {
      return [];
    }
  }

  return [];
}

function normalizeText(msg) {
  const selectedRowId = msg?.selectedRowId || msg?.listResponse?.singleSelectReply?.selectedRowId;
  const selectedButtonId = msg?.selectedButtonId || msg?.buttonsResponseMessage?.selectedButtonId;
  const hydratedButtonId = msg?.templateButtonReplyMessage?.selectedId;

  const interactiveCommand = selectedRowId || selectedButtonId || hydratedButtonId;
  if (interactiveCommand) return String(interactiveCommand).trim();

  return (msg.body || msg.content || '').trim();
}

module.exports = {
  getMentionedIds,
  normalizeText,
};
