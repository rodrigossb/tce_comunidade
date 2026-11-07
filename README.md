# TCE na Comunidade · 9ª Edição · Oiapoque e Distrito do Manga (03 a 07/11/2026)

Superfícies digitais do evento, em um monorepo **Next.js** (JavaScript, sem TypeScript, sem Python):

| Pasta | O que é | Como roda |
| --- | --- | --- |
| `packages/core` (`@tce/core`) | Dados (`src/data.js`), regras (`src/shared.js`), ícones, plantas e rotas (`src/map.js`), DE→PARA das salas (`src/salas-cursos.js`), agregações de senhas (`src/stats.js`) e o CSS compartilhado (`css/`). Sem dependências. | Importado pelos dois apps; testes em `tests/` |
| `apps/site` | Site público: **app** (`index.html`), **TV** (`tv.html`), **totem** (`totem.html`), **resumos da organização** (`resumo.html`, `resumo-cursos.html`, `resumo-total.html`, `lanches.html`) e **placas de porta** (`placas.html`) | `next build` exporta HTML estático em `apps/site/out/`, publicado no GitHub Pages |
| `apps/senhas` | **Controle de senhas** da equipe (triagem, porta da sala, painel) e **TV das senhas** (`/tce-senhas/tv`): Next com **server actions** e SQLite embutido (`node:sqlite`) | Servidor Node no pm2 (`tce-senhas`, porta 3015) atrás do nginx em `/tce-senhas/` |

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
| `?local=jn` (padrão) · `manga` · `sebrae` · `auditorio` · `camara` · `ifap` · `iaparra` · `todos` | Local onde a TV está: filtra o quadro do dia e os destaques; o QR já abre o app nesse local |
| `?t=09:15&d=2026-11-05` | Simula data/hora (demonstração; mostra o selo "demonstração") |
| `?zoom=0.9` · `?theme=light` · `?orientation=portrait` | Escala do texto, tema claro, orientação forçada |

Teclas: `F` tela cheia · `+` `−` `0` escala · `L` claro/escuro · `→` `←` troca os destaques · `Esc` limpa
ajustes salvos. Recarrega sozinha às 4h e se ficar travada. Programação do dia em colunas por turno: o turno
em andamento ganha espaço, o encerrado vira uma coluna estreita só com sala e título; cada cartão mostra o
**número da sala na planta** (o da placa na porta, DE → PARA de `salas-cursos.js`) grande, com o nome da
programação ("Sala IV") embaixo; os cartões crescem para preencher a coluna e não repetem "Agora"/"Encerrado"
quando a coluna já diz isso. Lateral com 2 destaques ("agora" e "a seguir") e QR Code; faixa de serviços no rodapé.

## Mapa dos locais (`mapa-eventos.html`)
Um pino numerado por local do evento (Joaquim Nabuco, Aldeia do Manga/Jorge Iaparrá, SEBRAE, Auditório Joaquim Caetano, Câmara de Vereadores, IFAP),
em Leaflet + OpenStreetMap, com endereço, o que acontece ali (dias com cursos, dia de serviços) e botões de rota: Google
Maps (`maps/dir/?api=1&destination=`), Waze (`waze.com/ul?ll=…&navigate=yes`) e `geo:` para outro app. "Minha
localização" mostra a distância em linha reta. `?local=jn|manga|sebrae|auditorio|camara|ifap` abre focado. Coordenadas em `D.geo`
(`packages/core/src/data.js`): escolas pelo prédio (OpenStreetMap); SEBRAE (Rua Santos Dumont, 228) e Auditório (Escola
Joaquim Caetano da Silva, Av. Coaracy Nunes, 40) pelo ponto da rua, marcados `approx` e com aviso na página. Links para cá:
ferramentas do resumo e botão "Como chegar" na folha de cada local do app.

**Cadastro de lugares** (escolas, restaurantes, hotéis, saúde, outro; desligado na página desde 03/11 à tarde, aparece só
com `?editar=1`): botão "Cadastrar lugar" abre o formulário (nome,
tipo, endereço, telefone, latitude/longitude, observação). As coordenadas podem ser digitadas, preenchidas pelo GPS do
celular, marcadas com um toque no mapa (pino "?" arrastável) ou buscadas pelo endereço no OpenStreetMap (Nominatim).
Salvar exige o PIN da equipe (operador ou gestor do tce-senhas; fica só na sessão do navegador). Os lugares ficam no
tce-senhas (`GET/POST/DELETE /api/lugares`, tabela `lugares`, validação em `@tce/core/lugares`) e aparecem para todos,
com filtro por tipo, cor própria no pino, editar/excluir e cópia local (`localStorage`) para abrir sem a API.

## App (`index.html`)
Rotas por hash, compartilháveis: `#programacao?d=2026-11-05&local=jn`, `#busca?q=vacina`,
`#cursos?q=ia&tema=tecnologia&dia=…&turno=manha&local=jn&fav=1&ord=az`, `#curso/116`, `#servicos`,
`#servico/pilar-2`, `#mapa?local=jn&p=jn-r11&s=pilar-1&entrada=a1`, `#local/jn`. Também aceita
`?t=HH:MM&d=AAAA-MM-DD`. Instalável (manifesto + service worker `public/sw.js`: páginas network-first,
`_next/static` e imagens cache-first). Memória discreta no aparelho (`localStorage`): último local, último dia
(só no mesmo dia), favoritos. Busca única (cursos, serviços, locais) com sinônimos do dia a dia e sem acentos.
Mapa: planta com marcadores (`components/PlanMap.jsx`), rota a pé do acesso até a sala, "Ampliar o mapa",
"Ouvir o caminho" (síntese de voz), botões "Ver no mapa" em cursos, serviços e locais.

