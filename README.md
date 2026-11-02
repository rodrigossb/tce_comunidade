# TCE na Comunidade · 9ª Edição · Oiapoque e Distrito do Manga (03 a 07/11/2026)

Superfícies digitais do evento, em um monorepo **Next.js** (JavaScript, sem TypeScript, sem Python):

| Pasta | O que é | Como roda |
| --- | --- | --- |
| `packages/core` (`@tce/core`) | Dados (`src/data.js`), regras (`src/shared.js`), ícones, plantas e rotas (`src/map.js`), DE→PARA das salas (`src/salas-cursos.js`), agregações de senhas (`src/stats.js`) e o CSS compartilhado (`css/`). Sem dependências. | Importado pelos dois apps; testes em `tests/` |
| `apps/site` | Site público: **app** (`index.html`), **TV** (`tv.html`), **totem** (`totem.html`), **resumo da organização** (`resumo.html`) e **placas de porta** (`placas.html`) | `next build` exporta HTML estático em `apps/site/out/`, publicado no GitHub Pages |
| `apps/senhas` | **Controle de senhas** da equipe (triagem, porta da sala, painel): Next com **server actions** e SQLite embutido (`node:sqlite`) | Servidor Node no pm2 (`tce-senhas`, porta 3015) atrás do nginx em `/tce-senhas/` |

Requisito único: **Node 22.5+** (o `node:sqlite` é embutido; não há addon nativo nem Python).

## Publicar o site público
Endereço oficial: **https://www.tce.ap.gov.br/tce-na-comunidade** (domínio institucional apontado para o
GitHub Pages deste repositório; só com `www`). Todos os QR Codes e links (TV, app, totem, placas) usam esse
endereço, definido em `event.appUrl` (`packages/core/src/data.js`); `?app=https://…/` sobrescreve para testes.

Cada push na `main` dispara `.github/workflows/pages.yml`: `npm ci` → `npm test` → `npm run build` →
deploy de `apps/site/out/`. Em *Settings → Pages* a origem é **GitHub Actions**. Como a pasta de publicação
muda entre os endereços (`/tce-na-comunidade/` no TCE, `/tce_comunidade/` no github.io), o Next exporta com
assets em caminho relativo (`assetPrefix: './'`); por isso todas as páginas ficam na raiz (`tv.html`, não
`/tv/`). A pasta `out/` também pode ser copiada para qualquer servidor estático.

## Modo TV (`tv.html`)
| Parâmetro | Efeito |
| --- | --- |
| `?local=jn` (padrão) · `manga` · `sebrae` · `auditorio` · `iaparra` · `todos` | Local onde a TV está: filtra o quadro do dia e os destaques; o QR já abre o app nesse local |
| `?t=09:15&d=2026-11-05` | Simula data/hora (demonstração; mostra o selo "demonstração") |
| `?zoom=0.9` · `?theme=light` · `?orientation=portrait` | Escala do texto, tema claro, orientação forçada |

Teclas: `F` tela cheia · `+` `−` `0` escala · `L` claro/escuro · `→` `←` troca os destaques · `Esc` limpa
ajustes salvos. Recarrega sozinha às 4h e se ficar travada. Programação do dia em colunas por turno (o turno
em andamento ganha destaque), faixa com os 9 blocos de serviços, 2 destaques ("agora" e "a seguir") e QR Code.

## App (`index.html`)
Rotas por hash, compartilháveis: `#programacao?d=2026-11-05&local=jn`, `#busca?q=vacina`,
`#cursos?q=ia&tema=tecnologia&dia=…&turno=manha&local=jn&fav=1&ord=az`, `#curso/116`, `#servicos`,
`#servico/pilar-2`, `#mapa?local=jn&p=jn-r11&s=pilar-1&entrada=a1`, `#local/jn`. Também aceita
`?t=HH:MM&d=AAAA-MM-DD`. Instalável (manifesto + service worker `public/sw.js`: páginas network-first,
`_next/static` e imagens cache-first). Memória discreta no aparelho (`localStorage`): último local, último dia
(só no mesmo dia), favoritos. Busca única (cursos, serviços, locais) com sinônimos do dia a dia e sem acentos.
Mapa: planta com marcadores (`components/PlanMap.jsx`), rota a pé do acesso até a sala, "Ampliar o mapa",
"Ouvir o caminho" (síntese de voz), botões "Ver no mapa" em cursos, serviços e locais.

