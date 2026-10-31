# TCE na Comunidade · 9ª Edição · Oiapoque e Distrito do Manga (03 a 07/11/2026)

Duas páginas públicas, sem login e sem servidor, com a programação de cursos, salas e serviços do
evento. Site estático: HTML + CSS + JS puros, dados em `js/data.js`.

| Página | Para quem | Uso |
| --- | --- | --- |
| `tv.html` | TV/monitor no saguão da escola | Programação do dia inteira em uma tela (sala → curso → para quem), 2 destaques do momento, QR Code para o app |
| `totem.html` | Totem vertical por toque (ex.: 42", 1080×1920) | Interface própria de quiosque: blocos grandes de escolha, abas no alto, teclado na tela, detalhe em painel com "Voltar", QR Code fixo no rodapé e tela de descanso com a programação do dia |
| `index.html` | Público, no celular (ou desktop) | Abre na programação do dia e do local usados por último; busca única (cursos, serviços, locais); detalhe, inscrição, lembrete, favoritos |

## Publicar
Endereço oficial: **https://www.tce.ap.gov.br/tce-na-comunidade** (domínio institucional apontado
para o GitHub Pages deste repositório; cada push na `main` republica). Todos os QR Codes e links de
compartilhamento (TV, app e totem) usam esse endereço, definido em `event.appUrl` no `js/data.js`.
Para testar com outro endereço sem mexer nos dados: `tv.html?app=https://exemplo.gov.br/comunidade/`.
A pasta também pode ser copiada para qualquer servidor estático (nginx, Apache, S3…).

Abrir direto do arquivo (`file://`) também funciona para conferir, mas o QR gerado só serve quando
publicado em `https://`.

## Modo TV (`tv.html`)
Parâmetros na URL:

| Parâmetro | Efeito |
| --- | --- |
| `?local=jn` (padrão) · `manga` · `sebrae` · `auditorio` · `iaparra` · `todos` | Local onde a TV está: filtra o quadro do dia e os destaques; o QR já abre o app nesse local |
| `?t=09:15&d=2026-11-05` | Simula data/hora (demonstração; mostra o selo "demonstração") |
| `?zoom=0.9` · `?theme=light` · `?orientation=portrait` | Escala do texto, tema claro, orientação forçada |

Teclas (teclado ou controle com setas): `F` tela cheia · `+` `−` `0` escala · `L` claro/escuro ·
`→` `←` troca os destaques · `Esc` limpa ajustes salvos. A página recarrega sozinha às 4h e se ficar travada.

Layout fixo, sem rodízio: área principal com a programação do dia em colunas por turno (o turno em
andamento ganha destaque e barra de progresso; os encerrados ficam esmaecidos), faixa com os 9 blocos
de serviços, lateral com 2 destaques ("agora" e "a seguir", trocando a cada 14 s) e o QR Code embaixo.
O texto se ajusta sozinho para caber sem rolagem. Se o dia já acabou neste local, mostra o próximo dia.
Funciona em paisagem e em retrato.

## App (`index.html`)
Rotas por hash, compartilháveis: `#programacao?d=2026-11-05&local=jn` (tela inicial), `#busca?q=vacina`,
`#cursos?q=ia&tema=tecnologia&dia=…&turno=manha&local=jn&fav=1&ord=az`, `#curso/116`,
`#servicos`, `#servico/pilar-2`, `#locais`, `#local/jn`. Também aceita `?t=HH:MM&d=AAAA-MM-DD`.
Instalável (manifesto + service worker com cache para uso sem sinal).

Memória discreta no aparelho (`localStorage`, sem cadastro): o último local escolhido é reaplicado
sempre; o último dia só no mesmo dia (no dia seguinte volta para "hoje"). Quem chega pelo QR da TV já
entra com o local da TV selecionado. A busca aceita palavras do dia a dia ("rg", "remédio", "dentista",
"cachorro"…) e procura ao mesmo tempo em cursos, serviços e locais, sem diferenciar acentos.

## Totem (`totem.html`)
Aparelho compartilhado, em pé, por toque. Parâmetros: `?local=jn` (local do totem; o QR Code e a tela
de descanso usam o mesmo), `?ocioso=90` (segundos sem toque até voltar à tela de descanso),
`?descanso=0` (sem tela de descanso: abre direto em "explorar") e os mesmos `?t=`/`?d=` de demonstração.
Em tela deitada (totem horizontal ou pré-visualização no computador) as abas e o QR vão para a esquerda. Tecla `F` para tela cheia (ou use o modo quiosque do navegador).

Interface própria (`js/totem.js` + `css/totem.css`, sobre os mesmos dados e busca do app): início com
blocos grandes (Programação de hoje, Cursos, Saúde, Documentos, Todos os serviços, Onde fica), abas no
alto (na altura dos olhos e da mão), listas com letras grandes, detalhe em painel de tela cheia com
"Voltar", teclado na tela para a busca e QR Code fixo no rodapé para levar o app no celular.
Não guarda nada entre pessoas (sem memória, favoritos ou compartilhar); links externos ficam
bloqueados e a inscrição é feita pelo QR Code grande de cada curso; depois do tempo ocioso volta ao
início e mostra a programação do dia (a mesma da TV, em retrato) com "Toque na tela para explorar".
Recarrega sozinho às 4h.

