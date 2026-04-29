# WPPConnect - execução dedicada e interação avançada

## Rodar somente WPPConnect

```bash
WHATSAPP_CLIENT=wppconnect \
WPPCONNECT_SESSION=maestro-bot \
WPPCONNECT_TOKEN_STORE=/tmp/.wwebjs_auth \
node index.js
```

> Se quiser alternar para o cliente antigo: `WHATSAPP_CLIENT=whatsapp-web.js`.

## O que foi separado para o modo WPPConnect

- Painel interativo com listas dinâmicas em `!menu`, `!painel` e `!start`.
- O painel mapeia seleção para comandos já existentes (sem quebrar fluxos do `whatsapp-web.js`).
- Respostas interativas (row/button ids) são traduzidas para comandos no parser central.

## Como expandir (sem quebrar wweb.js)

1. Adicionar nova seção no `whatsapp/interactive/WppInteractiveService.js`.
2. Definir `rowId` com o comando existente (ex.: `!votar`, `!encerrarvotacao`).
3. O roteador atual já processa automaticamente via `normalizeText`.