## Totem (`totem.html`)
Aparelho compartilhado, em pé, por toque (1080×1920). Parâmetros: `?local=jn`, `?ocioso=90`, `?descanso=0`,
`?entrada=a1|a2|a3` (origem das rotas), `?t=`/`?d=`, `?app=`. Tecla `F` tela cheia. Início com busca + mapa
vivo, abas grandes, teclado na tela, painéis com "Voltar", QR fixo no rodapé, tela de descanso com a
programação do dia; sem memória entre pessoas; recarrega às 4h.

## Resumo da organização (`resumo.html`)
Documento imprimível (A4) para a coordenação: visão geral dias × locais, cada dia por local (cursos e
serviços com sala), plantas com o uso de cada sala, cursos A–Z e pendências. Fora da navegação pública.

## Resumo de cursos e inscrições (`resumo-cursos.html`)
Cursos por dia e local e de A a Z com vagas, inscritos e vagas restantes por turma, mais alertas (lotados, quase lotados,
baixa procura). Os inscritos vêm do painel administrativo da ESCON ("Próximas ações em Oiapoque": um cartão por curso da
ESCON, sem código nem vagas), que **só é acessível de dentro da rede do TCE** (este servidor, buscadores externos e os
servidores do GitHub não o alcançam). O leitor (`packages/core/src/inscritos.js`) casa cada cartão com uma turma pelo nome,
pelo prefixo de local ("Manga -", "(Oiapoque)") e pelos dias; a chave é `curso@local@idESCON` (Cuidador, Tecnologia e
Direito das Mulheres, Videomaker e Cidadania Conectada têm mais de uma turma).

Fontes da página, em ordem: (1) **API ao vivo** `GET /tce-senhas/api/inscritos` (CORS liberado), alimentada por um coletor
que roda do lado de quem tem acesso ao painel e faz `POST` com `X-Token: INSCRITOS_TOKEN` (do `apps/senhas/.env`); envios
parciais fundem com o último retrato; (2) `apps/site/public/inscritos.json` publicado com o site, gerado por
`node apps/site/scripts/inscritos.mjs <painel salvo .html>`; (3) chave `?k=` ou conteúdo colado na capa (só no aparelho).
Coletores: **favorito "Enviar inscritos"** (bookmarklet na própria página; pede o token uma vez), **userscript**
`public/coletor-inscritos.user.js` (Tampermonkey; envia ao abrir e a cada 30 min enquanto a aba do painel ficar aberta) e
**Node** `apps/senhas/scripts/inscritos-coletor.mjs` (servidor/PC dentro do TCE; `PANEL_URL`, `INSCRITOS_TOKEN`, `INTERVAL_MIN`;
`pm2 start … --name inscritos-coletor`). O workflow `inscritos.yml` fica só sob demanda (segredo `ESCON_PANEL_URL`), para
o caso de o painel um dia ficar acessível de fora.

## Placas de porta (`placas.html`)
Folhas A4 paisagem, duas versões: **consolidada** (uma folha por sala/tenda/ambiente, 57) e **por curso /
serviço** (`?modo=destaque`, 88). Filtros `?local=jn|manga`, `?sala=jn-r08,jn-r09`, `?todas=1`. Painel escuro
com a arte do evento (`public/img/arte-topo.jpg`, `arte-marca.png`), número da planta, nome, QR para o caminho
no mapa; o texto cresce até o maior tamanho que cabe (`--k` em mm). Imprimir em cores, sem margens.

## Controle de senhas (`apps/senhas`)
Uso interno da equipe, com PIN (4 dígitos = equipe; 6 dígitos = gestão, que também exporta CSV).
Filas por sala/instituição (`queuesOf(venue)` do core), três funções por aparelho: **Triagem** (+1 por senha
entregue ou digitar o total), **Porta da sala** ("Entrou · senha N" / "Não veio · senha N", outro número,
finalizar, desfazer, histórico) e **Painel** (entregues, chamadas, atendidas, faltas, espera estimada, tempo
médio, senha atual, chamadas por hora). Fila offline no aparelho, reenviada quando a rede volta.

Arquitetura: `app/actions.js` (server actions: login por PIN em cookie httpOnly, estado, fila, estatísticas,
lançamentos), `lib/db.js` (SQLite em `data/senhas.db`, mesmo esquema de antes: `issued_log` e `calls`),
`app/api/export.csv` (download, gestão) e `app/api/health`. Configuração em `apps/senhas/.env` (copie de
`.env.example`; **nunca commitar**): `PIN_OPERADOR`, `PIN_GESTOR`, `PORT`, `HOST`, `BASE_PATH`,
`ALLOWED_ORIGINS`, `DB_PATH`, `BACKUP_DIR`.

