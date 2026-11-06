'use client';
// Formulário de filtros do módulo de impressão (GET: o estado fica na URL). Com JS: aplica sozinho a cada mudança (números com
// pequena espera), esconde as salas das categorias não marcadas (e desmarca as escondidas), atalhos de faixa preenchem
// "do nº/até o nº" e botões Limpar/Imprimir. Sem JS, o botão "Aplicar" envia o formulário normalmente.
import { useEffect, useRef } from 'react';

export default function PrintForm({ children, summary, clearHref }) {
  const ref = useRef(null);
  useEffect(() => {
    const form = ref.current; if (!form) return undefined;
    let timer = null;
    const submit = () => { clearTimeout(timer); if (form.requestSubmit) form.requestSubmit(); else form.submit(); };
    const syncRooms = () => {
      const on = new Set([...form.querySelectorAll('input[name=svc]:checked')].map((i) => i.value));
      for (const g of form.querySelectorAll('.pr-rgroup')) {
        const hide = on.size > 0 && !on.has(g.dataset.svc); g.hidden = hide;
        if (hide) for (const i of g.querySelectorAll('input:checked')) i.checked = false;
      }
      const none = form.querySelector('.pr-rooms-none'); if (none) none.hidden = [...form.querySelectorAll('.pr-rgroup')].some((g) => !g.hidden);
    };
    syncRooms();
    const onChange = (e) => {
      const el = e.target; if (!el || !el.name) return;
      if (el.name === 'svc') syncRooms();
      if (el.type === 'number') { clearTimeout(timer); timer = setTimeout(submit, 800); } else submit();
    };
    const onClick = (e) => {
      const b = e.target.closest('button[data-de]'); if (!b) return;
      form.elements.de.value = b.dataset.de; form.elements.ate.value = b.dataset.ate; submit();
    };
    const onKey = (e) => { if (e.key === 'Enter' && e.target && e.target.type === 'number') { e.preventDefault(); submit(); } };
    // URL limpa: campos vazios ou no valor padrão não vão na query (a página seguinte recria o formulário inteiro)
    const DEFAULTS = { serie: 'np', formato: 'senhas', previsao: 'com' };
    const onSubmit = () => { for (const el of form.elements) { if (!el.name) continue; if (el.value === '' || DEFAULTS[el.name] === el.value) el.disabled = true; } };
    form.addEventListener('change', onChange); form.addEventListener('click', onClick); form.addEventListener('keydown', onKey); form.addEventListener('submit', onSubmit);
    form.classList.add('js');
    return () => { clearTimeout(timer); form.removeEventListener('change', onChange); form.removeEventListener('click', onClick); form.removeEventListener('keydown', onKey); form.removeEventListener('submit', onSubmit); };
  }, []);
  return (
    <form method="get" className="pr-filters" id="filtros" ref={ref}>
      {children}
      <div className="pr-actions">
        {summary ? <p className="pr-sum">{summary}</p> : null}
        <a className="btn btn-ghost sm" href={clearHref} data-act="limpar">Limpar filtros</a>
        <button type="submit" className="btn btn-ghost sm pr-apply" data-act="aplicar">Aplicar filtros</button>
        <button type="button" className="btn btn-primary" data-act="imprimir" onClick={() => { try { window.print(); } catch { /* navegador sem impressão */ } }}>Imprimir</button>
      </div>
    </form>
  );
}
