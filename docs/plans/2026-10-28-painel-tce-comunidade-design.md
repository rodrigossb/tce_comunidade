# Painel TCE na Comunidade — 9ª Edição (Oiapoque e Manga) · Design

Data: 2026-10-28. Fonte dos dados: pasta do Drive com `Tabela com links COM AJUSTES FINAIS LEON.docx`
(programação por curso) e `SERVIÇOS DO TCE NA COMUNIDADE 1.pdf` (serviços por pilar).

## Objetivo
Duas páginas públicas, sem login, para o público presente na escola durante o evento (03 a 07/11/2026):

1. **Modo TV** (`tv.html`): mural de leitura a distância, sem interação, com rodízio de telas e QR code
   para abrir o app. Responde "o que está acontecendo agora, em qual sala, e o que vem a seguir".
2. **App** (`index.html`): catálogo completo com busca, filtros (dia, turno, local, tema), detalhe de
   curso (sessões, sala, público, vagas, link de inscrição), serviços por pilar, favoritos, lembrete
   (.ics) e compartilhamento. Hash-routing para deep link (`#curso/116`, `#servico/pilar-1`).

## Abordagens consideradas
- **A. Site estático (escolhida)** — HTML/CSS/JS puros, dados em `js/data.js`, QR gerado no navegador
  (`vendor/qrcode.js`, sem rede). Zero build, zero servidor: serve em qualquer nginx/GitHub Pages ou
  abrindo o arquivo. Ideal para um evento de 5 dias e dados fechados.
- B. Reaproveitar o Next.js do `joaquim_nabuco` (admin + SQLite). Mais poder do que o necessário:
  exigiria importar os dados no banco, build e processo Node; o visual de TV é reaproveitado via CSS.
- C. Google Sheets como fonte + fetch. Dependência de rede na TV e de credenciais/CORS. Descartada.

## Arquitetura
```
index.html        app (celular / desktop)        tv.html      modo TV
css/app.css       css/tv.css                     css/base.css tokens + reset comuns
js/data.js        evento, locais, cursos, serviços (fonte única)
js/shared.js      relógio (America/Belem, simulável com ?t=HH:MM&d=AAAA-MM-DD), turnos, formatação
js/icons.js       ícones SVG inline (estilo lucide)
js/tv.js          playlist + rotação + quadro de salas + QR
js/app.js         rotas por hash, busca/filtros, folhas de detalhe, favoritos, .ics, share
vendor/qrcode.js  gerador de QR (MIT, Kazuhiko Arase)
```

## Modelo de dados (`js/data.js`)
- `event`: nome, edição, cidade, datas, fuso, organizador, janelas dos turnos (manhã 08–12, tarde 14–18,
  noite 18–22).
- `venues`: `jn` Joaquim Nabuco, `manga`, `sebrae`, `auditorio`, com salas.
- `courses[]`: `id` (nº do curso no ESCON), `title`, `short`, `hours`, `audience`, `seats`, `link`,
  `tags[]`, `sessions[]` = `{date, time, venue, room, link?, label?}`. Célula em branco na tabela
  oficial = "igual à linha de cima" (local, público, vagas, link).
- `services[]`: acolhida + 8 pilares, com `items[]` e `partners[]`.

## Modo TV (`tv.html?local=jn`)
Layout herdado do `joaquim_nabuco` (`components/tv/tv.css`): tema escuro, cabeçalho com marca + relógio,
palco com crossfade e barra de progresso, coluna lateral com "A seguir" e QR, faixa de avisos e rodapé
com pontos. Playlist: boas-vindas → quadro de salas do dia (salas × turnos, turno atual destacado) →
turnos de hoje (lista de cursos com sala) → detalhe dos cursos do turno atual/próximo → semana →
serviços (um pilar por tela). Teclas: → ← navegar, F tela cheia, +/−/0 zoom, L alterna tema.
Fora do período: contagem regressiva e programação do primeiro dia.

## App (`index.html`)
Padrão do `components/app/app.css`: superfície clara, cabeçalho translúcido fixo, navegação inferior
(Início · Programação · Cursos · Serviços · Locais), cartões com hairline e sombra suave, folha inferior
para detalhe. Em telas largas vira navegação lateral + conteúdo centrado (max 960px). Interações:
busca instantânea (sem acento), chips de filtro combináveis, agrupamento por dia/turno, "agora/próximo"
pelo relógio, favoritos em localStorage, botão "Lembrar" gera .ics, "Compartilhar" (Web Share/clipboard),
link de inscrição externo.

## Testes
- `node --check` nos JS; `node tests/data.test.mjs` valida consistência dos dados (datas no período,
  locais conhecidos, links únicos, turnos coerentes com horário).
- Captura visual com Chromium headless (Playwright) em 1920×1080 (TV), 390×844 e 1280×800 (app).
