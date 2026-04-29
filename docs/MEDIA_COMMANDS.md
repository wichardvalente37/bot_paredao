# Comandos de Mídia com yt-dlp

Este bot agora suporta download de música/vídeo por comandos no grupo **e no DM**.

## Novos comandos

- `!mp3 Nome da música`
  - Faz prévia do primeiro resultado (`ytsearch1:`), envia a thumbnail (capa), mostra o link e inicia download automático.
- `!mp4 Nome da música`
  - Faz prévia do primeiro resultado (`ytsearch1:`), envia a thumbnail (capa), mostra o link e inicia download automático.
- `!link URL`
  - Baixa da URL informada (modo automático: tenta MP4 e fallback para MP3).
- `!link URL mp3`
  - Força áudio MP3.
- `!link URL mp4`
  - Força vídeo MP4.
- `!buscar texto`
  - Lista 5 resultados de busca (título + URL), sem baixar.
- `!busca texto`
  - Alias de `!buscar`.
- `!cancelar ID`
  - Cancela um download em andamento.
- `!maxdownload N`
  - Define o limite máximo permitido em MiB para downloads (somente SUPREMO, funciona no grupo e DM). Use `0` para sem limite.
- `!musichelp`
  - Exibe ajuda rápida dos comandos de mídia.

## Regras técnicas aplicadas

- Busca textual usa `ytsearch1:` para download rápido do primeiro resultado.
- MP3 usa `--extract-audio --audio-format mp3`.
- MP4 usa `-f bestvideo+bestaudio/best --merge-output-format mp4`.
- Há tratamento de erro para:
  - timeout de download;
  - vídeo indisponível;
  - restrição de idade;
  - falha genérica do yt-dlp.

## Envio no WhatsApp e fallback de tamanho

- Se o arquivo for até ~16 MB, o bot envia direto no WhatsApp (como documento).
- Se ultrapassar o limite, o bot responde com um link temporário de download em:
  - `PUBLIC_BASE_URL/media/<arquivo>`

## Como rodar

### Dependências de sistema

Instale no host/container:

- Node.js 18+
- `yt-dlp`
- `ffmpeg`

### Variáveis úteis

- `PUBLIC_BASE_URL` (ex.: `https://seu-bot.onrender.com`) para geração dos links temporários.
- `MEDIA_STORAGE_DIR` para mudar pasta de arquivos baixados.
- `WHATSAPP_MAX_FILE_SIZE_BYTES` para ajustar limite de envio (padrão: 16MB).
- `YTDLP_TIMEOUT_MS` para timeout do yt-dlp.
- `MEDIA_MAX_AGE_HOURS` para limpeza automática de arquivos antigos.

### Inicialização

```bash
npm install
npm start
```

Depois escaneie o QR em `/qr`.
