# WPPConnect Standalone (Completo)

Versão isolada do bot para operar **somente** com `@wppconnect-team/wppconnect`, separada da runtime híbrida.

## O que já está coberto
- Bootstrap exclusivo em WPPConnect (`src/index.js`).
- Arquitetura dedicada (`src/app/WppConnectApplication.js`) com `clientType: wppconnect`.
- Adapter WPPConnect com recursos de experiência:
  - mensagens com menção,
  - menus de lista,
  - botões interativos,
  - enquetes,
  - envio de imagem/arquivo,
  - reação e remoção de mensagem (quando disponível),
  - typing start/stop,
  - gerenciamento de participantes (promover/rebaixar/remover).
- Builder validado de listas interativas (`ListMessageBuilder.validate`).

## Estrutura
- `src/index.js`: ponto de entrada WPPConnect-only.
- `src/app/`: composição da aplicação com handlers e managers atuais.
- `src/client/`: adapters e contratos de cliente.
- `src/interactive/`: payload builders e validações de UX.
- `src/handlers/`: espaço para handlers específicos de WPPConnect.
- `src/config/` e `src/utils/`: extensões futuras.

## Como rodar
```bash
cd wppconnect-standalone
npm start
```

## Objetivo de produto
Evoluir uma execução WPPConnect-first com paridade funcional prática em relação ao fluxo atual do bot e menor chance de regressão entre engines.
