const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MEDIA_DIR = process.env.MEDIA_STORAGE_DIR || path.join(__dirname, '..', 'tmp', 'media');
const MAX_WHATSAPP_FILE_SIZE = Number.parseInt(process.env.WHATSAPP_MAX_FILE_SIZE_BYTES || `${16 * 1024 * 1024}`, 10);
const DOWNLOAD_TIMEOUT_MS = Number.parseInt(process.env.YTDLP_TIMEOUT_MS || `${4 * 60 * 1000}`, 10);

class MediaDownloadService {
  constructor() {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  getMediaDirectory() {
    return MEDIA_DIR;
  }

  buildPublicUrl(filename) {
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
    return `${baseUrl.replace(/\/$/, '')}/media/${encodeURIComponent(filename)}`;
  }

  isTooLargeForWhatsApp(bytes) {
    return Number.isFinite(bytes) && bytes > MAX_WHATSAPP_FILE_SIZE;
  }

  cleanupExpiredFiles(maxAgeHours = Number.parseInt(process.env.MEDIA_MAX_AGE_HOURS || '6', 10)) {
    try {
      const files = fs.readdirSync(MEDIA_DIR);
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      for (const file of files) {
        const fullPath = path.join(MEDIA_DIR, file);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        if ((now - stat.mtimeMs) > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      }
    } catch (error) {
      console.warn('⚠️ Falha ao limpar mídias antigas:', error.message);
    }
  }

  async searchTopResults(query, limit = 5) {
    const lines = await this.runYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch${limit}:${query}`,
    ], 60_000);

    const results = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map((item) => ({
        title: item.title || item.fulltitle || 'Sem título',
        url: item.url?.startsWith('http') ? item.url : `https://www.youtube.com/watch?v=${item.id}`,
      }));

    return results.slice(0, limit);
  }

  async getTopResultDetails(query) {
    const lines = await this.runYtDlp([
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      `ytsearch1:${query}`,
    ], 60_000);

    const raw = lines.join('\n');
    let item;
    try {
      item = JSON.parse(raw);
    } catch {
      throw new Error('Não consegui interpretar o resultado da busca.');
    }

    const durationSec = Number.isFinite(item.duration) ? item.duration : null;
    return {
      id: item.id || null,
      title: item.title || item.fulltitle || 'Sem título',
      url: item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null),
      durationSec,
      uploader: item.uploader || item.channel || null,
      thumbnail: item.thumbnail || null,
    };
  }

  async downloadFromQuery(query, format, options = {}) {
    const target = `ytsearch1:${query}`;
    return this.downloadTarget(target, format, options);
  }

  async downloadFromUrl(url, forcedFormat, options = {}) {
    if (forcedFormat) {
      return this.downloadTarget(url, forcedFormat, options);
    }

    try {
      return await this.downloadTarget(url, 'mp4', options);
    } catch (error) {
      return this.downloadTarget(url, 'mp3', options);
    }
  }

  async downloadTarget(target, format, options = {}) {
    this.cleanupExpiredFiles();

    const outputTemplate = path.join(MEDIA_DIR, `${Date.now()}-${crypto.randomUUID()}-%(title).80s-%(id)s.%(ext)s`);
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--print', 'title',
      '--print', 'webpage_url',
      '--print', 'after_move:filepath',
      '-o', outputTemplate,
    ];

    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      args.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
    }

    args.push(target);

    const lines = await this.runYtDlp(args, DOWNLOAD_TIMEOUT_MS, options);
    const [title, webpageUrl, filePathRaw] = lines.slice(-3);
    const filePath = filePathRaw && fs.existsSync(filePathRaw) ? filePathRaw : this.findLatestDownloadedFile();

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Arquivo não encontrado após download.');
    }

    const stat = fs.statSync(filePath);

    return {
      title: title || path.basename(filePath),
      webpageUrl: webpageUrl || target,
      filePath,
      filename: path.basename(filePath),
      sizeBytes: stat.size,
      format,
      directDownloadRecommended: !this.isTooLargeForWhatsApp(stat.size),
      publicUrl: this.buildPublicUrl(path.basename(filePath)),
    };
  }

  findLatestDownloadedFile() {
    const files = fs.readdirSync(MEDIA_DIR)
      .map((name) => ({
        name,
        fullPath: path.join(MEDIA_DIR, name),
        stat: fs.statSync(path.join(MEDIA_DIR, name)),
      }))
      .filter((file) => file.stat.isFile())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    return files[0]?.fullPath || null;
  }

  runYtDlp(args, timeoutMs, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('yt-dlp', args, {
        env: process.env,
      });
      if (typeof options.onSpawn === 'function') {
        options.onSpawn(child);
      }

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Tempo limite atingido no yt-dlp.'));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        if (error.code === 'ENOENT') {
          reject(new Error('yt-dlp não está instalado no ambiente.'));
          return;
        }
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          const lower = stderr.toLowerCase();
          if (lower.includes('sign in to confirm your age') || lower.includes('age-restricted')) {
            reject(new Error('Conteúdo com restrição de idade.'));
            return;
          }
          if (lower.includes('video unavailable') || lower.includes('not available')) {
            reject(new Error('Vídeo indisponível.'));
            return;
          }
          reject(new Error(`Falha no yt-dlp: ${stderr.split('\n').filter(Boolean).slice(-2).join(' | ') || 'erro desconhecido'}`));
          return;
        }

        const lines = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        resolve(lines);
      });
    });
  }
}

module.exports = MediaDownloadService;
