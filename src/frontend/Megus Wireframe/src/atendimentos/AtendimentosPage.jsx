/* global React */
// MegusAtendimentosPage · visão geral dos agentes (dentro do shell).
// Direção "A · Painel unificado": tudo numa única superfície branca — título +
// faixa de KPIs inline (sem tiles soltos) + busca/filtros + lista de agentes
// com um ritmo único de linhas. Objetivo: leitura homogênea e clara.
// Método Megus: window.*, estilos prefixados `at`, hooks sufixados, MegusTokens.
// Dados via window.MegusAtendimentos (envelope ResultResponse).

const AT = window.MegusTokens;
const { useState: useStAt, useEffect: useEffAt, useCallback: useCbAt } = React;

const AT_STATUS = {
  operando:     { label: 'Operando',     fg: AT.status.success, bg: AT.status.successBg, dot: '#1FA855' },
  atencao:      { label: 'Atenção',      fg: AT.status.warning, bg: AT.status.warningBg, dot: '#E0A11E' },
  pausado:      { label: 'Pausado',      fg: AT.text.secondary, bg: AT.surface.divider, dot: AT.text.subtle },
  desconectado: { label: 'Desconectado', fg: AT.text.muted,     bg: AT.surface.divider, dot: AT.surface.borderStrong },
};
const AT_FILTERS = ['Todos', 'Operando', 'Atenção', 'Pausado', 'Desconectado'];

const AT_KPIS = [
  { label: 'Operando',         get: (m) => `${m.operando} / ${m.total}` },
  { label: 'Conversas abertas', get: (m) => m.abertas },
  { label: 'Notas hoje',        get: (m) => m.notasHoje, hero: true },
  { label: 'Mensagens hoje',    get: (m) => m.msgsHoje },
  { label: 'Transferências',    get: (m) => m.transferencias },
  { label: 'Alertas',           get: (m) => m.alertas, warn: true },
];