## Atendimento · controle de senhas (`atendimento.html` + `server/`)
Uso interno da equipe, com PIN (4 dígitos = equipe; 6 dígitos = gestão, que também exporta CSV).
Três funções, cada aparelho escolhe a sua: **Triagem** (toque em +1 a cada senha entregue, ou toque no
número para digitar o total), **Porta da sala** (escolhe serviço e sala uma vez; depois é só "Chamar
próxima", e "Entrou" / "Não veio"; "Chamar outro número", "Finalizar atendimento" e "Desfazer" para os
casos fora da ordem) e **Painel** (senhas entregues, chamadas, atendidas, faltas, tempo médio e mediana de
atendimento, espera estimada, por serviço e por sala, chamadas por hora; atualiza a cada 15 s).
Tempo de atendimento = de "Entrou" até "Finalizar" ou até a próxima pessoa entrar na mesma sala.
Fila offline: gravações sem rede ficam no aparelho e são reenviadas.

Servidor: `server/senhas.js` (Node 22 + SQLite embutido, sem dependências; porta 3015; dados em
`server/data/senhas.db`, fora do git). PINs em `server/.env` (`PIN_OPERADOR`, `PIN_GESTOR`; nunca commitar).
Roda no pm2 como `tce-senhas`; o nginx expõe em `https://dev.gerenciahub.com.br/tce-senhas/`
(bloco em `server/nginx-tce-senhas.conf`; `sudo server/install-nginx.sh` instala). O endereço da API fica
em `event.apiUrl` (`js/data.js`); `?api=http://127.0.0.1:3015` sobrescreve para testes. CORS libera só os
domínios do site. Testes das agregações: `tests/stats.test.mjs`.

Backup (mesmo padrão do Painel Escolar): `node server/backup.js [rótulo]` gera um zip com cópia consistente
do banco (`VACUUM INTO`, seguro com a API no ar), o `.env` e um LEIA-ME com totais, em `server/backups/`
(fora do git; mantém os últimos 60). `server/backup-cron.sh` roda isso e copia para `~/backups/tce-senhas/`
(90 dias). Cron instalado: diário às 03:40 e de hora em hora (7h–20h) de 03 a 07/11. Restaurar: `pm2 stop
tce-senhas`, copiar `senhas.db` para `server/data/` e `.env` para `server/`, `pm2 start tce-senhas`.

## Dados
`js/data.js` é a fonte única (evento, locais, cursos com sessões, serviços por pilar), transcrita de
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

Plantas e mapa digital: `img/planta-jn.jpg` e `img/planta-manga.jpg` são recortes da "Planta de
ambientação" (arq. Niucéia Fêrnandes, PDF no Drive). Em `js/data.js` → `maps` ficam os ambientes
(número, nome, posição em pixels da imagem), os acessos e os corredores por onde se anda; cada serviço
tem `places: { jn, manga }` e itens podem ter `where` (sala específica). `js/map.js` desenha a planta com
marcadores, calcula a rota a pé do acesso até a sala (Dijkstra sobre os corredores, destino projetado no
corredor mais próximo) e gera as instruções em texto ("vire à esquerda… Sala 11 fica à sua direita").
Totem: aba "Mapa" (planta geral, filtro por serviço, toque na sala → rota) e "Onde fica" em cada serviço;
a origem da rota é o acesso em `?entrada=a1|a2|a3` (padrão a1 = entrada principal). App: `#mapa?local=jn&p=jn-r11&s=pilar-1&entrada=a1`.
Sem escala: a rota é orientação visual. Ambientes "A definir" e a tenda Webflash ficam ocultos (`hide`).

Pontos a conferir com a organização:
- Curso 109 (Brinquedistas): a tabela traz um link administrativo; usamos `escon/cursos/109`.
- Laboratório I – Joaquim Nabuco, 05/11 às 14h: dois cursos no mesmo horário e sala (125 e 145).
- Formação de Cuidador, 03/11 de manhã: a tabela diz só "Manga", sem sala.
- Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).
- Extensão de Cílios (127): o cabeçalho diz "2 ocorrências, 05 e 06/11", mas a tabela lista 04, 05 e 06/11; mantivemos os três dias.
- Gestão Financeira nas Escolas (112): o nome da escola saiu embaralhado no PDF; lemos como "Escola Estadual Indígena Jorge Iaparrá, Aldeia do Manga" (local `iaparra`). O PDF diz "1 ocorrência" mas lista 8h e 14h; mantivemos as duas.
- Empreendedorismo Feminino (130): "2 ocorrências" no cabeçalho, mas só uma linha (04/11 às 8h).
- Mapa: vínculo serviço → sala deduzido dos nomes da planta (ex.: "Segurança e direito" = Proteção à Mulher
  e Justiça; "Sala GEA" = DIAGRO/Amapá Terras/RURAP/CAR; TRE, AMPREV, CGE e cinema do SESC sem sala na planta).

## Desenvolver / testar
```bash
npm test                    # consistência dos dados, estados por horário, .ics e QR
python3 -m http.server 8080 # abre http://localhost:8080/tv.html?t=09:15&d=2026-11-05
```
Ao alterar arquivos publicados, suba `VERSION` em `sw.js` para renovar o cache dos celulares.
Projeto de design em `docs/plans/2026-10-28-painel-tce-comunidade-design.md`.
