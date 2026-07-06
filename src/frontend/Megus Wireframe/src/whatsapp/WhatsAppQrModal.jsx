/* global React */
// MegusWhatsAppQr · conexão do número de produção via QR Code.
// Abre depois de salvar o Atendente Virtual. QR REAL (Evolution API via
// window.MegusWhatsApp), passo a passo e aviso forte sobre usar o número
// definitivo. Espelha WhatsAppQrModal do Kapty, com tokens Megus.

const QT = window.MegusTokens;
const { useState: useStQr, useEffect: useEffQr, useCallback: useCbQr } = React;
const WA = QT.status.whatsapp;

const QR_STEPS = [
  'Abra o WhatsApp no celular que será usado no atendimento',
  'Toque em Mais opções › Aparelhos conectados',
  'Toque em Conectar um aparelho e aponte a câmera para este código',
];

function MegusWhatsAppQr({ onClose, onDone, agentName = 'Kaua' }) {
  const [qr, setQr] = useStQr(null); // base64/data-url devolvido pelo backend
  const [error, setError] = useStQr(null);
  const [connected, setConnected] = useStQr(false);
  const [number, setNumber] = useStQr(null);

  useEffQr(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cria a instância + pede o QR (POST /api/agente/whatsapp/connect).
  const carregarQr = useCbQr(async () => {
    setError(null);
    try {
      const r = await window.MegusWhatsApp.conectar();
      if (r && r.success && r.data && r.data.qr) {
        setQr(r.data.qr);
      } else {
        setError((r && r.message) || 'Não foi possível gerar a conexão com o WhatsApp.');
      }
    } catch (e) {
      setError('Não foi possível conectar ao servidor.');
    }
  }, []);
  useEffQr(() => { carregarQr(); }, [carregarQr]);

  // Polling do pareamento (GET /api/agente/whatsapp/status) a cada 3s até conectar.
  useEffQr(() => {
    if (connected) return undefined;
    const t = setInterval(async () => {
      try {
        const r = await window.MegusWhatsApp.status();
        if (r && r.success && r.data && r.data.connected) {
          setConnected(true);
          setNumber(r.data.number || null);
        }
      } catch (e) {
        // silencioso: tenta de novo no próximo tick
      }
    }, 3000);
    return () => clearInterval(t);
  }, [connected]);

  const qrSrc = qr ? (qr.startsWith('data:') ? qr : 'data:image/png;base64,' + qr) : null;

  return (
    <React.Fragment>
      <div onClick={onClose} style={qr_.overlay} />
      <div style={qr_.shell} role="dialog" aria-modal="true">
        <div style={qr_.header}>
          <span style={qr_.waLogo}><window.IC.chat size={22} stroke={WA} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={qr_.crumb}>WhatsApp <span style={{ opacity: 0.5 }}>›</span> Conexão</div>
            <h2 style={qr_.title}>Conectar número do WhatsApp</h2>
          </div>
          <button onClick={onClose} style={qr_.closeBtn} title="Fechar (Esc)"><window.IC.x size={16} stroke={QT.text.muted} /></button>
        </div>

        <div style={qr_.body}>
          <div style={qr_.left}>
            <div style={qr_.frame}>
              {connected ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
                  <span style={qr_.successRing}><window.IC.check size={30} stroke="#fff" sw={3} /></span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: QT.text.primary, marginTop: 12 }}>Conectado!</div>
                  <div style={{ fontSize: 11.5, color: QT.text.muted, marginTop: 3, textAlign: 'center' }}>
                    {number ? `${agentName} já está ativo no número ${number}.` : `${agentName} já está ativo neste número.`}
                  </div>
                </div>
              ) : error ? (
                <div style={qr_.frameMsg}>
                  <window.IC.alert size={24} stroke={QT.status.warning} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: QT.text.secondary, marginTop: 10, textAlign: 'center', padding: '0 12px' }}>{error}</div>
                  <button onClick={carregarQr} style={qr_.retryBtn}><window.IC.refresh size={13} stroke={QT.brand.primary} /> Tentar novamente</button>
                </div>
              ) : qrSrc ? (
                <img src={qrSrc} alt="QR Code para conectar o WhatsApp" style={qr_.qrImage} />
              ) : (
                <div style={qr_.frameMsg}>
                  <window.IC.refresh size={22} stroke={QT.text.subtle} style={{ animation: 'megusSpin 1s linear infinite' }} />
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: QT.text.muted, marginTop: 10 }}>Gerando conexão…</div>
                </div>
              )}
            </div>
            <div style={qr_.status}>
              {connected
                ? <React.Fragment><span style={{ ...qr_.dot, background: WA }} /> Pareado com sucesso</React.Fragment>
                : error
                ? <React.Fragment><span style={{ ...qr_.dot, background: QT.status.warning }} /> Falha ao gerar conexão</React.Fragment>
                : !qrSrc
                ? <React.Fragment><span style={{ ...qr_.dot, background: QT.text.subtle }} /> Preparando…</React.Fragment>
                : <React.Fragment><span style={{ ...qr_.dot, background: '#E0A11E', animation: 'megusQrPulse 1.4s ease-in-out infinite' }} /> Aguardando leitura…</React.Fragment>}
            </div>
          </div>

          <div style={qr_.right}>
            <div style={{ fontSize: 13, fontWeight: 800, color: QT.text.primary, marginBottom: 12, fontFamily: QT.font.brand }}>Como conectar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              {QR_STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span style={qr_.stepNum}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, color: QT.text.secondary, lineHeight: 1.45, paddingTop: 2 }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={qr_.warn}>
              <span style={qr_.warnIcon}><window.IC.alert size={15} stroke={QT.status.warning} /></span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: QT.status.warning, marginBottom: 3 }}>Use o número definitivo</div>
                <div style={{ fontSize: 11.5, color: '#9A5B12', lineHeight: 1.5 }}>
                  Conecte o <strong>chip que ficará em produção</strong>. Esse número fica vinculado ao agente — trocar depois exige reconectar e pode interromper conversas em andamento.
                </div>
              </div>
            </div>
            <div style={qr_.tip}><window.IC.phone size={13} stroke={QT.text.muted} /><span>Dica: prefira um número exclusivo (WhatsApp Business), não o pessoal da equipe.</span></div>
          </div>
        </div>

        <div style={qr_.footer}>
          <span style={{ fontSize: 11.5, color: QT.text.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <window.IC.refresh size={13} stroke={QT.text.subtle} /> O código expira em 60s e é renovado automaticamente.
          </span>
          <div style={{ flex: 1 }} />
          {connected
            ? <button onClick={() => (onDone || onClose)()} style={qr_.primaryBtn}><window.IC.check size={15} stroke="#fff" sw={2.5} /> Concluir</button>
            : <button onClick={onClose} style={qr_.cancelBtn}>Conectar depois</button>}
        </div>
      </div>
    </React.Fragment>
  );
}
window.MegusWhatsAppQr = MegusWhatsAppQr;

