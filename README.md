# TCE na Comunidade · 9ª Edição · Oiapoque e Distrito do Manga (03 a 07/11/2026)

Duas páginas públicas, sem login e sem servidor, com a programação de cursos, salas e serviços do
evento. Site estático: HTML + CSS + JS puros, dados em `js/data.js`.

| Página | Para quem | Uso |
| --- | --- | --- |
| `tv.html` | TV/monitor no saguão da escola | Rodízio automático de telas, relógio, quadro "agora", QR Code para o app |
| `index.html` | Público, no celular (ou desktop) | Busca, filtros, detalhe do curso, inscrição, lembrete, favoritos, serviços, locais |

## Publicar
Copie a pasta inteira para qualquer servidor estático (nginx, Apache, GitHub Pages, S3…). O QR Code
da TV aponta para a pasta onde ela mesma está publicada (`index.html` ao lado de `tv.html`).
Para apontar para outro endereço: `tv.html?app=https://exemplo.gov.br/comunidade/`.

Abrir direto do arquivo (`file://`) também funciona para conferir, mas o QR gerado só serve quando
publicado em `https://`.

## Modo TV (`tv.html`)
Parâmetros na URL:

| Parâmetro | Efeito |
| --- | --- |
| `?local=jn` (padrão) · `manga` · `sebrae` · `auditorio` · `todos` | Local onde a TV está: filtra o quadro de salas, os turnos e a semana |
| `?t=09:15&d=2026-11-05` | Simula data/hora (demonstração; mostra o selo "demonstração") |
| `?zoom=0.9` · `?theme=light` · `?orientation=portrait` | Escala do texto, tema claro, orientação forçada |

Teclas (teclado ou controle com setas): `→` `←` navegar · `F` tela cheia · `+` `−` `0` escala ·
`L` claro/escuro · `Esc` limpa ajustes salvos. A página recarrega sozinha às 4h e se ficar travada.

Telas do rodízio: boas-vindas → salas de hoje (salas × turnos) → cursos de cada turno → detalhe dos
cursos do turno atual/próximo → serviços (visão geral + um pilar por tela) → programação da semana.

## App (`index.html`)
Rotas por hash, compartilháveis: `#inicio`, `#programacao?d=2026-11-05&local=jn`,
`#cursos?q=ia&tema=tecnologia&dia=…&turno=manha&local=jn&fav=1&ord=az`, `#curso/116`,
`#servicos`, `#servico/pilar-2`, `#locais`, `#local/jn`. Também aceita `?t=HH:MM&d=AAAA-MM-DD`.
Instalável (manifesto + service worker com cache para uso sem sinal).

## Dados
`js/data.js` é a fonte única (evento, locais, cursos com sessões, serviços por pilar), transcrita de
`Tabela com links COM AJUSTES FINAIS LEON.docx` e `SERVIÇOS DO TCE NA COMUNIDADE 1.pdf`.
Convenção da tabela oficial: célula em branco = igual à linha de cima (local, público, vagas, link).

Pontos a conferir com a organização:
- Curso 109 (Brinquedistas): a tabela traz um link administrativo; usamos `escon/cursos/109`.
- Laboratório I – Joaquim Nabuco, 05/11 às 14h: dois cursos no mesmo horário e sala (125 e 145).
- Formação de Cuidador, 03/11 de manhã: a tabela diz só "Manga", sem sala.
- Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).

## Desenvolver / testar
```bash
npm test                    # consistência dos dados, estados por horário, .ics e QR
python3 -m http.server 8080 # abre http://localhost:8080/tv.html?t=09:15&d=2026-11-05
```
Ao alterar arquivos publicados, suba `VERSION` em `sw.js` para renovar o cache dos celulares.
Projeto de design em `docs/plans/2026-10-28-painel-tce-comunidade-design.md`.