### Atendimento por dia conforme a triagem (mapa, serviços e programação)
O app público segue **o que a equipe define na triagem do controle de senhas**, dia a dia: quais salas atendem, com que
nome, de que serviço e **o que é oferecido em cada dia e turno** (salas fixas editadas, salas criadas, salas desativadas,
dias desativados pela administração). Fonte: `GET /tce-senhas/api/atendimento` (público, CORS, sem contagens nem senhas;
`db.atendimentoPublico`), com um dia por local (`{ date, venue, source, queues: [{ service_id, place_id, name, kind, num,
extra, items: [{ t, shifts }] }] }`) para cada dia do evento que é dia de serviços da programação **ou** teve alguma ação da
triagem; uma fila só entra num dia se oferece algo nele (itens só de outros dias = não atende naquele dia). `updatedAt` é a
última mudança no banco. O site lê, em ordem, a API ao vivo (`event.apiUrl`, `?api=` sobrescreve), `atendimento.json`
publicado com o site e a cópia no aparelho (a mais nova vence; hook `apps/site/lib/useAtendimento.js`, consulta de novo a
cada 5 min). `node apps/site/scripts/atendimento.mjs` (com `DB_PATH`, onde está o banco) gera o `atendimento.json` para
publicar. As regras puras ficam em `@tce/core/atendimento` (`attendanceDays`, `dayQueues`, `placeQueues`, `mapPlaceIdOf`…).
Na tela: o **mapa** ganha chips de dia quando o local atende em mais de um dia (`#mapa?local=jn&dia=2026-11-06`); os pinos
sem atendimento no dia ficam esmaecidos e vão para "Sem atendimento neste dia"; a lista de salas e os chips de serviço
mostram só o que atende, com o nome atual da fila; uma fila movida de número (sala 09 → "08") ou criada com número da planta
cai no pino desse número, e uma criada sem correspondência aparece "sem pino na planta". O **painel da sala** lista cada
fila ali (nome, serviço, o que é oferecido, com o turno quando não é o dia todo) e, se não atende no dia, em que dias atende.
A **folha do serviço** mostra as salas e a oferta do dia (`#servico/consulta?dia=…`), com a programação completa recolhida;
**programação** e **serviços** reconhecem os dias da triagem como dias de serviços (abas, cartões "Quando e onde", nota
"N salas · …" em cada pilar). Sem retrato para um dia de serviços da programação, vale a planta e a programação, como antes.

## Totem (`totem.html`)
O **mesmo app do celular em modo quiosque** (`components/app/App.jsx` com a prop `kiosk`, montado por
`components/totem/TotemKiosk.jsx`): visual e telas idênticos ao `index.html`, mas sem menu lateral em qualquer largura
(barra inferior), letra maior, sem memória entre pessoas (nada em `localStorage`), volta ao início sozinho, tela de
descanso, teclado na tela na busca, links externos bloqueados (a pessoa leva pelo QR Code: no cabeçalho há um QR que
abre no celular a mesma tela que está no totem; no curso, "Inscrever-se pelo celular" leva ao QR), origem de todos os
caminhos do mapa fixa na posição do totem ("Você está aqui"). Parâmetros na URL:

| Parâmetro | Função |
|---|---|
| `?local=jn` | local onde o totem está (`jn`, `manga`, `sebrae`, `auditorio`, `camara`, `ifap`, `iaparra`): programação inicial e mapa padrão |
| `?entrada=` | **posição do totem na planta** = origem das rotas: um acesso (`a1`, `a2`, `a3`), o id de uma sala em frente à qual ele fica (ex.: `jn-r11`) ou coordenadas `x,y` em pixels da planta (ex.: `900,1100`; planta JN 1800×1208, Manga 1600×1484) |
| `?ocioso=90` | segundos sem toque até voltar ao início (mín. 20) · `?descanso=0` desliga a tela de descanso |
| `?zoom=1.3` | escala da letra (1 = celular; 1,3 fica bom em 42" 1080×1920) |
| `?t=HH:MM&d=AAAA-MM-DD` | simulação de data/hora (igual ao app e à TV) |

Ex.: `totem.html?local=jn&entrada=jn-r11&zoom=1.3`. Tecla `F` = tela cheia; recarrega sozinho às 4h. O app do
cidadão (`index.html`) não muda. O layout anterior do totem (telas próprias, mapa vivo) continua em
`totem-classico.html` com os mesmos parâmetros.

## Lanches (`lanches.html`)
Dashboard único para a fornecedora de alimentação: **alunos inscritos por local, dia e turno** (um lanche por aluno em
cada turno em que tem aula; cursos de vários dias contam em cada dia). No topo, KPIs (total, por turno, turmas com dado,
última leitura do painel) e o quadro local × dia (com M/T/N em cada célula, totais por local e por dia); abaixo, uma
tabela por local agrupada por dia → turno → turmas (horário, curso, sala, inscritos, vagas), com a hora da primeira aula
de cada turno. Turma ainda sem dado no painel entra com as vagas (teto) e aparece com `*`. Filtros `?local=` (como nos
resumos) e `?dia=04` (ou `04/11`, `2026-11-04`). Botão **Copiar texto** gera a versão em texto puro para WhatsApp/e-mail;
impressão em A4 retrato. Regra e agregação em `packages/core/src/lanches.js` (`lanchesBoard`), testada em
`packages/core/tests/lanches.test.mjs`.

## Resumo da organização (`resumo.html`)
Documento imprimível (A4) para a coordenação: visão geral dias × locais, cada dia por local (cursos e
serviços com sala), plantas com o uso de cada sala, cursos A–Z e pendências. Fora da navegação pública.

## Resumo de cursos e inscrições (`resumo-cursos.html`)
Cursos por dia e local e de A a Z com vagas, inscritos e vagas restantes por turma, totais por tabela, seção "Totais"
(por local e por dia, com total geral) e alertas (lotados, quase lotados, baixa procura). `?local=` filtra o documento
inteiro por local: `jn`, `manga`, `sebrae`, `auditorio`, `camara`, `ifap`, `iaparra` (vários com vírgula) ou as cidades `oiapoque` e `manga`
(ex.: `resumo-cursos.html?local=jn`); a barra "Local" no topo da página troca o filtro.
**Resumo total** (`resumo-total.html`, mesmo componente com `variant="total"`): só os totais (por local e por dia, com
total geral) e uma tabela por local com uma linha por turma (quando, curso, sala, vagas, inscritos, restam, ocupação) e
subtotal; aceita o mesmo `?local=`. Os inscritos vêm do painel administrativo da ESCON ("Próximas ações em Oiapoque": um cartão por curso da
ESCON, sem código nem vagas), que **só é acessível de dentro da rede do TCE** (este servidor, buscadores externos e os
servidores do GitHub não o alcançam). O leitor (`packages/core/src/inscritos.js`) casa cada cartão com uma turma pelo nome,
pelo prefixo de local ("Manga -", "(Oiapoque)") e pelos dias; a chave é `curso@local@idESCON` (Cuidador, Tecnologia e
Direito das Mulheres, Videomaker e Cidadania Conectada têm mais de uma turma).

Desde 02/11 a ESCON expõe também a **API pública do painel** (`/escon/admin/api/public/painel/oiapoque?k=…`, JSON, mesma
chave), igualmente só de dentro da rede do TCE. Todos os caminhos aceitam esse JSON (`apiCards` em
`packages/core/src/inscritos.js`: leitura tolerante de título/período/inscritos/vagas/id; um `id` igual ao id da ESCON
casa a turma direto). As páginas (resumo, resumo-cursos, resumo-total, lanches) leem, em
ordem, (1) a **API ao vivo** `GET /tce-senhas/api/inscritos` (CORS liberado), (2) `apps/site/public/inscritos.json`
publicado com o site e (3) a cópia guardada no aparelho (a mais nova vence); hook `apps/site/lib/useInscritos.js`.
Elas têm ainda o botão **Sincronizar inscritos** (`components/resumo/SyncInscritos.jsx`): lê a API do painel direto do
navegador (só funciona de dentro da rede do TCE), mostra "N turmas atualizadas (+X inscritos)", guarda no aparelho e envia
ao tce-senhas para os outros. "Ver detalhes" abre a lista turma a turma (curso, local e dias, antes → agora, variação,
turmas novas e cartões do painel sem turma correspondente; opção de mostrar também as sem mudança). A chave da API (`k=`,
ou a URL completa) e a chave de envio **não ficam no código** (o site é público): são pedidas uma vez num formulário na
página e guardadas só naquele navegador (`?painel=<url ou chave>` também grava; "esquecer chaves" limpa). Se o navegador
bloquear a leitura direta (CORS), aparece um atalho para abrir a API e colar o JSON.

### Coletor de inscritos (roda em segundo plano, dentro da rede do TCE)
A API da ESCON **recusa conexão de fora** (`ECONNREFUSED` deste servidor, de buscadores externos e dos runners do GitHub), então
o coletor precisa rodar numa máquina do TCE e faz `POST /tce-senhas/api/inscritos` com `X-Token: INSCRITOS_TOKEN` (do
`apps/senhas/.env`; corpo `{ json }`, `{ html }`, `{ text }` ou `{ cards }`; envios parciais fundem com o último retrato). Opções:
- **Windows, sem instalar nada**: `public/coletor-inscritos.ps1` (`https://www.tce.ap.gov.br/tce-na-comunidade/coletor-inscritos.ps1`).
  Botão direito → "Executar com o PowerShell"; na primeira vez pede o endereço da API (com `?k=`) e o token, guarda em
  `%APPDATA%\tce-coletor\config.json` e repete a cada 15 min (`-IntervaloMin`, `-Once`, `-Reconfigurar`). Para subir sozinho ao
  ligar o PC: Agendador de Tarefas, ação `powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\tce\coletor-inscritos.ps1`.
- **Node** `apps/senhas/scripts/inscritos-coletor.mjs` (servidor/PC dentro do TCE; `PANEL_URL` = URL da API JSON ou do painel,
  `INSCRITOS_TOKEN`, `INTERVAL_MIN`; `pm2 start … --name inscritos-coletor`).
- **Navegador**: userscript `public/coletor-inscritos.user.js` (Tampermonkey; envia ao abrir e a cada 30 min enquanto a aba do
  painel ficar aberta, ex.: no computador da TV).
`node apps/site/scripts/inscritos.mjs <painel.html|api.json>` gera o `inscritos.json` publicado. O workflow `inscritos.yml` fica só sob
demanda (segredo `ESCON_PANEL_URL`), para o caso de o painel um dia ficar acessível de fora.

## Placas de porta (`placas.html`)
Folhas A4 paisagem, duas versões: **consolidada** (uma folha por sala/tenda/ambiente, 57) e **por curso /
serviço** (`?modo=destaque`, 88). Filtros `?local=jn|manga`, `?sala=jn-r08,jn-r09`, `?todas=1`. Painel escuro
com a arte do evento (`public/img/arte-topo.jpg`, `arte-marca.png`), número da planta, nome, QR para o caminho
no mapa; o texto cresce até o maior tamanho que cabe (`--k` em mm). Imprimir em cores, sem margens.

## Controle de senhas (`apps/senhas`)
Uso interno da equipe, com PIN (4 dígitos = equipe; 6 dígitos = gestão, que também exporta CSV). Depois do PIN, o
**primeiro passo é escolher o local** (Distrito do Manga 04/11 ou Escola Joaquim Nabuco 07/11); tudo o que o aparelho
lança vale para esse local/dia, lembrado até "Trocar local" ou sair.
Filas por sala/instituição: só os atendimentos que **distribuem senha** (`senhas.services` em `packages/core/src/data.js`:
Saúde, Documentos, Proteção à Mulher, Justiça e Direitos e Saúde Animal; áreas abertas, `excludePlaces` e os tipos em
`excludeKinds` por local ficam fora — no Manga, 04/11, as tendas não distribuem senha, só as salas;
`T.ticketQueuesOf(venue)`), três funções por aparelho: **Triagem** (+1 por senha
entregue ou digitar o total), **Porta da sala** (a chamada já é a entrada na sala: "Chamar a senha N" → a chamada aparece na TV/voz e a pessoa entra; ao terminar, **"Chamar a próxima"** dá a anterior como atendida (tempo de atendimento = intervalo entre as chamadas) e chama a seguinte, numa só gravação (`advance`); a entrada fica registrada no momento da chamada; se a pessoa não veio, "Chamar de novo" reanuncia na TV ou "Não veio" registra a falta e chama a próxima; outro número, desfazer). **Duas séries de senhas por sala** — comuns **N** e prioritárias **P** (idoso, gestante, PcD…), numeradas de forma independente (N 1, N 2… e P 1, P 2…). A triagem define o **padrão de senhas** de cada sala (ou de todas de uma vez): prefixo de cada série, primeiro número, total possível e a **ordem de chamada** (1P:1N, 1P:2N, 1P:3N, 2P:1N ou todas as P primeiro), e lança quantas N e quantas P já entregou (tabela `fila_cfg` + `issued_log.kind`). Senhas já impressas numa sequência única (1-79 comuns, 80-100 prioritárias) cabem no mesmo modelo: comuns começam em 1 (total 79) e prioritárias começam em 80 (total 21). A porta sugere a próxima pela ordem configurada (botão verde grande, com a série e o motivo) e tem dois botões explícitos — **próxima comum** e **próxima prioridade** — para as exceções (duas prioridades seguidas, por exemplo); quando o que a triagem lançou acabou, os botões avisam "além do lançado" mas deixam chamar (a contagem pode estar atrasada). "Outro número" pergunta a série. Um aparelho pode cuidar de **várias salas na mesma tela** ("Adicionar outra sala": um cartão por sala, cada um com a sua fila e os seus botões). Na TV e na voz, a senha leva a letra da série ("N 12", "P 3"; a voz antepõe "Atenção, senha prioritária" nas P) e o cartão da sala mostra última → próxima de cada série e **Painel** (entregues, chamadas, atendidas, faltas, espera estimada, tempo
médio, senha atual, chamadas por hora). Fila offline no aparelho, reenviada quando a rede volta.
**Triagem 2.1** (05/11): um **cartão por fila** com a sala em destaque (tipo e número), o nome do atendimento, o serviço e, logo
abaixo, **o que é oferecido** ali — por padrão o que a programação diz para o dia e o turno (itens com `when`, veja em Dados:
"Consulta Médica"), itens de outro turno esmaecidos — e os contadores N/P (+1, digitar o total, −1). **Editar** (em cada cartão)
muda nome do atendimento, tipo/número da sala, **o que é oferecido por dia e turno** (lista de itens; cada item vale "sempre" ou
só nos dias/turnos marcados — M/T de hoje ao fim do evento — com a opção "igual todos os dias e turnos"; "Usar a programação"
recarrega os itens do serviço) e **senhas por dia** (total possível de N e P em cada dia restante, gravado em `fila_cfg` do dia,
mantendo prefixos, inícios e ordem). O cartão destaca o que vale **agora** (dia e turno atuais) e mostra o que vem depois com menos
ênfase, **consolidando** dias/turnos seguidos com a mesma oferta numa linha só ("todos os dias", "sex 06 e sáb 07", "sáb 07";
`T.offerSlots` + `T.slotGroups`). No formulário, o nome do dia marca o dia inteiro e "Repetir hoje nos demais dias" copia a
agenda de hoje. **Só contagem não tem senhas por dia**: nesse registro o contador da triagem mostra "atendidos · cada +1 = 1 realizado", sem limite nem "de N", o rodapé do cartão não oferece "padrão" (numeração), os campos N/P do dia ficam desabilitados em "Senhas por dia" ("não precisa") e a sala não entra nas folhas de senhas para recortar; a quantidade lançada é o atendimento realizado (estatísticas: `countEvents`). **Registro do atendimento por dia** (`fila_cfg.mode`, coluna "Registro" em "Senhas por dia" e chip no rodapé do
cartão para trocar o de hoje): **chamada** (padrão) = senhas chamadas na porta, fila na porta e na TV; **contagem** = só a
quantidade de senhas entregues conta como atendimentos nas estatísticas (`summarize(…, countOnly)`: atendidas = chamadas =
entregues), a fila some da porta e da TV (`tvBoard` a devolve em `disabled`/`count_only`). "Padrão para todas as salas" não mexe
no modo (cada sala mantém o seu, a menos que `mode` venha explícito). No **painel** do app e no **dashboard** (`/dashboard`),
cada senha entregue numa fila "só contagem" vira um atendimento no horário do lançamento (`dash-stats.countEvents`, a partir
de `issued_history`; correções para baixo tiram as últimas): entra nas séries por hora, na linha do tempo, nos totais e nos
rankings, com a etiqueta "contagem"; tempo médio, faltas e "mais faltas" só consideram filas com chamada. Tudo vale do dia da edição em diante, em todos os aparelhos (tabela `fila_info`, última linha
por ambiente no local, `items` em JSON `[{ t, when }]`; a planta e o site público não mudam). Filas criadas na triagem também
valem do dia da criação até o fim do evento (remover tira de todos os dias). As salas fixas editadas vêm na lista `extras` do estado/TV com `override: true` (só atualizam a fila
existente; nunca criam fila). **Dia de trabalho** (`T.ticketDay`): no dia de serviços do local é ele; nos outros dias do evento o app, a TV e o
painel trabalham com **a data de hoje** (contagens, chamadas, desativações e edições são por dia, sem misturar com 07/11); as
salas da planta aparecem em qualquer dia e a triagem desativa as que não atendem; fora do evento, o próximo/último dia de serviços.
Contagem de entregues: o aparelho mostra o que digitou até o servidor confirmar aquele envio (sem comparar relógios), e os
envios saem em fila, na ordem — corrige o caso em que a contagem "voltava" ao valor anterior (a versão anterior guardava a
contagem local na mesma chave do local do aparelho).

**Perfis (PINs)** (`lib/roles.js`; cada um é uma variável do `.env`, e trocar o PIN derruba os aparelhos daquele perfil):
`PIN_GESTOR` = **administração** (tudo: triagem completa, porta, painel, CSV, e **desativar dias de atendimento** — na triagem, faixa "Dias de atendimento": um dia desativado num local, tabela `dias_off`, some das listas de dias da triagem (senhas por dia, oferta por dia), dos chips do painel e do dashboard para quem não é administração; para a administração continua, riscado e marcado "sem atendimento", para reativar; o que já foi registrado no dia não muda); `PIN_OPERADOR` = **equipe** (tudo menos CSV; é o PIN
já distribuído); `PIN_TRIAGEM` = **triagem** (só lança as quantidades entregues: sem editar, padrão, modo, criar, desativar ou
painel); `PIN_PORTA` = **porta da sala** (só chama senhas e ajusta o número atual). O servidor confere o perfil em cada ação
(`app/actions.js`: ler = todos; entregues = gestor/operador/triagem; porta = gestor/operador/porta; configurar = gestor/operador; dias = gestor).
Perfil com uma função só entra direto nela. Ao entrar na triagem ou na porta, o aparelho **escolhe os serviços** que vai lançar
(um ou vários, ou todos) e só vê as filas deles; o botão **Serviços** no alto da tela reabre a escolha (guardado no aparelho).
Dentro de cada serviço dá para escolher **sala a sala** (chips embaixo do cartão, como na porta): tocar no serviço pega todas as
salas; tocar numa sala marca só ela (o serviço fica "em parte"); num serviço inteiro, tocar numa sala tira só ela; "todas" volta
ao serviço inteiro. Guardado como `st.svcs` (serviços) e `st.places` (salas dos serviços em parte): num serviço com alguma sala
listada só essas aparecem; sem nenhuma listada aparecem todas, inclusive as criadas depois na triagem (`visibleQueues`).

**Novo serviço / sala** (triagem, botão no fim da lista): cria uma fila extra para um atendimento que não estava na planta —
nome, pilar, tipo (sala/tenda/outro) e número, já com o padrão de senhas (N/P possíveis, ordem) e as já entregues. Fica na
tabela `filas_extra` (id do ambiente `<local>-x<n>`), vale para o local/dia, e entra na triagem, na porta, na TV (quando a TV não
está limitada por `?salas=`), na voz (síntese do navegador, sem áudio pronto) e no painel; "remover" tira a fila mantendo o
histórico de chamadas. **Desativar** (link em cada linha da triagem) tira a fila da porta e da TV no dia (tabela `filas_off`,
uma linha por ambiente); ela fica no bloco "Desativados hoje" da triagem, com "Reativar". Junção com as filas fixas em
`apps/senhas/lib/filas-extra.js` (`activeQueues` = fixas + extras − desativadas).

**Grupos de TV** (gestão; triagem → "Grupos de TV"): cria grupos por local (ex.: Entrada, Fundos, Bloco B) marcando as salas da planta e as criadas na triagem; a chave nasce do nome (`entrada-principal`) e cada TV abre `?grupo=<chave>` para mostrar e chamar só aquelas salas (tabela `grupos_tv`; vêm na API do quadro como `grupos`, então mudar o grupo reflete nas TVs abertas sem recarregar). Um grupo configurado com a chave `entrada`/`fundos` substitui o automático da planta; com grupo configurado, as filas criadas na triagem só entram se estiverem no grupo. **Painel**: cada serviço traz uma faixa de totais (entregues, chamadas, atendidas, faltas, aguardando, média) acima das salas e, no fim, "Totais gerais" do recorte. **Chamar além do entregue na triagem.** Quando a próxima senha (ou a próxima comum/prioritária dos botões explícitos) passa do que a triagem lançou como entregue naquela série — ou a triagem não lançou nada — a porta continua podendo chamar, mas o botão fica **âmbar** e aparece um alerta claro ("Não há mais senhas comuns entregues na triagem: a triagem lançou N; a senha X está além disso" / "A triagem não lançou nenhuma senha entregue para esta sala") pedindo para conferir com a triagem; se chamar mesmo assim, a senha existe, então foi falha de lançamento: o servidor (`db.call`, também via `advance`) grava em `issued_log` a contagem da série até esse número (device `porta:<aparelho>`) e a estatística de entregues acompanha (`issued_fix` na resposta). **Sequência da porta.** A próxima senha sai de `queuePlan` (`packages/core/src/fila.js`, puro): cada chamada conta pela série gravada (`calls.priority` = P), a "última" de cada série é o maior número chamado, a próxima é a seguinte enquanto houver senha entregue (ou, sem lançamento, dentro do total possível), e a ordem configurada decide qual série vem agora olhando a rodada atual (quantas N desde a última P, etc.). **Ajustar número** (porta) grava "a última N/P chamada é X" na tabela `fila_cursor`; a sequência recomeça dali e só as chamadas posteriores ao ajuste contam (as anteriores ficam no histórico e no painel). 0 = recomeçar do início da série. A lista antiga de prioritárias por números (`prio_log`) não é mais usada.

**Filtros do painel e do dashboard (v2.2)** — no painel do app, chips de **dia** (dias do evento + dias com registros no local; "hoje"/"serviços" marcados) e botão **Filtros** com local, **turno** (dia todo, manhã, tarde, noite), **serviços**, "só salas com movimento" e "mais atendidas primeiro"; o CSV segue o dia escolhido. O painel foi refeito para celular: cartão por sala com os seis números em grade (uma linha no desktop, 3×2 no telefone), gráfico por hora em HTML (não deforma) e filtros em linhas roláveis. No dashboard, o botão **Filtros** no cabeçalho abre o mesmo conjunto (dia, local, turno, serviços) e grava na URL (`?dia= ?local= ?turno=manha|tarde|noite ?servicos=consulta,pilar-1`), então o link filtrado pode ser compartilhado; toques nos filtros não forçam tela cheia; em tela estreita (celular) o dashboard empilha e rola. Turno e serviços são recalculados no navegador (`lib/dash-stats.filterData`, com `summarize` do core): chamadas filtradas pelo horário; senhas entregues no turno = última contagem até o fim do turno − última contagem antes dele, por sala e série; filas "só contagem" entram pelo horário do lançamento. O `GET /api/stats` (e `getStats`) passou a trazer `calls` e `data_days` (dias/locais com registros).

**Módulo de impressão · senhas previstas** (`/tce-senhas/impressao?local=jn&dia=AAAA-MM-DD&servicos=consulta,pilar-1&salas=jn-r09&serie=n&de=25&ate=48&previsao=com|todas&inativas=1&formato=senhas|lista`; link **Senhas** no painel do app) — página renderizada no servidor a partir do **banco local** (`db.state` do dia), para quem entrou com PIN de administração ou equipe. Formato padrão **senhas para recortar**, no modelo do evento (`senhas_CARTORIO.pdf`): A4 retrato, **24 senhas por folha** (4 × 6) com linhas de corte tracejadas; cada senha traz o nome do atendimento em caixa alta, o número grande com dois dígitos ("01"…"50") e a sala em destaque ("SALA 08", sem a legenda "senha de atendimento" do modelo); as **prioritárias** têm tarja preta "PRIORIDADE", borda cheia e numeração "P01"… (prefixo P da fila); cada sala começa em folha nova, numerando a partir do início configurado (`n_from`/`p_from`); na tela, cada folha tem uma legenda (sala, serviço, folha X de Y) que não sai no papel (`lib/impressao.js`: `ticketsOf`, `pagesOf`, `PER_PAGE`). Formato **lista**: por serviço (pilar), as salas com a quantidade de senhas **previstas** — comuns (N) e prioritárias (P) — para o dia (campo "senhas por dia" da triagem, `fila_cfg`; **não** são as entregues de `issued_log`), ordem de chamada, subtotais e total. Filtros no topo (formulário GET, ficam na URL; com JS aplicam sozinhos a cada mudança e a URL só leva o que difere do padrão), em quatro passos: **1** local, dia, formato, **salas** ("só salas com previsão de senhas", o padrão, ou "todas as salas", em que a sala sem previsão mostra o padrão do app, 100 N / 20 P, e a com previsão zero fica 0) e incluir salas desativadas (riscadas); **2** categorias de serviço (pilares; caixas, nenhuma = todas); **3** atendimentos (salas) agrupados por categoria com sala e previsão ("50 N + 10 P", "sem previsão", "desativada") — marcar uma categoria esconde (e desmarca) as salas das outras; uma sala marcada entra mesmo sem previsão ou desativada (`?salas=jn-r09,jn-x8`); **4** faixa de senhas, só para as senhas para recortar: série (comuns e prioritárias, só comuns, só prioritárias; `?serie=np|n|p`) e intervalo de números impressos dentro de cada série (`?de=25&ate=48`, inclusivos, em branco = sem limite; invertidos são trocados), com atalhos de uma folha (1–24, 2–48…) para reimprimir só a folha que faltou; salas sem senha na faixa não geram folha e o rodapé do formulário mostra "N senhas · M folhas · S salas". Botão **Baixar PDF (A4)** abre `/tce-senhas/impressao/pdf?<mesmos filtros>` (`app/impressao/pdf/route.js`): o PDF é gerado no servidor por `lib/pdf-senhas.js` (sem dependências: A4 retrato, margem 12 mm, 4 × 6 de 42 mm — cabe até em Carta se a impressora ignorar o tamanho —, corte tracejado, Helvetica padrão, nome quebrado em até 2 linhas, tarja e borda nas prioritárias; testes em `tests/pdf-senhas.test.mjs`), então a folha não depende do navegador nem do driver da impressora (que, em Carta ou com margem maior, empurrava a última linha e fazia as folhas ímpares começarem em 25); imprimir em tamanho real (100%). Quando há faixa ativa, um aviso âmbar no passo 4 diz a faixa e tem "Voltar a todas as senhas". "Imprimir pela tela" ainda chama a impressão do navegador; `@media print` em `components/print/print.css` esconde filtros e botões e imprime em A4 com cada serviço inteiro na mesma página. Lógica pura em `lib/impressao.js` (`parseParams`, `previsao` — devolve também `rooms`, todas as salas do local para as caixas —, `paramsOf`, `rangeText`, `ticketsOf(place, range)`, `PRESETS`; testes em `tests/impressao.test.mjs`); formulário cliente em `components/print/PrintForm.jsx`.

**Dashboard de resultados** (`https://dev.gerenciahub.com.br/tce-senhas/dashboard`, público, 16:9, mesmo formato da TV):
números do dia de serviços para projetar no encerramento da ação ou acompanhar ao vivo. Quatro telas que alternam a cada
15 s (ou `?tela=geral|servicos|salas|horas` fixa; `?auto=0` para não alternar; setas ←/→ trocam): **Resultados do dia**
(senhas entregues, chamadas, atendidas, não compareceram, tempo médio, ainda na fila, com números animados; donut do
resultado das chamadas; movimento por hora; destaques: pico, sala mais movimentada, atendimento mais rápido, duração da
ação), **Por serviço** (cartão por serviço com entregues, chamadas, atendidas, faltas, tempo médio, taxa de falta, fila e
curva por hora), **Salas e especialidades** (ranking por atendimentos, mais rápidas, mais faltas) e **Movimento por hora**
(barras empilhadas por serviço e linha do tempo com primeira chamada, pico e última). `?local=jn|manga`, `?dia=AAAA-MM-DD`
(padrão: dia de serviços de hoje, senão o último já ocorrido, senão o próximo), `?zoom=`, tecla F (tela cheia). Dados de
`GET /api/stats?local=&dia=` (público, só leitura; totais, por serviço/sala, histórico de entregas e as chamadas do dia),
atualizados a cada 30 s; cálculos puros em `apps/senhas/lib/dash-stats.js`.

**TV das senhas** (`/tce-senhas/tv`, pública, 16:9, sem login): cabeçalho "TCE NA COMUNIDADE" + relógio, quadro
de salas × senhas (um cartão por sala com a senha atual em destaque, serviço, "chamando"/"em atendimento" e quantas
aguardam), coluna "Últimas chamadas" e rodapé (sem QR); nova chamada abre uma sobreposição grande por 7 s, e chamadas feitas enquanto outra está na tela entram numa fila e aparecem uma por vez, cada uma com sua voz. No app, tocar na senha atual da porta ("Chamar novamente") repete o anúncio na TV sem criar nova chamada (`recalled_at`; `db.recall`)
(A voz é **sempre ligada** (`?voz=0` desliga; para silenciar, baixe o volume da TV): ao abrir, a TV cria o AudioContext e tenta liberá-lo sozinha — em TVs, no Chrome com histórico de reprodução no site ou com `--autoplay-policy=no-user-gesture-required` já fica ativa sem toque; se o navegador bloquear o som automático, ela tenta de novo a cada 5 s e só então mostra o aviso **Ativar som** (um OK no controle ou toque na tela libera); um aviso grande e o rodapé mostram o estado da voz: ativa com o nome da voz, bloqueada, sem voz pt-BR instalada no aparelho, ou o erro; cada chamada toca uma campainha de dois tons e, 0,8 s depois, a voz. Campainha e voz passam pelo **mesmo AudioContext** (Web Audio), com um ruído inaudível em loop que mantém a saída de áudio da TV acordada: TVs e soundbars silenciam os primeiros ~0,5 s de um fluxo de áudio novo, o que cortava o começo de "Senha vinte e três" quando cada arquivo tocava num `<audio>` separado (os áudios também têm 0,4 s de silêncio inicial, volume normalizado e 64 kb/s). A voz vem de **áudios prontos** em `apps/senhas/public/voz/` ("Senha N" para 1–300, uma frase por sala que entrega senha, avisos; `manifest.json`), gerados por `apps/senhas/scripts/gerar-voz.mjs` com Piper (TTS neural offline, voz pt_BR-faber-medium) + ffmpeg, porque o Chrome de TV Android **não tem** `speechSynthesis`; a síntese do navegador fica só como reserva (senha acima de 300, sala sem áudio, falha ao tocar). Ao mudar salas que entregam senha, rode o gerador de novo (cria o que falta e **regrava o que mudou de frase** em relação ao `manifest.json` anterior; `--force` regenera tudo). A TV confere a frase gravada (`manifest.phrases`) com a sala **como está hoje** (nome/número, inclusive edições da triagem): se for diferente — ex.: sala 09 renomeada de "Pediatria" para "Consulta médica", ou movida para a sala 8 — **monta a sala com peças gravadas**: o nome do atendimento (`s-<chave>.mp3`, "Consulta médica.") e o número (`w-sala-8.mp3`, "Sala oito."; `w-tenda-N`, `w-ambiente-N`), em vez de depender da síntese do navegador, que a TV não tem (`placeClips`/`announcementFor` em `apps/senhas/lib/voz.js`; antes o áudio antigo "Pediatria, sala nove" tocava mesmo com a tela certa, e depois só o número saía). O gerador grava os nomes da planta e, com `DB_PATH=apps/senhas/data/senhas.db`, também os nomes editados/criados na triagem (`fila_info`, `filas_extra`). **Frases geradas no servidor** (`lib/voz-server.js`): com `PIPER=`, `MODEL=` e `FFMPEG=` no `.env` (piper instalado no servidor: `python3 -m venv ~/tools/piper && ~/tools/piper/bin/pip install piper-tts`, modelo pt_BR-faber-medium em `~/tools/piper/voices/`), qualquer parte sem áudio pronto vira um áudio gerado **na mesma voz**: `GET /api/voz/frase.mp3?t=<frase>` gera (piper, ~1,5 s na primeira vez; fila de 2 por vez) e guarda `f-<hash>.mp3` em `data/voz/` (ao lado do banco; `frases.json` registra os textos). A TV lê `GET /api/voz/manifest.json?local=&dia=` (prontos + gerados + `tts: true`), que já dispara a geração da frase de cada sala do dia ("<nome>, sala N."); a triagem também dispara ao gravar nome/sala (`setQueueInfo`/`addExtraQueue`); a TV pré-carrega as frases das suas salas ao ativar o som e a cada manifest (5 min), então a primeira chamada já encontra o áudio. **Uma voz só por chamada** (`announcementFor` → `{ files, text, complete }`): áudio pronto da planta → peças gravadas (nome + número) → frase gerada; se tudo tem áudio toca só áudios; se ainda falta algo (servidor sem piper) e o aparelho tem `speechSynthesis`, fala a frase inteira por síntese; sem síntese nem gerador, toca o que há. Nunca mistura áudio pronto com a voz do navegador. "Sala 0" ou sem número não fala "sala zero". **Analisador** (`npm run voz:analisar`, `apps/senhas/scripts/analisar-voz.mjs`; roda no servidor onde está o banco, ex.: o servidor local do TCE): varre os dias/locais (`--dia`, `--local`, `--todos`; padrão hoje em todos os locais), lê as filas como a TV as vê e lista, sala por sala, que áudio a chamada usaria — pronto `p-`, peças `s-`+`w-`, frase gerada `f-` (existente ou a gerar) ou "sem áudio" — com totais; `--gerar` gera ali mesmo o que falta (precisa de PIPER/MODEL/FFMPEG no ambiente ou no `.env`; sem piper, imprime como instalar); `--json` para scripts. Lê `DB_PATH`/`VOZ_DIR` do ambiente ou do `.env`.) A sobreposição da chamada mostra três colunas grandes — **senha, serviço e sala** — e nos cartões a sala aparece grande em dourado, com a categoria do serviço minúscula; no canto inferior direito, o painel "Senha atual" (a última chamada, enorme) e acima
as chamadas anteriores. **Tempo real**: cada gravação de senha (emitir, chamar, entrou, não compareceu) avisa
`lib/bus.js`, e a TV recebe o quadro na hora por SSE (`GET /api/tv/stream?local=&dia=`); o polling de 4 s em
`GET /api/tv?local=&dia=` fica como rede de segurança. O **dia mostrado é o mesmo do app de atendimento**: o dia de
serviços de hoje ou, fora dele, o próximo (ex.: em 02/11 a TV mostra 04/11 · Manga, onde a equipe já está registrando);
`?dia=AAAA-MM-DD` força outro. Cada TV escolhe o que mostra pela URL: `?local=jn|manga`; `?grupo=<chave>` (grupo configurado na triagem ou `entrada|fundos`, deduzidos da planta em
`apps/senhas/lib/tv-grupos.js`: ambientes na metade de baixo da planta, junto ao acesso principal, são "entrada";
os da metade de cima, "fundos" — na Joaquim Nabuco: entrada = salas 01–05, 07–12, tenda 6 e quadra; fundos = salas
13–24, triagem, escovódromo e tendas 2–5; edite `CUSTOM` ou `Y_SPLIT` para ajustar ou criar grupos por tema);
`?salas=03,04,t2` (números ou ids da planta) e `?servicos=pilar-1,pilar-2` (filtra por pilar). `salas` e `grupo`
somam; `servicos` filtra. Mais de 16 salas: páginas alternando a cada 10 s (`?pagina=`). `?zoom=1.1`, tecla F
(tela cheia), `?t=`/`?d=` (simulação). Ex.: TV da entrada `…/tce-senhas/tv?local=jn&grupo=entrada&voz=1`;
TV do fundo `…/tce-senhas/tv?local=jn&grupo=fundos`.

Arquitetura: `app/actions.js` (server actions: login por PIN em cookie httpOnly, estado, fila, estatísticas,
lançamentos), `lib/db.js` (SQLite em `data/senhas.db`, mesmo esquema de antes: `issued_log` e `calls`),
`app/api/export.csv` (download, gestão), `app/api/tv` (quadro da TV) e `app/api/health`. Configuração em `apps/senhas/.env` (copie de
`.env.example`; **nunca commitar**): `PIN_GESTOR`, `PIN_OPERADOR`, `PIN_TRIAGEM`, `PIN_PORTA`, `PORT`, `HOST`, `BASE_PATH`,
`ALLOWED_ORIGINS`, `DB_PATH`, `BACKUP_DIR`.

Produção neste servidor: **https://dev.gerenciahub.com.br/tce-senhas/** — pm2 `tce-senhas`
(`deploy/ecosystem.config.cjs`, `next start -p 3015`), nginx `location /tce-senhas/` → `127.0.0.1:3015`
(bloco em `deploy/nginx-tce-senhas.conf`; `sudo apps/senhas/deploy/install-nginx.sh`).
Atualizar: `git pull && npm ci && npm run build:senhas && pm2 restart tce-senhas`.

Servidor local (sem internet): `git pull` do repositório, `npm ci`, `.env` com `HOST=0.0.0.0` (acesso
direto por `http://IP:3015/tce-senhas/`, ou `BASE_PATH=` vazio para servir na raiz) e, se o acesso for por
IP/nome, `ALLOWED_ORIGINS=192.168.0.10:3015`; `npm run build:senhas && npm run start:senhas` (ou pm2).

Padrão de abertura: `npm run senhas:padrao -- [--n 100] [--p 20] [--ordem 1:1] [--n-de 1] [--p-de 1] [--prefixo-n N] [--prefixo-p P] [--force]` grava a configuração das séries em cada sala que entrega senha nos dias de serviços (sem `--force`, não mexe em salas já configuradas); a mesma coisa pode ser feita na triagem em "Padrão de senhas para todas as salas". Rodar em cada servidor (AWS e o local do TCE) antes do dia. Backup: `npm run backup [rótulo]` gera zip com cópia consistente do banco (`VACUUM INTO`), o `.env` e um
LEIA-ME em `apps/senhas/backups/` (mantém 60); `apps/senhas/scripts/backup-cron.sh` copia para
`~/backups/tce-senhas/` (90 dias). Cron sugerido (`crontab -e`): diário às 03:40 e de hora em hora (7h–20h)
de 03 a 07/11. Restaurar: `pm2 stop tce-senhas`, copiar `senhas.db` para `apps/senhas/data/`, `pm2 start`.

## Dados

Itens de serviço aceitam `only: 'AAAA-MM-DD'` (só naquele dia de serviços) e `when: { 'AAAA-MM-DD': true | ['manha', 'tarde'] }`
(dias e turnos em que acontecem; `T.itemsOn(s, data, turno)`, `T.itemWhenLabel(it)` → "qui 05/11 à tarde · sex 06/11 manhã e
tarde"). O serviço **Consulta Médica** (`consulta`, 05 a 07/11 na Joaquim Nabuco, `days`) usa isso: ginecologia, psiquiatria e
urologia (qui à tarde), ginecologia, pediatria, cardiologia, urologia e exames (sex de manhã; sem exames à tarde), clínico geral
(sáb) e psicologia todos os dias. Ele entra em `D.senhas.services` e fica na sala 09 da Joaquim Nabuco (na triagem, em 05 e 06/11, crie a fila por "Novo serviço / sala" ou edite a sala 09).
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
a origem da rota é o acesso em `?entrada=a1|a2|a3` (padrão a1 = entrada principal; no Manga o padrão é `abertura` = Espaço de abertura, onde o público se concentra; no totem também o id de uma sala ou `x,y`). No Manga não há passagem do hexágono para o bloco das salas 13–15: a rota volta pelo passeio principal e sobe pela lateral da sala 12 (grafo em `maps.manga.corridors`). App: `#mapa?local=jn&p=jn-r11&s=pilar-1&entrada=a1`.
Sem escala: a rota é orientação visual. Ambientes "A definir" e a tenda Webflash ficam ocultos (`hide`).
Início do totem: "mapa vivo" (destaca um serviço a cada 4 s, com as salas nomeadas; toque na sala abre o
caminho; chips por serviço). Rota com "Ouvir o caminho" (síntese de voz pt-BR, quando o navegador tem).
App: "Ampliar o mapa" abre a planta em tela cheia, arrastável, com 2,2× ou 3,2×, centrada no destino.
Início do totem = busca + mapa: resultados instantâneos (serviços com suas salas, salas por nome/número,
cursos), toque em uma sala ou resultado traça o caminho ali mesmo (com "Voltar ao mapa geral"), legenda
dos serviços ao lado do mapa (toque filtra), botão flutuante "Mapa e busca" nas demais telas.
Salas dos cursos na planta: `packages/core/src/salas-cursos.js` (DE → PARA **validado em 31/10**: Joaquim Nabuco
Lab I = 01, Lab II = 02, Sala I = 08, Sala II = 09, Sala III = 11, Sala IV = 13, Sala V = 20, Sala VI = 24;
Manga Lab I = 12; a Sala 13 do Manga já usa o número da planta). App e totem mostram a etiqueta "Sala 08" em cada aula e, no detalhe do
curso, "Onde fica" com o caminho no mapa (o destino recebe o nome do curso, não o do serviço de 07/11).

`resumo.html` (uso da organização, fora da navegação pública, imprimível): cursos por dia e A–Z com sala
da programação e número na planta, serviços com salas por local e itens exclusivos de 07/11, plantas com o
uso de cada sala (serviços em 04/07 e cursos nos outros dias), DE → PARA e pendências.

Pontos a conferir com a organização:
- Curso 109 (Brinquedistas): a tabela traz um link administrativo; usamos `escon/cursos/109`.
- Laboratórios I e II – Joaquim Nabuco, 05/11: o Rios do Saber (156, até 100 participantes) ocupa os dois laboratórios (salas 01 e 02) manhã e tarde, por informação da organização em 05/11. À tarde a tabela ainda traz o Tecnologia e Direito das Mulheres (125, Lab I) e o Videomaker (145, Lab II, movido em 02/11); confirmar onde essas duas turmas ficam. O Tecnologia a Serviço do Controle Social e Ouvidoria (152, Lab I às 8h) foi cancelado pela organização em 05/11 e saiu da programação.
- Tomada de Contas (122), 05/11: saiu da Joaquim Nabuco (Sala V); manhã na Câmara Municipal de Oiapoque (Av. Veiga Cabral, 390 — pino aproximado) e tarde no IFAP – Campus Avançado Oiapoque (Rua Joaquim Caetano da Silva, 870). Informado pela organização em 05/11.
- Como vender pela internet (150): 06/11 no SEBRAE; em 05/11 a organização mudou o horário de 14h para 19h (até 22h).
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
