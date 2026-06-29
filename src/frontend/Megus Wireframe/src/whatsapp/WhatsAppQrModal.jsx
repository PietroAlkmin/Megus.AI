/* global React */
// MegusWhatsAppQr · conexão do número de produção via QR Code.
// Abre depois de salvar o Atendente Virtual. QR (mock determinístico), passo a
// passo e aviso forte sobre usar o número definitivo. Espelha WhatsAppQrModal
// do Kapty, com tokens Megus.

const QT = window.MegusTokens;
const { useState: useStQr, useEffect: useEffQr } = React;
const WA = QT.status.whatsapp;

function qrMatrix() {
  const N = 25;
  const local = (r, c, br, bc) => {
    const lr = r - br, lc = c - bc;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };
  let seed = 7331;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const inTL = r < 7 && c < 7, inTR = r < 7 && c >= N - 7, inBL = r >= N - 7 && c < 7;
    if (inTL) cells.push(local(r, c, 0, 0));
    else if (inTR) cells.push(local(r, c, 0, N - 7));
    else if (inBL) cells.push(local(r, c, N - 7, 0));
    else if ((r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8)) cells.push(false);
    else cells.push(rnd() > 0.52);
  }
  return { N, cells };
}

const QR_STEPS = [
  'Abra o WhatsApp no celular que será usado no atendimento',
  'Toque em Mais opções › Aparelhos conectados',
  'Toque em Conectar um aparelho e aponte a câmera para este código',
];

function MegusWhatsAppQr({ onClose, onDone, agentName = 'Kaua' }) {
  const [m] = useStQr(qrMatrix);
  const [connected, setConnected] = useStQr(false);
  const cell = 7;

  useEffQr(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Mock: simula o pareamento (em produção, polling do status na Evolution).
  useEffQr(() => {
    if (connected) return undefined;
    const t = setTimeout(() => setConnected(true), 5500);
    return () => clearTimeout(t);
  }, [connected]);

  return (
    <React.Fragment>
      <div onClick={onClose} style={qr.overlay} />
      <div style={qr.shell} role="dialog" aria-modal="true">
        <div style={qr.header}>
          <span style={qr.waLogo}><window.IC.chat size={22} stroke={WA} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={qr.crumb}>WhatsApp <span style={{ opacity: 0.5 }}>›</span> Conexão</div>
            <h2 style={qr.title}>Conectar número do WhatsApp</h2>
          </div>
          <button onClick={onClose} style={qr.closeBtn} title="Fechar (Esc)"><window.IC.x size={16} stroke={QT.text.muted} /></button>
        </div>

        <div style={qr.body}>
          <div style={qr.left}>
            <div style={qr.frame}>
              {connected ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
                  <span style={qr.successRing}><window.IC.check size={30} stroke="#fff" sw={3} /></span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: QT.text.primary, marginTop: 12 }}>Conectado!</div>
                  <div style={{ fontSize: 11.5, color: QT.text.muted, marginTop: 3, textAlign: 'center' }}>{agentName} já está ativo neste número.</div>
                </div>
              ) : (
                <React.Fragment>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${m.N}, ${cell}px)`, gridTemplateRows: `repeat(${m.N}, ${cell}px)` }}>
                    {m.cells.map((on, i) => (<span key={i} style={{ width: cell, height: cell, background: on ? '#101A26' : 'transparent' }} />))}
                  </div>
                  <span style={qr.centerLogo}><window.IC.robot size={22} stroke={QT.brand.primary} /></span>
                </React.Fragment>
              )}
            </div>
            <div style={qr.status}>
              {connected
                ? <React.Fragment><span style={{ ...qr.dot, background: WA }} /> Pareado com sucesso</React.Fragment>
                : <React.Fragment><span style={{ ...qr.dot, background: '#E0A11E', animation: 'megusQrPulse 1.4s ease-in-out infinite' }} /> Aguardando leitura…</React.Fragment>}
            </div>
          </div>

          <div style={qr.right}>
            <div style={{ fontSize: 13, fontWeight: 800, color: QT.text.primary, marginBottom: 12, fontFamily: QT.font.brand }}>Como conectar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              {QR_STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span style={qr.stepNum}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, color: QT.text.secondary, lineHeight: 1.45, paddingTop: 2 }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={qr.warn}>
              <span style={qr.warnIcon}><window.IC.alert size={15} stroke={QT.status.warning} /></span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: QT.status.warning, marginBottom: 3 }}>Use o número definitivo</div>
                <div style={{ fontSize: 11.5, color: '#9A5B12', lineHeight: 1.5 }}>
                  Conecte o <strong>chip que ficará em produção</strong>. Esse número fica vinculado ao agente — trocar depois exige reconectar e pode interromper conversas em andamento.
                </div>
              </div>
            </div>
            <div style={qr.tip}><window.IC.phone size={13} stroke={QT.text.muted} /><span>Dica: prefira um número exclusivo (WhatsApp Business), não o pessoal da equipe.</span></div>
          </div>
        </div>

        <div style={qr.footer}>
          <span style={{ fontSize: 11.5, color: QT.text.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <window.IC.refresh size={13} stroke={QT.text.subtle} /> O código expira em 60s e é renovado automaticamente.
          </span>
          <div style={{ flex: 1 }} />
          {connected
            ? <button onClick={() => (onDone || onClose)()} style={qr.primaryBtn}><window.IC.check size={15} stroke="#fff" sw={2.5} /> Concluir</button>
            : <button onClick={onClose} style={qr.cancelBtn}>Conectar depois</button>}
        </div>
      </div>
    </React.Fragment>
  );
}
window.MegusWhatsAppQr = MegusWhatsAppQr;

const qr = {
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
  centerLogo: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 38, height: 38, borderRadius: 10, background: '#fff', border: '3px solid #fff', boxShadow: `0 0 0 1px ${QT.surface.borderStrong}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
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
  s.textContent = '@keyframes megusPop{from{transform:translate(-50%,-46%);opacity:.6}to{transform:translate(-50%,-50%);opacity:1}}@keyframes megusQrPulse{0%,100%{opacity:1}50%{opacity:.3}}';
  document.head.appendChild(s);
}