const qr_ = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(27,35,48,.45)', zIndex: 310 },
  shell: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(720px, 95vw)', maxHeight: '92vh', zIndex: 311, background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(27,35,48,.30)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: QT.font.sans, animation: 'megusPop .24s cubic-bezier(.2,.7,.3,1)' },
  header: { padding: '15px 18px', borderBottom: `1px solid ${QT.surface.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, background: `linear-gradient(90deg, ${WA}12, #fff 60%)` },
  waLogo: { width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: '#fff', border: `1px solid ${QT.surface.border}`, boxShadow: '0 2px 8px rgba(27,35,48,.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  crumb: { fontSize: 11, fontWeight: 600, color: QT.text.muted, letterSpacing: '.03em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 },
  title: { fontFamily: QT.font.brand, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: QT.text.primary },
  closeBtn: { width: 32, height: 32, padding: 0, background: QT.surface.page, border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  left: { width: 280, flexShrink: 0, padding: '24px 20px', borderRight: `1px solid ${QT.surface.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: QT.surface.cardMuted },
  frame: { position: 'relative', width: 200, height: 200, background: '#fff', borderRadius: 14, border: `1px solid ${QT.surface.borderStrong}`, boxShadow: '0 6px 20px rgba(27,35,48,.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qrImage: { width: 180, height: 180, objectFit: 'contain', borderRadius: 4 },
  frameMsg: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 18 },
  retryBtn: { marginTop: 12, padding: '7px 12px', fontSize: 11.5, fontWeight: 700, fontFamily: QT.font.sans, cursor: 'pointer', borderRadius: 8, border: `1px solid ${QT.surface.borderStrong}`, background: '#fff', color: QT.brand.primary, display: 'inline-flex', alignItems: 'center', gap: 6 },
  successRing: { width: 60, height: 60, borderRadius: 99, background: WA, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 18px ${WA}55` },
  status: { marginTop: 16, fontSize: 12, fontWeight: 700, color: QT.text.secondary, display: 'inline-flex', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 99, display: 'inline-block' },
  right: { flex: 1, minWidth: 0, padding: '22px', overflow: 'auto' },
  stepNum: { width: 22, height: 22, borderRadius: 99, flexShrink: 0, background: QT.brand.primary, color: '#fff', fontSize: 11, fontWeight: 800, fontFamily: QT.font.mono, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  warn: { display: 'flex', gap: 11, padding: '13px 14px', borderRadius: 12, background: QT.status.warningBg, border: '1px solid #F5D88A' },
  warnIcon: { width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: '#FCEFC8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  tip: { display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 11.5, color: QT.text.muted, lineHeight: 1.45 },
  footer: { padding: '13px 18px', borderTop: `1px solid ${QT.surface.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, background: '#fff' },
  cancelBtn: { padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: QT.font.sans, cursor: 'pointer', borderRadius: 9, border: `1px solid ${QT.surface.borderStrong}`, background: '#fff', color: QT.text.secondary },
  primaryBtn: { padding: '10px 18px', fontSize: 13, fontWeight: 700, fontFamily: QT.font.sans, cursor: 'pointer', borderRadius: 9, border: 'none', background: WA, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: `0 4px 14px ${WA}44` },
};

if (typeof document !== 'undefined' && !document.getElementById('megus-qr-anim')) {
  const s = document.createElement('style');
  s.id = 'megus-qr-anim';
  s.textContent = '@keyframes megusPop{from{transform:translate(-50%,-46%);opacity:.6}to{transform:translate(-50%,-50%);opacity:1}}@keyframes megusQrPulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes megusSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}
