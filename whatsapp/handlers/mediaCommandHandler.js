const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const MediaDownloadService = require('../../media/MediaDownloadService');

class MediaCommandHandler {
  constructor() {
    this.mediaService = new MediaDownloadService();
    this.pendingDownloads = new Map();
  }

  isMediaCommand(command) {
    return ['!mp3', '!mp4', '!link', '!buscar', '!busca', '!confirmar', '!cancelar', '!musichelp'].includes(command);
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
        `• *!buscar*/*!busca texto* → lista os 5 primeiros resultados sem baixar\n` +
        `• *!mp3 Nome* → prepara download e pede confirmação\n` +
        `• *!confirmar ID* → confirma download pendente\n` +
        `• *!cancelar ID* → cancela download pendente`
      );
      return true;
    }

    try {
      if (command === '!buscar' || command === '!busca') {
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
        const details = await this.mediaService.getTopResultDetails(query);
        const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const key = await this.buildPendingKey(msg, requestId);
        this.pendingDownloads.set(key, {
          query,
          format,
          createdAt: Date.now(),
        });

        await msg.reply(
          `🎯 *Prévia do download*\n` +
          `🆔 ID: *${requestId}*\n` +
          `🎬 ${details.title}\n` +
          `${details.uploader ? `📺 ${details.uploader}\n` : ''}` +
          `${details.durationSec ? `⏱️ ${this.formatDuration(details.durationSec)}\n` : ''}` +
          `${details.url ? `🔗 ${details.url}\n` : ''}` +
          `${details.thumbnail ? `🖼️ Thumbnail: ${details.thumbnail}\n` : ''}\n` +
          `✅ Para baixar: *!confirmar ${requestId}*\n` +
          `❌ Para cancelar: *!cancelar ${requestId}*`
        );
        return true;
      }

      if (command === '!confirmar' || command === '!cancelar') {
        const requestId = (args[0] || '').trim();
        if (!requestId) {
          await msg.reply(`❌ Use: *${command} ID*`);
          return true;
        }

        const key = await this.buildPendingKey(msg, requestId);
        const pending = this.pendingDownloads.get(key);
        if (!pending) {
          await msg.reply('❌ ID não encontrado ou expirado.');
          return true;
        }

        if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
          this.pendingDownloads.delete(key);
          await msg.reply('⌛ Esse pedido expirou (10 min). Faça um novo comando.');
          return true;
        }

        if (command === '!cancelar') {
          this.pendingDownloads.delete(key);
          await msg.reply(`✅ Download *${requestId}* cancelado.`);
          return true;
        }

        this.pendingDownloads.delete(key);
        await msg.reply(`⏳ Processando *${pending.format.toUpperCase()}* para: ${pending.query}`);
        const download = await this.mediaService.downloadFromQuery(pending.query, pending.format);
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

  async buildPendingKey(msg, requestId) {
    const chat = await msg.getChat();
    return `${chat.id._serialized}:${requestId}`;
  }

  formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    return `${mm}:${String(ss).padStart(2, '0')}`;
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
