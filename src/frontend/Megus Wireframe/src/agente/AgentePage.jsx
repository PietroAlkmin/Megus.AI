/* global React */
// MegusAgentePage · workspace de um agente (abre ao clicar numa linha de
// Atendimentos). Cabeçalho do agente + abas; a aba "Conversas ao vivo" é o
// coração: split lista + chat (monitoramento read-only + assumir conversa).
// Método Megus: window.*, estilos prefixados `ag`, hooks sufixados, MegusTokens.
// Dados via window.MegusConversas (envelope ResultResponse).

const AG = window.MegusTokens;
const { useState: useStAg, useEffect: useEffAg, useCallback: useCbAg } = React;

const AG_STATUS = {
  operando:     { label: 'Operando',     fg: AG.status.success, bg: AG.status.successBg, dot: '#1FA855' },
  atencao:      { label: 'Atenção',      fg: AG.status.warning, bg: AG.status.warningBg, dot: '#E0A11E' },
  pausado:      { label: 'Pausado',      fg: AG.text.secondary, bg: AG.surface.divider, dot: AG.text.subtle },
  desconectado: { label: 'Desconectado', fg: AG.text.muted,     bg: AG.surface.divider, dot: AG.surface.borderStrong },
};
const CONV_TAG = {
  BOT:        { label: 'Kaua', fg: AG.status.success, bg: AG.status.successBg },
  AGUARDANDO: { label: 'Aguardando', fg: AG.status.warning, bg: AG.status.warningBg },
  HUMANO:     { label: 'Humano', fg: AG.brand.primary, bg: '#EAF0F7' },
};
const AG_TABS = [
  { id: 'conversas',   label: 'Conversas ao vivo', icon: 'chat' },
  { id: 'config',      label: 'Configuração',      icon: 'settings' },
  { id: 'conhecimento',label: 'Conhecimento',      icon: 'fileText' },
  { id: 'historico',   label: 'Histórico de notas',icon: 'doc' },
];

