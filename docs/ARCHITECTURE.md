# Arquitetura do Bot Maestro

Esta arquitetura foi reorganizada para manter os jogos atômicos e independentes.

## Princípios

- **Atomicidade por jogo**: cada jogo vive em seu próprio módulo (`games/<jogo>`).
- **Core compartilhado enxuto**: tudo que é comum entre jogos fica em `games/core`.
- **Configuração por contexto**: regras específicas de um jogo não ficam em `config/` global.
- **Escalabilidade**: adicionar jogo novo não exige misturar regras no mesmo diretório.

## Estrutura

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
  - handlers por canal/contexto (`groupGameHandler`, `dmHandler`, `supremoHandler`).

- `utils/`
  - utilitários realmente transversais ao sistema.

## Convenções para novos jogos

1. Criar `games/<novo-jogo>/`.
2. Colocar as regras e configs específicas dentro desse módulo.
3. Registrar o jogo no `games/core/gameRegistry.js`.
4. Expor comandos no handler de grupo sem acoplar regras a outro jogo.

## Configuração de turno do Paredão

Agora o admin pode iniciar o jogo com configuração explícita:

- `!iniciarparedao` (usa padrão)
- `!iniciarparedao 60 10` (turno de 60 min, atualização de 10 em 10 min)

Com isso, o controle de tempo deixa de ficar hardcoded e passa a ser definido na abertura do jogo.
