/* global React */
// MegusCobrancasPage · visão por cliente: agendamento → pagamento → nota →
// cobrança. Versão enxuta: poucos KPIs, "Pagamento" e "Nota" fundidos numa
// SITUAÇÃO, sem ícones/chips competindo. Padrão unificado de Atendimentos.
// window.*, estilos `cb`, hooks sufixados, MegusTokens.
// Dados via window.MegusCobrancas (envelope ResultResponse).

const CB = window.MegusTokens;
const { useState: useStCb, useEffect: useEffCb, useCallback: useCbCb } = React;

const BRL = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');
const CB_FILTERS = ['Todos', 'A cobrar', 'Pendentes', 'Pagos'];

function MegusCobrancasPage() {
  const [clientes, setClientes] = useStCb(null);
  const [metricas, setMetricas] = useStCb(null);
  const [busca, setBusca] = useStCb('');
  const [filtro, setFiltro] = useStCb('Todos');
  const [cobrando, setCobrando] = useStCb({});

  const carregar = useCbCb(async () => {
    const [rc, rm] = await Promise.all([
      window.MegusCobrancas.listClientes(),
      window.MegusCobrancas.getMetricas(),
    ]);
    if (rc.success) setClientes(rc.data);
    if (rm.success) setMetricas(rm.data);
  }, []);
  useEffCb(() => { carregar(); }, [carregar]);

  async function cobrar(c, e) {
    e.stopPropagation();
    setCobrando((m) => ({ ...m, [c.id]: 'loading' }));
    const r = await window.MegusCobrancas.cobrar(c.id);
    if (r.success) {
      setClientes((cs) => cs.map((x) => x.id === c.id ? { ...x, cobrado: true, cobradoEm: 'agora' } : x));
      setMetricas((m) => m ? { ...m, aCobrar: Math.max(0, m.aCobrar - 1) } : m);
      setCobrando((m) => ({ ...m, [c.id]: 'done' }));
    }
  }

  const lista = clientes || [];
  const match = (c, f) => f === 'Todos' ? true
    : f === 'Pagos' ? c.pago
    : f === 'Pendentes' ? !c.pago
    : /* A cobrar */ (!c.pago && !c.cobrado);
  const filtrados = lista.filter((c) => {
    const q = busca.trim().toLowerCase();
    const passaBusca = !q || [c.nome, c.servico].some((x) => (x || '').toLowerCase().includes(q));
    return match(c, filtro) && passaBusca;
  });
  const contagem = (f) => lista.filter((c) => match(c, f)).length;

  // KPIs enxutos — o essencial da cobrança
  const KPIS = metricas ? [
    { label: 'A receber', value: BRL(metricas.valorPendente), accent: CB.text.primary, big: true },
    { label: 'A cobrar', value: metricas.aCobrar, accent: CB.status.warning },
    { label: 'Pagos', value: `${metricas.pagos} / ${metricas.agendados}`, accent: CB.status.success },
  ] : null;

  return (
    <div style={cb.page}>
      <div style={cb.wrap}>
        {/* Cabeçalho fora do painel — respira */}
        <header style={cb.pageHead}>
          <div>
            <h1 style={cb.title}>Cobranças</h1>
            <p style={cb.subtitle}>Quem pagou, quem falta e quem já foi cobrado.</p>
          </div>
          <button style={cb.ghost} onClick={carregar}><window.IC.refresh size={14} stroke={CB.text.secondary} /> Atualizar</button>
        </header>

        {/* 3 KPIs em cards discretos */}
        <div style={cb.kpis}>
          {(KPIS || [0, 1, 2].map((i) => ({ label: '', value: '—', accent: CB.text.subtle, loading: true, key: i }))).map((m, i) => (
            <div key={m.label || i} style={cb.kpiCard}>
              <div style={{ ...cb.kpiVal, color: m.accent, fontSize: m.big ? 26 : 24 }}>{m.value}</div>
              <div style={cb.kpiLabel}>{m.label || '\u00a0'}</div>
            </div>
          ))}
        </div>

        <div style={cb.panel}>
          {/* Busca + filtros */}
          <div style={cb.toolbar}>
            <span style={cb.searchWrap}>
              <span style={cb.searchIcon}><window.IC.search size={15} stroke={CB.text.subtle} /></span>
              <input style={cb.search} placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </span>
            <div style={cb.filters}>
              {CB_FILTERS.map((f) => {
                const ativo = filtro === f;
                return (
                  <button key={f} onClick={() => setFiltro(f)} style={{ ...cb.chip, ...(ativo ? cb.chipOn : {}) }}>
                    {f}<span style={{ ...cb.chipNum, ...(ativo ? { background: 'rgba(255,255,255,.22)', color: '#fff' } : {}) }}>{contagem(f)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cabeçalho da lista */}
          <div style={cb.listHead}>
            <span style={{ flex: '2.4 1 0' }}>CLIENTE</span>
            <span style={{ width: 120 }}>AGENDAMENTO</span>
            <span style={{ width: 96, textAlign: 'right' }}>VALOR</span>
            <span style={{ flex: '1.6 1 0', paddingLeft: 22 }}>SITUAÇÃO</span>
            <span style={{ width: 150, textAlign: 'right' }} />
          </div>

          {clientes === null && (
            <div style={cb.stateMsg}><window.IC.refresh size={16} stroke={CB.text.subtle} style={{ animation: 'megusSpin 1s linear infinite' }} /> Carregando…</div>
          )}
          {clientes !== null && filtrados.length === 0 && (
            <div style={cb.stateMsg}>Nenhum cliente corresponde ao filtro.</div>
          )}

          {filtrados.map((c) => {
            const cobrado = c.cobrado || cobrando[c.id] === 'done';
            return (
              <div key={c.id} style={cb.row}>
                <span style={{ flex: '2.4 1 0', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={cb.avatar}>{c.nome.charAt(0)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={cb.name}>{c.nome}</span>
                    <span style={cb.svc}>{c.servico}</span>
                  </span>
                </span>
                <span style={{ width: 120, fontSize: 13, color: CB.text.muted }}>{c.agendamento}</span>
                <span style={{ width: 96, textAlign: 'right', fontFamily: CB.font.mono, fontSize: 13.5, fontWeight: 700, color: CB.text.primary }}>{BRL(c.valor)}</span>
                <span style={{ flex: '1.6 1 0', paddingLeft: 22, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: c.pago ? CB.status.success : CB.status.warning }} />
                  {c.pago
                    ? <span style={cb.sit}>Pago <span style={cb.sitSub}>· NFS-e {c.notaNum}</span></span>
                    : <span style={cb.sit}>Aguardando pagamento</span>}
                </span>
                <span style={{ width: 150, display: 'flex', justifyContent: 'flex-end' }}>
                  {c.pago
                    ? null
                    : cobrado
                      ? <span style={cb.cobrado}>Cobrado · {c.cobradoEm}</span>
                      : <button style={cb.cobrarBtn} className="cb-cobrar" onClick={(e) => cobrar(c, e)} disabled={cobrando[c.id] === 'loading'}>
                          {cobrando[c.id] === 'loading' ? 'Enviando…' : <React.Fragment><window.IC.chat size={12} stroke={CB.status.whatsapp} /> Cobrar</React.Fragment>}
                        </button>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
window.MegusCobrancasPage = MegusCobrancasPage;

const cb = {
  page: { padding: '30px 28px 40px', minHeight: '100%', fontFamily: CB.font.sans },
  wrap: { maxWidth: 1080, margin: '0 auto' },

  pageHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 },
  title: { fontFamily: CB.font.brand, fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: CB.text.primary },
  subtitle: { fontSize: 14, color: CB.text.muted, margin: '7px 0 0' },
  ghost: { height: 40, padding: '0 15px', borderRadius: CB.radius.md, border: `1px solid ${CB.surface.borderStrong}`, background: '#fff', color: CB.text.secondary, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: CB.font.sans, flexShrink: 0 },

  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 },
  kpiCard: { background: '#fff', border: `1px solid ${CB.surface.border}`, borderRadius: CB.radius.lg, padding: '16px 20px', boxShadow: CB.shadow.sm },
  kpiVal: { fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  kpiLabel: { fontSize: 12.5, color: CB.text.muted, marginTop: 8, fontWeight: 500 },

  panel: { background: '#fff', border: `1px solid ${CB.surface.border}`, borderRadius: CB.radius.lg, boxShadow: CB.shadow.sm, overflow: 'hidden' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px' },
  searchWrap: { position: 'relative', flex: 1, display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 13, pointerEvents: 'none' },
  search: { width: '100%', height: 40, padding: '0 14px 0 38px', fontSize: 13.5, border: `1px solid ${CB.surface.border}`, borderRadius: CB.radius.md, outline: 'none', background: '#fff', fontFamily: CB.font.sans, color: CB.text.primary },
  filters: { display: 'flex', gap: 6 },
  chip: { height: 38, padding: '0 12px', borderRadius: CB.radius.sm, border: `1px solid ${CB.surface.border}`, background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: CB.text.secondary, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: CB.font.sans },
  chipOn: { background: CB.brand.primary, color: '#fff', borderColor: CB.brand.primary },
  chipNum: { fontSize: 11, fontWeight: 800, background: CB.surface.divider, color: CB.text.muted, padding: '1px 6px', borderRadius: 99, fontVariantNumeric: 'tabular-nums' },

  listHead: { display: 'flex', alignItems: 'center', padding: '10px 22px', fontSize: 10.5, fontWeight: 700, color: CB.text.muted, letterSpacing: '.04em', borderTop: `1px solid ${CB.surface.divider}`, background: CB.surface.cardMuted },
  row: { display: 'flex', alignItems: 'center', padding: '13px 22px', borderTop: `1px solid ${CB.surface.divider}`, background: '#fff' },
  avatar: { width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `linear-gradient(150deg, ${CB.brand.primaryLight}, ${CB.brand.primaryDarker})`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 },
  name: { display: 'block', fontSize: 14, fontWeight: 700, color: CB.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  svc: { display: 'block', fontSize: 12, color: CB.text.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sit: { fontSize: 13.5, fontWeight: 600, color: CB.text.primary, whiteSpace: 'nowrap' },
  sitSub: { fontWeight: 500, color: CB.text.subtle, fontFamily: CB.font.mono, fontSize: 12 },
  cobrado: { fontSize: 12.5, color: CB.text.muted, fontWeight: 600 },
  cobrarBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: CB.radius.sm, border: `1px solid ${CB.status.whatsapp}`, background: '#fff', color: CB.status.whatsapp, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: CB.font.sans },

  stateMsg: { padding: '48px 20px', textAlign: 'center', color: CB.text.muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, borderTop: `1px solid ${CB.surface.divider}` },
};

if (typeof document !== 'undefined' && !document.getElementById('megus-cb-anim')) {
  const s = document.createElement('style');
  s.id = 'megus-cb-anim';
  s.textContent = '@keyframes megusSpin{to{transform:rotate(360deg)}}.cb-cobrar:hover{background:' + CB.status.whatsapp + ';color:#fff}.cb-cobrar:hover svg{stroke:#fff}';
  document.head.appendChild(s);
}