Produção neste servidor: **https://dev.gerenciahub.com.br/tce-senhas/** — pm2 `tce-senhas`
(`deploy/ecosystem.config.cjs`, `next start -p 3015`), nginx `location /tce-senhas/` → `127.0.0.1:3015`
(bloco em `deploy/nginx-tce-senhas.conf`; `sudo apps/senhas/deploy/install-nginx.sh`).
Atualizar: `git pull && npm ci && npm run build:senhas && pm2 restart tce-senhas`.

Servidor local (sem internet): `git pull` do repositório, `npm ci`, `.env` com `HOST=0.0.0.0` (acesso
direto por `http://IP:3015/tce-senhas/`, ou `BASE_PATH=` vazio para servir na raiz) e, se o acesso for por
IP/nome, `ALLOWED_ORIGINS=192.168.0.10:3015`; `npm run build:senhas && npm run start:senhas` (ou pm2).

Backup: `npm run backup [rótulo]` gera zip com cópia consistente do banco (`VACUUM INTO`), o `.env` e um
LEIA-ME em `apps/senhas/backups/` (mantém 60); `apps/senhas/scripts/backup-cron.sh` copia para
`~/backups/tce-senhas/` (90 dias). Cron sugerido (`crontab -e`): diário às 03:40 e de hora em hora (7h–20h)
de 03 a 07/11. Restaurar: `pm2 stop tce-senhas`, copiar `senhas.db` para `apps/senhas/data/`, `pm2 start`.

## Dados
`packages/core/src/data.js` é a fonte única (evento, locais, cursos com sessões, serviços por pilar), transcrita de
`Tabela com links COM AJUSTES FINAIS LEON.pdf` ("Programação por Curso", versão de 29/10/2026, que
substituiu o `.docx` anterior) e `SERVIÇOS DO TCE NA COMUNIDADE 1.pdf`.
Convenção da tabela oficial: célula em branco = igual à linha de cima (local, público, vagas, link).

Mudanças trazidas pelo PDF de 29/10 (já aplicadas): "Tecnologia e Empreendedorismo Feminino" (140)
saiu e entrou "Tecnologia e Ouvidoria" (142) no mesmo horário; "Gestão Financeira nas Escolas" (112)
passou a 10h e foi para a Escola Estadual Indígena Jorge Iaparrá (Aldeia do Manga), com link novo;
curso 152 virou "Tecnologia a Serviço do Controle Social e Ouvidoria" (link novo); "Tomada de Contas"
(122) passou a 8h; público de "Painéis da Gestão Pública" (141) agora é "Servidores públicos, gestores
e técnicos".

