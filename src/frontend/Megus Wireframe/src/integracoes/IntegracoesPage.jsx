/* global React */
// MegusIntegracoesPage · landing pós-login (dentro do shell). Lista os
// conectores; o card WhatsApp abre o fluxo (MegusWhatsAppFlow). Espelha uma
// IntegracoesPage de referência interna, enxuta para o Megus.

const IT = window.MegusTokens;
const { useState: useStInt } = React;
const WA_IT = IT.status.whatsapp;

const CONECTORES = [
  { id: 'whatsapp', nome: 'WhatsApp', icon: 'chat', cor: WA_IT, status: 'conectar',
    desc: 'Atendente virtual (Kaua) que conversa, valida dados, confere o pagamento e emite a nota.', wired: true },
  { id: 'erp', nome: 'ERP / Provedor fiscal', icon: 'layers', cor: IT.brand.accent, status: 'em breve',
    desc: 'Conecte o backend fiscal (um ERP externo) para a emissão real das notas.', wired: false },
];

function MegusIntegracoesPage() {
  const [flowOpen, setFlowOpen] = useStInt(false);
  return (
    <div style={it.page}>
      <div style={it.wrap}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={it.title}>Integrações</h1>
            <span style={it.badge}>Partner Connections</span>
          </div>
          <p style={it.subtitle}>Conecte o WhatsApp e os provedores que o atendente virtual usa para operar.</p>
        </header>

        <div style={it.grid}>
          {CONECTORES.map((c) => {
            const Ic = window.IC[c.icon] || window.IC.zap;
            return (
              <div key={c.id} style={it.card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
                  <span style={{ ...it.cardIcon, background: `${c.cor}14` }}><Ic size={24} stroke={c.cor} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={it.cardNome}>{c.nome}</span>
                      {c.wired
                        ? <span style={it.tagDisc}>Desconectado</span>
                        : <span style={it.tagSoon}>Em breve</span>}
                    </div>
                    <p style={it.cardDesc}>{c.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => c.wired && setFlowOpen(true)}
                  disabled={!c.wired}
                  style={{ ...it.cardBtn, ...(c.wired ? { background: c.cor, color: '#fff', boxShadow: `0 4px 14px ${c.cor}44` } : it.cardBtnOff) }}>
                  {c.wired ? <React.Fragment><window.IC.zap size={15} stroke="#fff" /> Gerenciar</React.Fragment> : 'Indisponível'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {flowOpen && <window.MegusWhatsAppFlow onClose={() => setFlowOpen(false)} />}
    </div>
  );
}
window.MegusIntegracoesPage = MegusIntegracoesPage;

const it = {
  page: { padding: '32px 28px', minHeight: '100%' },
  wrap: { maxWidth: 1100, margin: '0 auto' },
  title: { fontFamily: IT.font.brand, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: IT.text.primary },
  badge: { fontSize: 11, fontWeight: 700, color: IT.brand.accent, background: `${IT.brand.accent}14`, padding: '3px 10px', borderRadius: 999, letterSpacing: '.03em' },
  subtitle: { fontSize: 14.5, color: IT.text.muted, marginTop: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
  card: { background: '#fff', border: `1px solid ${IT.surface.border}`, borderRadius: IT.radius.lg, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18, boxShadow: IT.shadow.sm },
  cardIcon: { width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  cardNome: { fontSize: 16, fontWeight: 700, color: IT.text.primary, letterSpacing: '-0.01em' },
  cardDesc: { fontSize: 13, color: IT.text.muted, lineHeight: 1.5, margin: '6px 0 0' },
  cardBtn: { height: 42, border: 'none', borderRadius: IT.radius.md, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: IT.font.sans },
  cardBtnOff: { background: IT.surface.divider, color: IT.text.subtle, cursor: 'not-allowed' },
  tagDisc: { fontSize: 10, fontWeight: 700, color: IT.text.muted, background: IT.surface.divider, padding: '2px 8px', borderRadius: 99, letterSpacing: '.03em' },
  tagSoon: { fontSize: 10, fontWeight: 700, color: IT.status.warning, background: IT.status.warningBg, padding: '2px 8px', borderRadius: 99, letterSpacing: '.03em' },
};
