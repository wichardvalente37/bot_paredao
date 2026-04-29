const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const MediaDownloadService = require('../../media/MediaDownloadService');

class MediaCommandHandler {
  constructor() {
    this.mediaService = new MediaDownloadService();
    this.activeDownloads = new Map();
    this.maxDownloadMiB = Number.parseInt(process.env.MEDIA_MAX_DOWNLOAD_MIB || '0', 10) || 0;
  }

  isMediaCommand(command) {
    return ['!mp3', '!mp4', '!mp4a', '!link', '!buscar', '!busca', '!cancelar', '!maxdownload', '!musichelp'].includes(command);
  }


  extractYoutubeVideoId(details) {
    const normalizedId = (details?.id || '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(normalizedId)) return normalizedId;

    const candidates = [details?.url, details?.thumbnail].filter(Boolean);
    for (const rawValue of candidates) {
      try {
        const parsed = new URL(rawValue);
        if (parsed.hostname === 'youtu.be') {
          const fromPath = parsed.pathname.replace(/^\//, '').split('/')[0];
          if (/^[a-zA-Z0-9_-]{11}$/.test(fromPath)) return fromPath;
        }

        const fromQuery = parsed.searchParams.get('v');
        if (/^[a-zA-Z0-9_-]{11}$/.test(fromQuery || '')) return fromQuery;

        const fromEmbedPath = parsed.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
        if (fromEmbedPath?.[1]) return fromEmbedPath[1];

        const fromImgPath = parsed.pathname.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
        if (fromImgPath?.[1]) return fromImgPath[1];
      } catch {
        // ignora URL inválida
      }
    }

    return null;
  }

  buildPreviewThumbnailCandidates(details) {
    const candidates = [];

    // Prioriza thumbs JPEG/PNG do domínio oficial do YouTube.
    // Alguns links de thumbnail retornam WEBP/HTML e o WhatsApp envia "imagem vazia".
    const videoId = this.extractYoutubeVideoId(details);
    if (videoId) {
      candidates.push(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`);
      candidates.push(`https://i.ytimg.com/vi/${videoId}/sddefault.jpg`);
      candidates.push(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
      candidates.push(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    }

    if (details?.thumbnail && /\.(jpe?g|png)(?:\?|$)/i.test(details.thumbnail)) {
      candidates.push(details.thumbnail);
    }

    return [...new Set(candidates.filter(Boolean))];
  }

  async sendPreviewWithThumbnail(chat, msg, details, previewCaption) {
    const thumbTarget = details?.url || (details?.id ? `https://www.youtube.com/watch?v=${details.id}` : null);
    if (thumbTarget) {
      try {
        const thumbPath = await this.mediaService.downloadPreviewThumbnail(thumbTarget);
        if (thumbPath) {
          const thumb = MessageMedia.fromFilePath(thumbPath);
          await chat.sendMessage(thumb, { caption: previewCaption });
          return true;
        }
      } catch (error) {
        console.warn('⚠️ Falha ao gerar thumbnail de prévia com yt-dlp:', error.message);
      }
    }

    const thumbnailUrls = this.buildPreviewThumbnailCandidates(details);
    for (const url of thumbnailUrls) {
      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) throw new Error(`Conteúdo inválido: ${contentType || 'desconhecido'}`);

        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new Error('Thumbnail vazia');

        const thumb = new MessageMedia(contentType, bytes.toString('base64'), `thumb-${details?.id || Date.now()}.jpg`);
        await chat.sendMessage(thumb, { caption: previewCaption });
        return true;
      } catch (error) {
        console.warn(`⚠️ Falha ao enviar thumbnail de prévia (${url}):`, error.message);
      }
    }

    await msg.reply(previewCaption);
    return false;
  }

  async tryHandle({ msg, command, args, text }) {
    if (!this.isMediaCommand(command)) return false;

    if (command === '!musichelp') {
      await msg.reply(
        `🎵 *COMANDOS DE MÍDIA*\n\n` +
        `• *!mp3 Nome da música* → baixa áudio do 1º resultado (ytsearch1)\n` +
        `• *!mp4 Nome da música* → baixa vídeo do 1º resultado (ytsearch1)\n` +
        `• *!mp4a Nome da música* → baixa áudio em M4A (melhor qualidade)\n` +
        `• *!link URL* → baixa da URL (auto: tenta mp4 e fallback mp3)\n` +
        `• *!link URL mp3* → força áudio MP3\n` +
        `• *!link URL mp4a* → força áudio M4A\n` +
        `• *!link URL mp4* → força vídeo MP4\n` +
        `• *!buscar*/*!busca texto* → lista os 5 primeiros resultados sem baixar\n` +
        `• *!mp3 Nome* → mostra capa + link e inicia download automático\n` +
        `• *!cancelar ID* → cancela download em andamento\n` +
        `• *!maxdownload N* → define limite máximo em MiB (somente SUPREMO)`
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

      if (command === '!maxdownload') {
        const senderId = msg.author || msg.from;
        const supremoId = process.env.SUPREMO_ID || '';
        if (!supremoId || senderId !== supremoId) {
          await msg.reply('❌ Apenas o SUPREMO pode alterar o limite máximo de download.');
          return true;
        }

        const value = Number.parseInt((args[0] || '').trim(), 10);
        if (!Number.isFinite(value) || value < 0) {
          await msg.reply('❌ Use: *!maxdownload N* (N em MiB, 0 = sem limite).');
          return true;
        }

        this.maxDownloadMiB = value;
        await msg.reply(`✅ Limite máximo definido para *${value} MiB*.`);
        return true;
      }

      if (command === '!mp3' || command === '!mp4' || command === '!mp4a') {
        const query = args.join(' ').trim();
        if (!query) {
          await msg.reply(`❌ Use: *${command} Nome da música*`);
          return true;
        }

        const format = command === '!mp3' ? 'mp3' : command === '!mp4a' ? 'mp4a' : 'mp4';
        const details = await this.mediaService.getTopResultDetails(query);
        const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const key = await this.buildPendingKey(msg, requestId);
        const chat = await msg.getChat();
        const previewCaption =
          `🎯 *Prévia do download*\n` +
          `🆔 ID: *${requestId}*\n` +
          `🎬 ${details.title}\n` +
          `${details.uploader ? `📺 ${details.uploader}\n` : ''}` +
          `${details.durationSec ? `⏱️ ${this.formatDuration(details.durationSec)}\n` : ''}` +
          `${details.url ? `🔗 ${details.url}\n` : ''}` +
          `\n⏬ Download iniciado automaticamente.\n` +
          `❌ Para cancelar: *!cancelar ${requestId}*`;

        await this.sendPreviewWithThumbnail(chat, msg, details, previewCaption);

        const job = { canceled: false, cancel: null };
        this.activeDownloads.set(key, job);
        this.processDownloadJob({ msg, key, requestId, query, format, job });
        return true;
      }

      if (command === '!cancelar') {
        const requestId = (args[0] || '').trim();
        if (!requestId) {
          await msg.reply(`❌ Use: *${command} ID*`);
          return true;
        }

        const key = await this.buildPendingKey(msg, requestId);
        const active = this.activeDownloads.get(key);
        if (!active) {
          await msg.reply('❌ ID não encontrado ou já finalizado.');
          return true;
        }

        active.canceled = true;
        if (typeof active.cancel === 'function') active.cancel();
        this.activeDownloads.delete(key);
        await msg.reply(`✅ Download *${requestId}* cancelado.`);
        return true;
      }

      if (command === '!link') {
        const [url, forcedFormatRaw] = args;
        const forcedFormat = ['mp3', 'mp4', 'mp4a'].includes((forcedFormatRaw || '').toLowerCase())
          ? forcedFormatRaw.toLowerCase()
          : null;

        if (!url || !/^https?:\/\//i.test(url)) {
          await msg.reply('❌ Use: *!link URL* ou *!link URL mp3/mp4a/mp4*');
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

  async processDownloadJob({ msg, key, requestId, query, format, job }) {
    try {
      const download = await this.mediaService.downloadFromQuery(query, format, {
        onSpawn: (child) => {
          job.cancel = () => child.kill('SIGKILL');
          if (job.canceled) job.cancel();
        },
      });

      if (job.canceled) return;
      this.activeDownloads.delete(key);
      await this.sendDownloadedMedia(msg, download);
    } catch (error) {
      this.activeDownloads.delete(key);
      if (job.canceled) return;
      await msg.reply(`❌ Erro no download *${requestId}*: ${error.message}`);
    }
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
    if (this.maxDownloadMiB > 0 && download.sizeBytes > (this.maxDownloadMiB * 1024 * 1024)) {
      await msg.reply(
        `⚠️ Download bloqueado: arquivo com ${sizeMb} MB excede o limite atual de ${this.maxDownloadMiB} MiB.`
      );
      return;
    }

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
