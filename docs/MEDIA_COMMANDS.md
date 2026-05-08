# Comandos de media com yt-dlp

O bot suporta download de musica/video por comandos no grupo e no DM. A funcionalidade pode ser ligada ou desligada pelo SUPREMO sem reiniciar o bot.

## Comandos

- `!mp3 Nome da musica`
  - Faz previa do primeiro resultado (`ytsearch1:`), envia a thumbnail, mostra o link e inicia download automatico.
- `!mp4 Nome da musica`
  - Faz previa do primeiro resultado (`ytsearch1:`), envia a thumbnail, mostra o link e inicia download automatico.
- `!mp4a Nome da musica`
  - Baixa audio em M4A.
- `!link URL`
  - Baixa da URL informada (modo automatico: tenta MP4 e fallback para MP3).
- `!link URL mp3`
  - Forca audio MP3.
- `!link URL mp4a`
  - Forca audio M4A.
- `!link URL mp4`
  - Forca video MP4.
- `!buscar texto` ou `!busca texto`
  - Lista 5 resultados de busca, sem baixar.
- `!cancelar ID`
  - Cancela um download em andamento.
- `!maxdownload N`
  - Define o limite maximo permitido em MiB para downloads (somente SUPREMO). Use `0` para sem limite.
- `!musica on`
  - Ativa os downloads de musica (somente SUPREMO).
- `!musica off`
  - Desativa os downloads de musica e cancela downloads em andamento (somente SUPREMO).
- `!musica status`
  - Mostra se os downloads de musica estao ativos.
- `!musichelp`
  - Exibe ajuda rapida dos comandos de media.

## Configuracao

- `PUBLIC_BASE_URL` gera os links temporarios quando o arquivo passa do limite de envio do WhatsApp.
- `MEDIA_STORAGE_DIR` muda a pasta dos arquivos baixados.
- `WHATSAPP_MAX_FILE_SIZE_BYTES` ajusta o limite de envio direto (padrao: 16 MB).
- `YTDLP_TIMEOUT_MS` define o timeout do yt-dlp.
- `MEDIA_MAX_AGE_HOURS` define a idade maxima dos arquivos temporarios.
- `MEDIA_DOWNLOADS_ENABLED=false` inicia o bot com downloads de musica desligados.

## Dependencias

- Node.js 18+
- `yt-dlp`
- `ffmpeg`
