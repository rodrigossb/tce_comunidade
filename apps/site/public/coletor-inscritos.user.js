// ==UserScript==
// @name         TCE na Comunidade · coletor de inscritos (painel ESCON)
// @namespace    https://www.tce.ap.gov.br/tce-na-comunidade
// @version      1.1
// @description  Lê a API pública do painel (ou os cartões da página) e envia os inscritos por curso para o resumo de cursos. Roda ao abrir e a cada 30 min.
// @match        https://servicos.tce.ap.gov.br/escon/admin/painel/*
// @match        https://servicos.tce.ap.gov.br/escon/admin/api/public/painel/*
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  var API = 'https://dev.gerenciahub.com.br/tce-senhas/api/inscritos';
  var token = localStorage.getItem('tce_inscritos_token') || prompt('Token do coletor de inscritos (pedir à organização):');
  if (!token) return; localStorage.setItem('tce_inscritos_token', token);
  var API_PAINEL = '/escon/admin/api/public/painel/oiapoque' + location.search; // mesma origem: leva o ?k= da página
  function enviar(body) {
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (!x.ok) { if (x.j && /token/.test(x.j.error || '')) localStorage.removeItem('tce_inscritos_token'); throw new Error(x.j.error || 'erro'); } aviso('Inscritos enviados: ' + x.j.cursos + ' turmas (painel ' + (x.j.painelInfo || '?') + ')' + (x.j.semCorrespondencia && x.j.semCorrespondencia.length ? ' · sem correspondência: ' + x.j.semCorrespondencia.length : '')); })
      .catch(function (e) { aviso('Falha ao enviar inscritos: ' + e.message, true); });
  }
  function coletar() {
    // 1) Esta aba já é a API (JSON na tela)? 2) Busca a API na mesma origem. 3) Cartões da página (painel antigo).
    if (/\/api\/public\/painel\//.test(location.pathname)) { try { JSON.parse(document.body.innerText); enviar({ json: document.body.innerText, source: 'navegador-api' }); return; } catch (e) { /* segue */ } }
    fetch(API_PAINEL, { credentials: 'include', headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw new Error('API ' + r.status); return r.text(); })
      .then(function (txt) { JSON.parse(txt); enviar({ json: txt, source: 'navegador-api' }); })
      .catch(function () { coletarCartoes(); });
  }
  function coletarCartoes() {
    var cards = Array.prototype.map.call(document.querySelectorAll('li.po-cartao'), function (li) {
      var h = li.querySelector('h3'); var d = li.querySelector('.po-data'); var n = li.querySelector('.po-inscritos strong');
      return { title: h ? h.textContent.trim() : '', date: d ? d.textContent.trim() : '', inscritos: n ? Number(n.textContent.replace(/\D/g, '')) : 0 };
    }).filter(function (c) { return c.title; });
    var info = (document.body.innerText.match(/N[úu]meros de (\d{1,2}) de (\w+),? [àa]s (\d{1,2}:\d{2})/i) || []);
    var MES = { novembro: '11', dezembro: '12', outubro: '10' };
    var painelInfo = info.length ? (info[1].length < 2 ? '0' + info[1] : info[1]) + '/' + (MES[info[2].toLowerCase()] || info[2]) + ' ' + info[3] : '';
    if (!cards.length) { aviso('Nenhum cartão nem API encontrados nesta página', true); return; }
    enviar({ cards: cards, painelInfo: painelInfo, source: 'navegador' });
  }
  function aviso(t, erro) {
    var el = document.getElementById('tce-coletor') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tce-coletor' }));
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 12px;border-radius:10px;font:13px/1.3 system-ui,sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);background:' + (erro ? '#b91c1c' : '#1f3b9a');
    el.textContent = t + ' · ' + new Date().toLocaleTimeString('pt-BR'); console.log('[tce] ' + t);
  }
  setTimeout(coletar, 2500); setInterval(coletar, 30 * 60 * 1000);
})();