function MegusAgentePage({ agente, onBack }) {
  const [tab, setTab] = useStAg('conversas');
  const [paused, setPaused] = useStAg(agente.status === 'pausado');
  const [flowOpen, setFlowOpen] = useStAg(false);
  // Edição direta da persona (GET/PUT /api/agente) — separado do
  // MegusWhatsAppFlow acima (que é o onboarding: options → agent → QR).
  const [personaInitial, setPersonaInitial] = useStAg(null);
  const [personaOpen, setPersonaOpen] = useStAg(false);
  const [personaErro, setPersonaErro] = useStAg(null);
  const sc = AG_STATUS[paused ? 'pausado' : agente.status] || AG_STATUS.desconectado;

  const abrirConfigurarAgente = async () => {
    setPersonaErro(null);
    const r = await window.MegusAgente.carregar();
    if (r.success) { setPersonaInitial(r.data); setPersonaOpen(true); }
    else setPersonaErro(r.message || 'Não foi possível carregar a persona do agente.');
  };

  return (
    <div style={ag.page}>
      {/* Cabeçalho do agente */}
      <div style={ag.header}>
        <button style={ag.back} className="ag-hover" onClick={onBack} title="Voltar para Atendimentos">
          <window.IC.arrow size={16} stroke={AG.text.secondary} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span style={ag.avatarWrap}>
          <span style={ag.avatar}>{agente.nome.charAt(0)}</span>
          <span style={{ ...ag.avatarDot, background: sc.dot }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={ag.name}>{agente.nome}</div>
          <div style={ag.role}>{agente.papel} · <span style={{ fontFamily: AG.font.mono }}>{agente.numero}</span></div>
        </div>
        <span style={{ ...ag.badge, color: sc.fg, background: sc.bg }}><span style={{ width: 6, height: 6, borderRadius: 99, background: sc.dot }} /> {sc.label}</span>
        <div style={{ flex: 1 }} />
        {personaErro && <span style={{ fontSize: 12, color: AG.status.danger }}>{personaErro}</span>}
        <button style={ag.ghost} className="ag-hover" onClick={() => setPaused((v) => !v)}>
          <window.IC.clock size={14} stroke={AG.text.secondary} /> {paused ? 'Retomar agente' : 'Pausar agente'}
        </button>
        <button style={ag.ghost} className="ag-hover" onClick={abrirConfigurarAgente}>
          <window.IC.robot size={14} stroke={AG.text.secondary} /> Configurar agente
        </button>
        <button style={ag.ghost} className="ag-hover" onClick={() => setFlowOpen(true)} title="Assistente de onboarding (reconectar número via QR)">
          <window.IC.settings size={14} stroke={AG.text.secondary} /> Reconectar
        </button>
      </div>

      {/* Abas */}
      <div style={ag.tabs}>
        {AG_TABS.map((t) => {
          const on = tab === t.id;
          const Ic = window.IC[t.icon] || window.IC.zap;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ ...ag.tab, ...(on ? ag.tabOn : {}) }}>
              <Ic size={14} stroke={on ? AG.brand.primary : AG.text.muted} /> {t.label}
              {on && <span style={ag.tabBar} />}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div style={ag.body}>
        {tab === 'conversas' && <ConversasTab agente={agente} paused={paused} />}
        {tab === 'config' && <Placeholder icon="settings" titulo="Configuração do agente"
          texto="Identidade, tom, instruções, capacidades e serviços vinculados." cta="Configurar agente" onCta={abrirConfigurarAgente} />}
        {tab === 'conhecimento' && <Placeholder icon="fileText" titulo="Conhecimento e treinamento"
          texto="Arquivos e exemplos de conversa que o agente usa como base." />}
        {tab === 'historico' && <Placeholder icon="doc" titulo="Histórico de notas"
          texto="NFS-e emitidas por este agente, com status e PDF." />}
      </div>

      {flowOpen && window.MegusWhatsAppFlow && <window.MegusWhatsAppFlow onClose={() => setFlowOpen(false)} />}
      {personaOpen && window.MegusAtendenteModal && (
        <window.MegusAtendenteModal
          initial={personaInitial}
          onClose={() => setPersonaOpen(false)}
          onSaved={() => setPersonaOpen(false)}
        />
      )}
    </div>
  );
}
window.MegusAgentePage = MegusAgentePage;

// ── Aba Conversas (split lista + chat) ────────────────────
function ConversasTab({ agente, paused }) {
  const [convs, setConvs] = useStAg(null);
  const [selId, setSelId] = useStAg(null);
  const [msgs, setMsgs] = useStAg(null);
  const [busca, setBusca] = useStAg('');
  const [assumidas, setAssumidas] = useStAg({});

  useEffAg(() => {
    let alive = true;
    window.MegusConversas.listConversas(agente.id).then((r) => {
      if (!alive || !r.success) return;
      setConvs(r.data);
      setSelId((cur) => cur || (r.data[0] && r.data[0].id));
    });
    return () => { alive = false; };
  }, [agente.id]);

  useEffAg(() => {
    if (!selId) return;
    setMsgs(null);
    let alive = true;
    window.MegusConversas.getMensagens(selId).then((r) => { if (alive && r.success) setMsgs(r.data); });
    return () => { alive = false; };
  }, [selId]);

  const lista = convs || [];
  const filtrados = lista.filter((c) => {
    const q = busca.trim().toLowerCase();
    return !q || [c.nome, c.telefone].some((x) => (x || '').toLowerCase().includes(q));
  });
  const sel = lista.find((c) => c.id === selId);
  const statusAtual = (c) => assumidas[c.id] ? 'HUMANO' : c.status;

  return (
    <div style={ag.split}>
      {/* Lista (master) */}
      <div style={ag.list}>
        <div style={ag.listHead}>
          <span style={ag.listTitle}>Conversas <span style={{ color: AG.text.subtle, fontWeight: 600 }}>· {lista.length}</span></span>
          <span style={ag.searchWrap}>
            <span style={{ position: 'absolute', left: 11, display: 'flex' }}><window.IC.search size={14} stroke={AG.text.subtle} /></span>
            <input style={ag.search} placeholder="Buscar conversa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </span>
        </div>
        <div style={ag.listScroll}>
          {convs === null && <div style={ag.listMsg}>Carregando…</div>}
          {convs !== null && filtrados.length === 0 && <div style={ag.listMsg}>Nenhuma conversa.</div>}
          {filtrados.map((c) => {
            const on = c.id === selId;
            const tg = CONV_TAG[statusAtual(c)] || CONV_TAG.BOT;
            return (
              <button key={c.id} className="ag-conv" style={{ ...ag.conv, ...(on ? ag.convOn : {}) }} onClick={() => setSelId(c.id)}>
                {on && <span style={ag.convBar} />}
                <span style={ag.convAvatar}>{c.nome.charAt(0)}</span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={ag.convTop}>
                    <span style={ag.convName}>{c.nome}</span>
                    <span style={ag.convTime}>{c.hora}</span>
                  </span>
                  <span style={ag.convLast}>{c.ultima}</span>
                  <span style={{ ...ag.convTag, color: tg.fg, background: tg.bg }}>{tg.label}</span>
                </span>
                {c.naoLidas > 0 && <span style={ag.unread}>{c.naoLidas}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat (detail) */}
      <div style={ag.chat}>
        {!sel ? (
          <div style={ag.chatEmpty}><window.IC.chat size={26} stroke={AG.text.subtle} /><span>Selecione uma conversa à esquerda.</span></div>
        ) : (
          <React.Fragment>
            <div style={ag.chatHead}>
              <span style={ag.convAvatar}>{sel.nome.charAt(0)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={ag.chatName}>{sel.nome}</div>
                <div style={ag.chatPhone}>{sel.telefone}</div>
              </div>
              {(() => { const tg = CONV_TAG[statusAtual(sel)] || CONV_TAG.BOT; return <span style={{ ...ag.badge, color: tg.fg, background: tg.bg, marginLeft: 'auto' }}>{tg.label}</span>; })()}
            </div>

            <div style={ag.msgs}>
              {msgs === null && <div style={ag.listMsg}>Carregando mensagens…</div>}
              {(msgs || []).map((m) => <Bubble key={m.id} m={m} />)}
            </div>

            <div style={ag.chatFoot}>
              <span style={ag.monitor}><window.IC.eye size={14} stroke={AG.text.muted} /> Modo monitoramento — somente leitura{paused ? ' · agente pausado' : ''}</span>
              <button
                style={{ ...ag.assumir, ...(statusAtual(sel) === 'HUMANO' ? ag.assumirOff : {}) }}
                disabled={statusAtual(sel) === 'HUMANO'}
                onClick={() => setAssumidas((m) => ({ ...m, [sel.id]: true }))}>
                <window.IC.headset size={14} stroke="#fff" /> {statusAtual(sel) === 'HUMANO' ? 'Conversa assumida' : 'Assumir conversa'}
              </button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }) {
  const mine = m.autor === 'bot' || m.autor === 'humano';
  const isHuman = m.autor === 'humano';
  const tone = isHuman
    ? { background: '#EAF0F7', label: 'Recepção' }
    : mine ? { background: AG.status.successBg, label: null } : { background: '#fff', label: null };
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...ag.bubble, background: tone.background, border: mine ? 'none' : `1px solid ${AG.surface.border}`, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4 }}>
        {tone.label && <div style={ag.bubbleAuthor}>{tone.label}</div>}
        {m.attach ? <Attach a={m.attach} /> : null}
        {m.texto ? <div style={ag.bubbleText}>{m.texto}</div> : null}
        <div style={ag.bubbleTime}>{m.hora}</div>
      </div>
    </div>
  );
}

function Attach({ a }) {
  if (a.type === 'image') {
    return (
      <div style={ag.attImg}>
        <div style={ag.attImgThumb}><window.IC.layout size={22} stroke={AG.text.subtle} /></div>
        <span style={ag.attName}>{a.name}</span>
      </div>
    );
  }
  return (
    <div style={ag.attFile}>
      <span style={ag.attFileIcon}><window.IC.fileText size={18} stroke={AG.status.danger} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={ag.attName}>{a.name}</span>
        <span style={ag.attMeta}>PDF · toque para abrir</span>
      </span>
    </div>
  );
}

function Placeholder({ icon, titulo, texto, cta, onCta }) {
  const Ic = window.IC[icon] || window.IC.layout;
  return (
    <div style={ag.ph}>
      <span style={ag.phIcon}><Ic size={26} stroke={AG.brand.primary} /></span>
      <div style={ag.phTitle}>{titulo}</div>
      <div style={ag.phText}>{texto}</div>
      {cta && <button style={ag.phCta} onClick={onCta}>{cta}</button>}
      <div style={ag.phSoon}>Em construção neste wireframe</div>
    </div>
  );
}

const ag = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: AG.font.sans, background: AG.surface.page },
  header: { display: 'flex', alignItems: 'center', gap: 13, padding: '16px 24px', background: '#fff', borderBottom: `1px solid ${AG.surface.border}`, flexShrink: 0 },
  back: { width: 38, height: 38, borderRadius: AG.radius.md, border: `1px solid ${AG.surface.border}`, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 44, height: 44, borderRadius: 12, background: `linear-gradient(150deg, ${AG.brand.primaryLight}, ${AG.brand.primaryDarker})`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700 },
  avatarDot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 99, border: '2.5px solid #fff' },
  name: { fontFamily: AG.font.brand, fontSize: 18, fontWeight: 800, color: AG.text.primary, letterSpacing: '-0.01em' },
  role: { fontSize: 12.5, color: AG.text.muted, marginTop: 1 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, flexShrink: 0 },
  ghost: { height: 38, padding: '0 14px', borderRadius: AG.radius.md, border: `1px solid ${AG.surface.borderStrong}`, background: '#fff', color: AG.text.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: AG.font.sans, flexShrink: 0 },

  tabs: { display: 'flex', gap: 4, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${AG.surface.border}`, flexShrink: 0 },
  tab: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: AG.text.muted, fontFamily: AG.font.sans },
  tabOn: { color: AG.brand.primary },
  tabBar: { position: 'absolute', left: 8, right: 8, bottom: -1, height: 2.5, borderRadius: 2, background: AG.brand.primary },

  body: { flex: 1, minHeight: 0, display: 'flex' },

  // split
  split: { flex: 1, display: 'flex', minHeight: 0, width: '100%' },
  list: { width: 330, flexShrink: 0, background: '#fff', borderRight: `1px solid ${AG.surface.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 },
  listHead: { padding: '14px 16px', borderBottom: `1px solid ${AG.surface.divider}`, display: 'flex', flexDirection: 'column', gap: 11, flexShrink: 0 },
  listTitle: { fontSize: 13, fontWeight: 800, color: AG.text.secondary, letterSpacing: '.02em' },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  search: { width: '100%', height: 36, padding: '0 12px 0 34px', fontSize: 13, border: `1px solid ${AG.surface.border}`, borderRadius: AG.radius.md, outline: 'none', background: AG.surface.cardMuted, fontFamily: AG.font.sans, color: AG.text.primary },
  listScroll: { flex: 1, overflow: 'auto', minHeight: 0 },
  listMsg: { padding: '24px 16px', textAlign: 'center', fontSize: 13, color: AG.text.muted },
  conv: { position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 16px', border: 'none', borderBottom: `1px solid ${AG.surface.divider}`, background: '#fff', cursor: 'pointer', fontFamily: AG.font.sans },
  convOn: { background: AG.surface.cardMuted },
  convBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: '0 2px 2px 0', background: AG.brand.primary },
  convAvatar: { width: 38, height: 38, borderRadius: 99, flexShrink: 0, background: AG.surface.page, border: `1px solid ${AG.surface.border}`, color: AG.brand.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 },
  convTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  convName: { fontSize: 13.5, fontWeight: 700, color: AG.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convTime: { fontSize: 11, color: AG.text.subtle, flexShrink: 0 },
  convLast: { display: 'block', fontSize: 12, color: AG.text.muted, margin: '3px 0 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convTag: { display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', padding: '2px 7px', borderRadius: 5 },
  unread: { alignSelf: 'center', minWidth: 19, height: 19, borderRadius: 99, background: AG.status.success, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 },

  // chat
  chat: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: AG.surface.page },
  chatEmpty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: AG.text.muted, fontSize: 14 },
  chatHead: { display: 'flex', alignItems: 'center', gap: 11, padding: '13px 20px', background: '#fff', borderBottom: `1px solid ${AG.surface.border}`, flexShrink: 0 },
  chatName: { fontSize: 14.5, fontWeight: 700, color: AG.text.primary },
  chatPhone: { fontSize: 12, color: AG.text.muted, fontFamily: AG.font.mono, marginTop: 1 },
  msgs: { flex: 1, overflow: 'auto', minHeight: 0, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 11 },
  bubble: { maxWidth: '70%', padding: '9px 13px', borderRadius: 14, boxShadow: AG.shadow.sm },
  bubbleAuthor: { fontSize: 10.5, fontWeight: 800, color: AG.brand.primary, marginBottom: 3 },
  bubbleText: { fontSize: 13.5, lineHeight: 1.5, color: AG.text.primary, whiteSpace: 'pre-wrap' },
  bubbleTime: { fontSize: 10, color: AG.text.subtle, textAlign: 'right', marginTop: 4 },
  attImg: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 },
  attImgThumb: { width: 150, height: 100, borderRadius: 10, background: `repeating-linear-gradient(135deg, ${AG.surface.page}, ${AG.surface.page} 8px, ${AG.surface.cardMuted} 8px, ${AG.surface.cardMuted} 16px)`, border: `1px solid ${AG.surface.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  attFile: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: '#fff', border: `1px solid ${AG.surface.border}`, marginBottom: 4, minWidth: 200 },
  attFileIcon: { width: 34, height: 34, borderRadius: 8, background: AG.status.dangerBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  attName: { display: 'block', fontSize: 12.5, fontWeight: 700, color: AG.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  attMeta: { display: 'block', fontSize: 10.5, color: AG.text.muted, marginTop: 1 },
  chatFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 20px', background: '#fff', borderTop: `1px solid ${AG.surface.border}`, flexShrink: 0 },
  monitor: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: AG.text.muted },
  assumir: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: AG.radius.md, border: 'none', background: `linear-gradient(150deg, ${AG.brand.primaryLight}, ${AG.brand.primaryDark})`, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: AG.font.sans, boxShadow: '0 4px 14px rgba(27,35,48,.22)' },
  assumirOff: { background: AG.surface.divider, color: AG.text.muted, boxShadow: 'none', cursor: 'default' },

  // placeholders
  ph: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: 40 },
  phIcon: { width: 56, height: 56, borderRadius: 16, background: `${AG.brand.primary}10`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  phTitle: { fontFamily: AG.font.brand, fontSize: 18, fontWeight: 800, color: AG.text.primary },
  phText: { fontSize: 13.5, color: AG.text.muted, maxWidth: 360, lineHeight: 1.5 },
  phCta: { marginTop: 8, height: 42, padding: '0 18px', borderRadius: AG.radius.md, border: 'none', background: `linear-gradient(150deg, ${AG.brand.primaryLight}, ${AG.brand.primaryDark})`, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: AG.font.sans },
  phSoon: { fontSize: 11.5, color: AG.text.subtle, marginTop: 4 },
};

if (typeof document !== 'undefined' && !document.getElementById('megus-ag-css')) {
  const s = document.createElement('style');
  s.id = 'megus-ag-css';
  s.textContent = '.ag-hover{transition:background .14s}.ag-hover:hover{background:' + AG.surface.cardMuted + '}.ag-conv:hover{background:' + AG.surface.cardMuted + '}';
  document.head.appendChild(s);
}