function MegusAtendimentosPage({ onOpenAgente }) {
  const [agentes, setAgentes] = useStAt(null);
  const [metricas, setMetricas] = useStAt(null);
  const [busca, setBusca] = useStAt('');
  const [filtro, setFiltro] = useStAt('Todos');
  const [flowOpen, setFlowOpen] = useStAt(false);

  const carregar = useCbAt(async () => {
    const [ra, rm] = await Promise.all([
      window.MegusAtendimentos.listAgentes(),
      window.MegusAtendimentos.getMetricas(),
    ]);
    if (ra.success) setAgentes(ra.data);
    if (rm.success) setMetricas(rm.data);
  }, []);
  useEffAt(() => { carregar(); }, [carregar]);

  const lista = agentes || [];
  const rotulo = (a) => (AT_STATUS[a.status] ? AT_STATUS[a.status].label : a.status);
  const filtrados = lista.filter((a) => {
    const passaFiltro = filtro === 'Todos' || rotulo(a) === filtro;
    const q = busca.trim().toLowerCase();
    const passaBusca = !q || [a.nome, a.papel, a.numero, a.segmento].some((x) => (x || '').toLowerCase().includes(q));
    return passaFiltro && passaBusca;
  });
  const contagem = (f) => f === 'Todos' ? lista.length : lista.filter((a) => rotulo(a) === f).length;

  return (
    <div style={at.page}>
      <div style={at.wrap}>
        <div style={at.panel}>
          {/* Cabeçalho */}
          <div style={at.head}>
            <div style={at.titleRow}>
              <h1 style={at.title}>Atendimentos</h1>
              <span style={at.live}><span style={at.liveDot} /> AO VIVO</span>
            </div>
            <div style={at.headBtns}>
              <button style={at.ghost} onClick={carregar}><window.IC.refresh size={14} stroke={AT.text.secondary} /> Atualizar</button>
              <button style={at.primary} onClick={() => setFlowOpen(true)}><window.IC.plus size={14} stroke="#fff" sw={2.4} /> Configurar agente</button>
            </div>
          </div>

          {/* KPIs inline — sem caixas soltas */}
          <div style={at.kpiStrip}>
            {AT_KPIS.map((m, i) => (
              <div key={m.label} style={{ ...at.kpi, borderLeft: i === 0 ? 'none' : `1px solid ${AT.surface.divider}` }}>
                <span style={{ ...at.kpiVal, color: !metricas ? AT.text.subtle : m.hero ? AT.status.success : m.warn ? AT.status.warning : AT.text.primary }}>
                  {metricas ? m.get(metricas) : '—'}
                </span>
                <span style={at.kpiLabel}>{m.label}</span>
              </div>
            ))}
          </div>

          {/* Busca + filtros */}
          <div style={at.toolbar}>
            <span style={at.searchWrap}>
              <span style={at.searchIcon}><window.IC.search size={15} stroke={AT.text.subtle} /></span>
              <input style={at.search} placeholder="Buscar por agente, função ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </span>
            <div style={at.filters}>
              {AT_FILTERS.map((f) => {
                const ativo = filtro === f;
                return (
                  <button key={f} onClick={() => setFiltro(f)} style={{ ...at.chip, ...(ativo ? at.chipOn : {}) }}>
                    {f}<span style={{ ...at.chipNum, ...(ativo ? { background: 'rgba(255,255,255,.22)', color: '#fff' } : {}) }}>{contagem(f)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cabeçalho da lista */}
          <div style={at.listHead}>
            <span style={{ flex: '2 1 0' }}>AGENTE</span>
            <span style={{ width: 148 }}>STATUS</span>
            <span style={{ width: 86, textAlign: 'right' }}>CONVERSAS</span>
            <span style={{ width: 74, textAlign: 'right' }}>NOTAS</span>
            <span style={{ width: 92, textAlign: 'right' }}>RESP.</span>
            <span style={{ width: 104, textAlign: 'right' }}>ATIVIDADE</span>
            <span style={{ width: 24 }} />
          </div>

          {/* Estados */}
          {agentes === null && (
            <div style={at.stateMsg}><window.IC.refresh size={16} stroke={AT.text.subtle} style={{ animation: 'megusSpin 1s linear infinite' }} /> Carregando agentes…</div>
          )}
          {agentes !== null && filtrados.length === 0 && (
            <div style={at.stateMsg}>
              {lista.length === 0
                ? 'Nenhum agente ainda. Configure seu atendente e conecte um número para começar.'
                : 'Nenhum agente corresponde ao filtro.'}
            </div>
          )}

          {/* Linhas */}
          {filtrados.map((a) => {
            const sc = AT_STATUS[a.status] || AT_STATUS.desconectado;
            const now = a.ultima === 'agora';
            return (
              <button key={a.id} className="at-row" style={at.row} onClick={() => onOpenAgente && onOpenAgente(a)} title="Abrir agente">
                <span style={{ flex: '2 1 0', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={at.avatarWrap}>
                    <span style={at.avatar}>{a.nome.charAt(0)}</span>
                    <span style={{ ...at.avatarDot, background: sc.dot }} />
                  </span>
                  <span style={{ minWidth: 0, textAlign: 'left' }}>
                    <span style={at.name}>{a.nome} <span style={at.role}>· {a.papel}</span></span>
                    <span style={at.sub}>{a.numero} · {a.segmento}</span>
                  </span>
                </span>
                <span style={{ width: 148, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ ...at.badge, color: sc.fg, background: sc.bg }}><span style={{ width: 6, height: 6, borderRadius: 99, background: sc.dot }} /> {sc.label}</span>
                  {a.alerta && <span style={at.alertDot} title={a.alerta}><window.IC.alert size={13} stroke={AT.status.warning} /></span>}
                </span>
                <span style={{ width: 86, textAlign: 'right', ...at.num }}>{a.conversas}</span>
                <span style={{ width: 74, textAlign: 'right', ...at.num, color: a.notasHoje > 0 ? AT.status.success : AT.text.subtle, fontWeight: 700 }}>{a.notasHoje}</span>
                <span style={{ width: 92, textAlign: 'right', ...at.num, fontFamily: AT.font.mono, fontSize: 12.5, color: AT.text.muted }}>{a.resp}</span>
                <span style={{ width: 104, textAlign: 'right', fontSize: 12.5, fontWeight: now ? 700 : 500, color: now ? AT.status.success : AT.text.muted }}>{now ? 'Ativo agora' : 'há ' + a.ultima}</span>
                <span style={{ width: 24, display: 'flex', justifyContent: 'flex-end' }}><window.IC.chevronR size={15} stroke={AT.text.subtle} /></span>
              </button>
            );
          })}
        </div>
      </div>

      {flowOpen && window.MegusWhatsAppFlow && <window.MegusWhatsAppFlow onClose={() => setFlowOpen(false)} />}
    </div>
  );
}
window.MegusAtendimentosPage = MegusAtendimentosPage;

const at = {
  page: { padding: '30px 28px 40px', minHeight: '100%', fontFamily: AT.font.sans },
  wrap: { maxWidth: 1180, margin: '0 auto' },
  panel: { background: '#fff', border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.lg, boxShadow: AT.shadow.sm, overflow: 'hidden' },

  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px 24px 16px' },
  titleRow: { display: 'flex', alignItems: 'center', gap: 11 },
  title: { fontFamily: AT.font.brand, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: AT.text.primary },
  live: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: AT.status.success, background: AT.status.successBg, padding: '3px 9px', borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 99, background: '#1FA855', animation: 'megusLive 1.6s ease-in-out infinite' },
  headBtns: { display: 'flex', gap: 9 },
  ghost: { height: 38, padding: '0 14px', borderRadius: AT.radius.md, border: `1px solid ${AT.surface.borderStrong}`, background: '#fff', color: AT.text.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: AT.font.sans },
  primary: { height: 38, padding: '0 15px', borderRadius: AT.radius.md, border: 'none', background: `linear-gradient(150deg, ${AT.brand.primaryLight}, ${AT.brand.primaryDark})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: AT.font.sans, boxShadow: '0 4px 14px rgba(27,35,48,.22)' },

  kpiStrip: { display: 'flex', borderTop: `1px solid ${AT.surface.divider}`, borderBottom: `1px solid ${AT.surface.divider}`, background: AT.surface.cardMuted },
  kpi: { flex: 1, padding: '13px 18px', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiVal: { fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  kpiLabel: { fontSize: 11, color: AT.text.muted, fontWeight: 500 },

  toolbar: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px' },
  searchWrap: { position: 'relative', flex: 1, display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 13, pointerEvents: 'none' },
  search: { width: '100%', height: 40, padding: '0 14px 0 38px', fontSize: 13.5, border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, outline: 'none', background: '#fff', fontFamily: AT.font.sans, color: AT.text.primary },
  filters: { display: 'flex', gap: 6 },
  chip: { height: 38, padding: '0 12px', borderRadius: AT.radius.sm, border: `1px solid ${AT.surface.border}`, background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: AT.text.secondary, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: AT.font.sans },
  chipOn: { background: AT.brand.primary, color: '#fff', borderColor: AT.brand.primary },
  chipNum: { fontSize: 11, fontWeight: 800, background: AT.surface.divider, color: AT.text.muted, padding: '1px 6px', borderRadius: 99, fontVariantNumeric: 'tabular-nums' },

  listHead: { display: 'flex', alignItems: 'center', padding: '10px 24px', fontSize: 10.5, fontWeight: 700, color: AT.text.muted, letterSpacing: '.04em', borderTop: `1px solid ${AT.surface.divider}`, background: AT.surface.cardMuted },
  row: { width: '100%', display: 'flex', alignItems: 'center', padding: '13px 24px', border: 'none', borderTop: `1px solid ${AT.surface.divider}`, background: '#fff', cursor: 'pointer', fontFamily: AT.font.sans, textAlign: 'left' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 40, height: 40, borderRadius: 11, background: `linear-gradient(150deg, ${AT.brand.primaryLight}, ${AT.brand.primaryDarker})`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  avatarDot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 99, border: '2.5px solid #fff' },
  name: { display: 'block', fontSize: 14, fontWeight: 700, color: AT.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  role: { fontWeight: 500, color: AT.text.muted },
  sub: { display: 'block', fontSize: 11.5, color: AT.text.subtle, fontFamily: AT.font.mono, marginTop: 2 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999 },
  alertDot: { display: 'inline-flex', cursor: 'help' },
  num: { fontSize: 14, color: AT.text.primary, fontVariantNumeric: 'tabular-nums' },

  stateMsg: { padding: '48px 20px', textAlign: 'center', color: AT.text.muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, borderTop: `1px solid ${AT.surface.divider}` },
};

if (typeof document !== 'undefined' && !document.getElementById('megus-at-anim')) {
  const s = document.createElement('style');
  s.id = 'megus-at-anim';
  s.textContent =
    '@keyframes megusSpin{to{transform:rotate(360deg)}}' +
    '@keyframes megusLive{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.at-row{transition:background .12s}.at-row:hover{background:' + AT.surface.cardMuted + '}';
  document.head.appendChild(s);
}
