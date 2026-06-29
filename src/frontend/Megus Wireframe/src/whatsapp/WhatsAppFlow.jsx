/* global React */
// MegusWhatsAppFlow · orquestra o fluxo da integração WhatsApp.
//   'options' → modal de formas de uso (Atendente Virtual ativo + futuras)
//   'agent'   → window.MegusAtendenteModal (configuração)
//   'qr'      → window.MegusWhatsAppQr (conexão do número)
// Uso: {open && <window.MegusWhatsAppFlow onClose={() => setOpen(false)} />}

const FT = window.MegusTokens;
const { useState: useStWf, useEffect: useEffWf } = React;
const WA_WF = FT.status.whatsapp;

const WA_OPCOES = [
  { id: 'agent', icon: 'robot', available: true, nome: 'Atendente Virtual', tag: 'Recomendado',
    desc: 'Um agente de IA que conversa com os clientes 24/7, coleta e valida os dados, confere o comprovante de pagamento e emite a nota fiscal — acionando um humano quando precisa.' },
  { id: 'broadcast', icon: 'megaphone', available: false, nome: 'Disparos em massa',
    desc: 'Envie notas, lembretes e cobranças para listas de clientes a partir do painel.' },
  { id: 'autoreply', icon: 'chat', available: false, nome: 'Respostas automáticas',
    desc: 'Mensagens por palavra-chave e horário de atendimento, sem IA.' },
  { id: 'human', icon: 'headset', available: false, nome: 'Atendimento humano',
    desc: 'Caixa compartilhada para a equipe responder manualmente, com histórico do cliente.' },
];

function WaOptionsModal({ onClose, onPick }) {
  const [expanded, setExpanded] = useStWf('agent');
  useEffWf(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <React.Fragment>
      <div onClick={onClose} style={wf.overlay} />
      <div style={wf.shell} role="dialog" aria-modal="true">
        <div style={wf.header}>
          <span style={wf.waLogo}><window.IC.chat size={24} stroke={WA_WF} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={wf.crumb}>Integrações <span style={{ opacity: 0.5 }}>›</span> WhatsApp</div>
            <h2 style={wf.title}>Como você quer usar o WhatsApp?</h2>
            <p style={wf.subtitle}>Escolha um modo para começar. Você pode ativar mais de um depois.</p>
          </div>
          <button onClick={onClose} style={wf.closeBtn} title="Fechar (Esc)"><window.IC.x size={16} stroke={FT.text.muted} /></button>
        </div>
        <div style={wf.body}>
          {WA_OPCOES.map((o) => {
            const ON = o.available, open = expanded === o.id;
            const Ic = window.IC[o.icon] || window.IC.zap;
            return (
              <div key={o.id} style={{ ...wf.optCard, borderColor: open && ON ? WA_WF + '66' : FT.surface.border, background: ON ? '#fff' : FT.surface.cardMuted, boxShadow: open && ON ? `0 4px 16px ${WA_WF}1f` : 'none' }}>
                <button onClick={() => setExpanded(open ? null : o.id)} style={wf.optHead}>
                  <span style={{ ...wf.optIcon, background: ON ? WA_WF + '14' : FT.surface.divider }}>
                    <Ic size={21} stroke={ON ? WA_WF : FT.text.subtle} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: ON ? FT.text.primary : FT.text.muted, letterSpacing: '-0.01em' }}>{o.nome}</span>
                      {o.tag && ON ? <span style={wf.recTag}>{o.tag}</span> : null}
                      {!ON ? <span style={wf.soonTag}>Em breve</span> : null}
                    </span>
                  </span>
                  <window.IC.chevron size={17} stroke={ON ? WA_WF : FT.text.subtle} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
                </button>
                {open && (
                  <div style={wf.optBody}>
                    <p style={{ fontSize: 12.5, color: FT.text.secondary, margin: 0, lineHeight: 1.5 }}>{o.desc}</p>
                    {ON ? (
                      <button onClick={() => onPick(o.id)} style={wf.optCta}>
                        <Ic size={15} stroke="#fff" /> Configurar {o.nome.toLowerCase()} <window.IC.chevronR size={15} stroke="#fff" />
                      </button>
                    ) : (
                      <div style={wf.soonNote}><window.IC.clock size={13} stroke={FT.text.subtle} /> Disponível em breve — avisaremos quando liberar.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </React.Fragment>
  );
}

function MegusWhatsAppFlow({ onClose }) {
  const [step, setStep] = useStWf('options');
  const [agent, setAgent] = useStWf(null);
  return (
    <React.Fragment>
      {step === 'options' && <WaOptionsModal onClose={onClose} onPick={(id) => { if (id === 'agent') setStep('agent'); }} />}
      {step === 'agent' && <window.MegusAtendenteModal onClose={onClose} onSaved={(cfg) => { setAgent(cfg); setStep('qr'); }} />}
      {step === 'qr' && <window.MegusWhatsAppQr agentName={agent ? agent.nome : 'Kaua'} onClose={onClose} onDone={onClose} />}
    </React.Fragment>
  );
}
window.MegusWhatsAppFlow = MegusWhatsAppFlow;

const wf = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(27,35,48,.45)', zIndex: 290 },
  shell: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(620px, 95vw)', maxHeight: '92vh', zIndex: 291, background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(27,35,48,.30)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FT.font.sans, animation: 'megusPop .24s cubic-bezier(.2,.7,.3,1)' },
  header: { padding: '16px 18px', borderBottom: `1px solid ${FT.surface.border}`, flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 13, background: `linear-gradient(90deg, ${WA_WF}12, #fff 60%)` },
  waLogo: { width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: '#fff', border: `1px solid ${FT.surface.border}`, boxShadow: '0 2px 8px rgba(27,35,48,.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  crumb: { fontSize: 11, fontWeight: 600, color: FT.text.muted, letterSpacing: '.03em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 },
  title: { fontFamily: FT.font.brand, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: FT.text.primary },
  subtitle: { fontSize: 12.5, color: FT.text.muted, margin: '4px 0 0', lineHeight: 1.45 },
  closeBtn: { width: 32, height: 32, padding: 0, background: FT.surface.page, border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body: { padding: '16px 18px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 11 },
  optCard: { borderRadius: 13, border: `1px solid ${FT.surface.border}`, transition: 'all .15s', width: '100%', overflow: 'hidden' },
  optHead: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 15px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FT.font.sans },
  optIcon: { width: 44, height: 44, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  optBody: { padding: '0 15px 15px 73px' },
  optCta: { marginTop: 12, padding: '9px 15px', fontSize: 12.5, fontWeight: 700, fontFamily: FT.font.sans, cursor: 'pointer', borderRadius: 9, border: 'none', background: WA_WF, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: `0 4px 14px ${WA_WF}44` },
  soonNote: { marginTop: 11, fontSize: 11.5, color: FT.text.muted, display: 'inline-flex', alignItems: 'center', gap: 6, background: FT.surface.divider, padding: '7px 11px', borderRadius: 8 },
  recTag: { fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99, background: WA_WF + '16', color: WA_WF },
  soonTag: { fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99, background: FT.surface.divider, color: FT.text.muted },
};
