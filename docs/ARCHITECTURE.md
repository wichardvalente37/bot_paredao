# Arquitetura do Bot Maestro

Esta arquitetura foi consolidada para manter os jogos isolados, o core enxuto e remover legado que não fazia parte do fluxo real da aplicação.

## Princípios

- **Atomicidade por jogo**: cada jogo vive em seu próprio módulo (`games/<jogo>`).
- **Core compartilhado enxuto**: tudo que é comum entre jogos fica em `games/core`.
- **Sem duplicação de fluxo**: um único entrypoint (`index.js`) e um único orquestrador (`app/BotApplication.js`).
- **Utils realmente transversais**: `utils/` só contém helpers reutilizáveis por múltiplos módulos.
- **Escalabilidade**: adicionar jogo novo não exige misturar regras em módulos existentes.

## Estrutura vigente

- `index.js`
  - bootstrap da aplicação e cliente WhatsApp.

- `app/BotApplication.js`
  - roteamento central de mensagens e eventos.

- `games/core/`
  - `gameRegistry.js`: catálogo dos jogos suportados pelo bot.

- `games/paredao/`
  - `ParedaoGameManager.js`: regras e orquestração do Paredão.
  - `constants.js`: configuração e validação do Paredão (tempo de turno e atualização).

- `games/impostor/`
  - `ImpostorGameManager.js`: fluxo e estado do Impostor.
  - `impostorWords.js`: banco de palavras do Impostor.

- `whatsapp/handlers/`
  - handlers por canal/contexto (`groupGameHandler`, `dmHandler`, `supremoHandler`, `mediaCommandHandler`).

- `media/`
  - `MediaDownloadService.js`: integração com yt-dlp/ffmpeg, busca, download e fallback por link temporário.

- `utils/`
  - `messageUtils.js`: normalização de mensagem e resolução de menções.

## Limpeza arquitetural aplicada

- Removido código legado duplicado (`game/`, `games/paredao/legacy/`, handlers antigos e wrappers não usados).
- Removidos utilitários acoplados a fluxos antigos, mantendo apenas utilitários compartilhados de fato.
- Padronizado uso de helper de mensagens em `utils/` para evitar acoplamento com estrutura de canais.

## Convenções para novos jogos

1. Criar `games/<novo-jogo>/`.
2. Colocar regras e configs específicas dentro desse módulo.
3. Registrar o jogo no `games/core/gameRegistry.js`.
4. Expor comandos no handler de grupo sem acoplar regras a outro jogo.
5. Evitar utilitário específico de jogo em `utils/`; se for específico, manter dentro de `games/<novo-jogo>/`.

## Configuração de turno do Paredão

O admin pode iniciar o jogo com configuração explícita:

- `!iniciarparedao` (usa padrão)
- `!iniciarparedao 60 10` (turno de 60 min, atualização de 10 em 10 min)

Com isso, o controle de tempo deixa de ficar hardcoded e passa a ser definido na abertura do jogo.
