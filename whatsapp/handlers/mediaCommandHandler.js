const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const MediaDownloadService = require('../../media/MediaDownloadService');

class MediaCommandHandler {
  constructor() {
    this.mediaService = new MediaDownloadService();
  }

  isMediaCommand(command) {
    return ['!mp3', '!mp4', '!link', '!buscar', '!musichelp'].includes(command);
  }

  async tryHandle({ msg, command, args, text }) {
    if (!this.isMediaCommand(command)) return false;

    if (command === '!musichelp') {
      await msg.reply(
        `🎵 *COMANDOS DE MÍDIA*\n\n` +
        `• *!mp3 Nome da música* → baixa áudio do 1º resultado (ytsearch1)\n` +
        `• *!mp4 Nome da música* → baixa vídeo do 1º resultado (ytsearch1)\n` +
        `• *!link URL* → baixa da URL (auto: tenta mp4 e fallback mp3)\n` +
        `• *!link URL mp3* → força áudio MP3\n` +
        `• *!link URL mp4* → força vídeo MP4\n` +
        `• *!buscar texto* → lista os 5 primeiros resultados sem baixar`
      );
      return true;
    }

    try {
      if (command === '!buscar') {
        const query = args.join(' ').trim();
        if (!query) {
          await msg.reply('❌ Use: *!buscar texto da música*');
          return true;
        }

        await msg.reply('🔎 Buscando os 5 primeiros resultados...');
        const results = await this.mediaService.searchTopResults(query, 5);

        if (results.length === 0) {
          await msg.reply('❌ Nenhum resultado encontrado.');
          return true;
        }

        const body = results
          .map((item, index) => `${index + 1}. ${item.title}\n${item.url}`)
          .join('\n\n');

        await msg.reply(`🎯 *Resultados para:* ${query}\n\n${body}`);
        return true;
      }

      if (command === '!mp3' || command === '!mp4') {
        const query = args.join(' ').trim();
        if (!query) {
          await msg.reply(`❌ Use: *${command} Nome da música*`);
          return true;
        }

        const format = command === '!mp3' ? 'mp3' : 'mp4';
        await msg.reply(`⏳ Processando *${format.toUpperCase()}* para: ${query}`);
        const download = await this.mediaService.downloadFromQuery(query, format);
        await this.sendDownloadedMedia(msg, download);
        return true;
      }

      if (command === '!link') {
        const [url, forcedFormatRaw] = args;
        const forcedFormat = ['mp3', 'mp4'].includes((forcedFormatRaw || '').toLowerCase())
          ? forcedFormatRaw.toLowerCase()
          : null;

        if (!url || !/^https?:\/\//i.test(url)) {
          await msg.reply('❌ Use: *!link URL* ou *!link URL mp3/mp4*');
          return true;
        }

        await msg.reply(`⏳ Baixando conteúdo da URL (${forcedFormat || 'auto'})...`);
        const download = await this.mediaService.downloadFromUrl(url, forcedFormat);
        await this.sendDownloadedMedia(msg, download);
        return true;
      }
    } catch (error) {
      await msg.reply(`❌ Erro ao processar mídia: ${error.message}`);
      return true;
    }

    return false;
  }

  async sendDownloadedMedia(msg, download) {
    const sizeMb = (download.sizeBytes / (1024 * 1024)).toFixed(2);

    if (download.directDownloadRecommended) {
      const media = MessageMedia.fromFilePath(download.filePath);
      const caption =
        `✅ *Download concluído*\n` +
        `🎬 ${download.title}\n` +
        `📦 ${sizeMb} MB\n` +
        `🔗 ${download.webpageUrl}`;

      const chat = await msg.getChat();
      await chat.sendMessage(media, { caption, sendMediaAsDocument: true });
      return;
    }

    await msg.reply(
      `⚠️ O arquivo ficou grande (${sizeMb} MB) para envio direto no WhatsApp.\n` +
      `Use este link temporário para baixar:\n${download.publicUrl}\n\n` +
      `🗂️ Arquivo: ${path.basename(download.filePath)}`
    );
  }
}

module.exports = MediaCommandHandler;