Serviços (sem inscrição): transcritos de `SERVICOS ATUALIZADOS.docx` (30/10/2026) e complementados com
detalhes públicos da `RELAÇÃO DE PARCEIROS DA IX EDIÇÃO` (pasta
https://drive.google.com/drive/folders/1_OG6UGKJTZA1rI5u7s1mixMoyNy4t1N1). Dias de serviços em
`event.serviceDays`: 04/11 no Distrito do Manga e 07/11 na Escola Joaquim Nabuco. Os itens marcados em
amarelo no documento oficial (práticas integrativas e Outubro Rosa/Novembro Azul do pilar 1, Castra
Móvel do pilar 6, Feira do Agricultor e palco cultural do pilar 8) estão como `{ t, only: '2026-11-07' }`
e aparecem com o selo "só sáb 07/11 · Escola Joaquim Nabuco" no app e no totem. Nesses dois dias a TV, o
app e o totem destacam os serviços (quadro dos 9 blocos na TV; faixa azul e aba "serviços" no app/totem).

Plantas e mapa digital: `apps/site/public/img/planta-jn.jpg` e `planta-manga.jpg` são recortes da "Planta de
ambientação" (arq. Niucéia Fêrnandes, PDF no Drive). Em `packages/core/src/data.js` → `maps` ficam os ambientes
(número, nome, posição em pixels da imagem), os acessos e os corredores por onde se anda; cada serviço
tem `places: { jn, manga }` e itens podem ter `where` (sala específica). `packages/core/src/map.js` + `apps/site/components/PlanMap.jsx` desenha a planta com
marcadores, calcula a rota a pé do acesso até a sala (Dijkstra sobre os corredores, destino projetado no
corredor mais próximo) e gera as instruções em texto ("vire à esquerda… Sala 11 fica à sua direita").
Totem: aba "Mapa" (planta geral, filtro por serviço, toque na sala → rota) e "Onde fica" em cada serviço;
a origem da rota é o acesso em `?entrada=a1|a2|a3` (padrão a1 = entrada principal). App: `#mapa?local=jn&p=jn-r11&s=pilar-1&entrada=a1`.
Sem escala: a rota é orientação visual. Ambientes "A definir" e a tenda Webflash ficam ocultos (`hide`).
Início do totem: "mapa vivo" (destaca um serviço a cada 4 s, com as salas nomeadas; toque na sala abre o
caminho; chips por serviço). Rota com "Ouvir o caminho" (síntese de voz pt-BR, quando o navegador tem).
App: "Ampliar o mapa" abre a planta em tela cheia, arrastável, com 2,2× ou 3,2×, centrada no destino.
Início do totem = busca + mapa: resultados instantâneos (serviços com suas salas, salas por nome/número,
cursos), toque em uma sala ou resultado traça o caminho ali mesmo (com "Voltar ao mapa geral"), legenda
dos serviços ao lado do mapa (toque filtra), botão flutuante "Mapa e busca" nas demais telas.
Salas dos cursos na planta: `packages/core/src/salas-cursos.js` (DE → PARA **validado em 31/10**: Joaquim Nabuco
Lab I = 01, Lab II = 02, Sala I = 08, Sala II = 09, Sala III = 11, Sala IV = 13, Sala V = 20, Sala VI = 24;
Manga Lab I = 12, Sala I = 13). App e totem mostram a etiqueta "Sala 08" em cada aula e, no detalhe do
curso, "Onde fica" com o caminho no mapa (o destino recebe o nome do curso, não o do serviço de 07/11).

`resumo.html` (uso da organização, fora da navegação pública, imprimível): cursos por dia e A–Z com sala
da programação e número na planta, serviços com salas por local e itens exclusivos de 07/11, plantas com o
uso de cada sala (serviços em 04/07 e cursos nos outros dias), DE → PARA e pendências.

Pontos a conferir com a organização:
- Curso 109 (Brinquedistas): a tabela traz um link administrativo; usamos `escon/cursos/109`.
- Laboratório I – Joaquim Nabuco, 05/11 às 14h: a tabela trazia dois cursos (125 e 145); em 02/11 a organização moveu o Videomaker (145) para o Laboratório II (sala 02), onde no mesmo horário está o Rios do Saber (156).
- Formação de Cuidador, 03/11 de manhã: a tabela diz só "Manga", sem sala.
- Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).
- Extensão de Cílios (127): o cabeçalho diz "2 ocorrências, 05 e 06/11", mas a tabela lista 04, 05 e 06/11; mantivemos os três dias.
- Gestão Financeira nas Escolas (112): o nome da escola saiu embaralhado no PDF; lemos como "Escola Estadual Indígena Jorge Iaparrá, Aldeia do Manga" (local `iaparra`). O PDF diz "1 ocorrência" mas lista 8h e 14h; mantivemos as duas.
- Empreendedorismo Feminino (130): "2 ocorrências" no cabeçalho, mas só uma linha (04/11 às 8h).
- Mapa: vínculo serviço → sala deduzido dos nomes da planta (ex.: "Segurança e direito" = Proteção à Mulher
  e Justiça; "Sala GEA" = DIAGRO/Amapá Terras/RURAP/CAR; TRE, AMPREV, CGE e cinema do SESC sem sala na planta).

## Desenvolver / testar
```bash
npm ci                       # instala tudo (workspaces)
npm test                     # dados, estados por horário, rotas da planta, .ics/QR, estatísticas e banco de senhas
npm run dev                  # site em http://localhost:3100 (tv.html?t=09:15&d=2026-11-05, totem.html, resumo.html, placas.html)
npm run dev:senhas           # senhas em http://localhost:3115/tce-senhas/
npm run build                # exporta o site em apps/site/out/ (igual ao GitHub Pages)
```
Ao publicar mudanças no site, suba `VERSION` em `apps/site/public/sw.js` para renovar o cache dos celulares.
Projeto de design em `docs/plans/2026-10-28-painel-tce-comunidade-design.md`.
