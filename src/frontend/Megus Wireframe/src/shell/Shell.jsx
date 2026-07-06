/* global React */
// Megus · App Shell — TopBar + Sidebar + área de conteúdo.
// Mesma anatomia de um AdminLayout de referência interna (topbar fixa, sidebar de 72px com
// item ativo realçado), porém enxuta para o escopo do Megus (atendente de
// WhatsApp). Tudo lê de window.MegusTokens — vira AdminLayout.tsx + AppSidebar
// na produção shadcn.

const ST = window.MegusTokens;
const SIC = window.IC;

// Itens da sidebar. Só telas que existem no wireframe (sem placeholders).
const NAV_ITEMS = [
  { id: 'atendimentos', title: 'Atendimentos', icon: 'users', wired: true },
  { id: 'cobrancas',    title: 'Cobranças',    icon: 'wallet', wired: true },
  { id: 'integracoes',  title: 'Integrações',  icon: 'zap',   wired: true },
  { id: 'empresa',      title: 'Empresa',      icon: 'building', wired: true },
];

// ── TopBar ────────────────────────────────────────────────
// Dois clusters com papéis distintos:
//   ESQUERDA = contexto  → marca + seletor de empresa (workspace)
//   DIREITA  = você       → status do serviço + notificações + conta
function MegusTopBar({ company, user, status, onLogout, onMinhaConta }) {
  const [menu, setMenu] = React.useState(false);
  return (
    <header style={st.topbar}>
      {/* Esquerda — contexto / workspace */}
      <div style={st.cluster}>
        <window.MegusBrand size="md" />
        <span style={st.vDivider} />
        <button style={st.companyBtn} className="ms-hoverable" title="Trocar empresa">
          <span style={st.companyMark}>{company.initials}</span>
          <span style={st.stack} className="ms-hide-sm">
            <span style={st.companyName}>{company.name}</span>
            <span style={st.companyDoc}>{company.doc}</span>
          </span>
          <SIC.chevron size={14} stroke={ST.text.subtle} style={{ marginLeft: 1 }} />
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Direita — status + notificações + conta */}
      <div style={st.cluster}>
        <span style={st.statusPill} className="ms-hide-sm" title={`${status.count} agente(s) operando`}>
          <span style={st.statusDot} />
          <span><strong style={{ fontWeight: 700 }}>{status.count}</strong> operando</span>
        </span>

        <button style={st.iconBtn} className="ms-hoverable" title="Notificações">
          <SIC.bell size={19} stroke={ST.text.secondary} />
          <span style={st.badge}>2</span>
        </button>

        <span style={st.vDivider} />

        <div style={{ position: 'relative' }}>
          <button style={st.userChip} className="ms-hoverable" title="Sua conta" onClick={() => setMenu((v) => !v)}>
            <span style={st.avatar}>{user.name.charAt(0)}</span>
            <span style={st.stack} className="ms-hide-sm">
              <span style={st.userName}>{user.name}</span>
              <span style={st.userRole}>{user.role}</span>
            </span>
            <SIC.chevron size={14} stroke={ST.text.subtle} style={{ transform: menu ? 'rotate(180deg)' : 'none', transition: 'transform .16s' }} />
          </button>

          {menu && (
            <React.Fragment>
              <div style={st.menuScrim} onClick={() => setMenu(false)} />
              <div style={st.menu}>
                <div style={st.menuHead}>
                  <span style={st.avatar}>{user.name.charAt(0)}</span>
                  <span style={st.stack}>
                    <span style={st.userName}>{user.name}</span>
                    <span style={st.userRole}>{user.email || user.role}</span>
                  </span>
                </div>
                <button style={st.menuItem} className="ms-menuitem" onClick={() => { setMenu(false); onMinhaConta && onMinhaConta(); }}>
                  <SIC.settings size={15} stroke={ST.text.muted} /> Minha conta
                </button>
                <span style={st.menuSep} />
                <button style={{ ...st.menuItem, color: ST.status.danger }} className="ms-menuitem" onClick={() => { setMenu(false); onLogout && onLogout(); }}>
                  <SIC.arrow size={15} stroke={ST.status.danger} style={{ transform: 'rotate(180deg)' }} /> Sair
                </button>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Sidebar ───────────────────────────────────────────────
function MegusSidebar({ nav, onNav }) {
  return (
    <aside style={st.sidebar}>
      <nav style={{ flex: 1, padding: '10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV_ITEMS.map((item) => {
          const Ic = SIC[item.icon] || SIC.fileText;
          const active = nav === item.id;
          return (
            <button key={item.id} onClick={() => item.wired && onNav(item.id)}
              title={item.wired ? item.title : item.title + ' (em breve)'}
              style={{ ...st.navItem, cursor: item.wired ? 'pointer' : 'default' }}>
              {active && <span style={st.navActiveBar} />}
              <span style={{
                width: 40, height: 40, borderRadius: 9,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? ST.brand.primary : 'transparent',
                color: active ? '#fff' : (item.wired ? ST.text.subtle : '#C2CAD4'),
                boxShadow: active ? '0 4px 14px rgba(27,35,48,.30)' : 'none', transition: 'all .25s',
              }}><Ic size={20} sw={active ? 2.4 : 2} /></span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '-0.1px', color: active ? ST.brand.primary : (item.wired ? ST.text.muted : '#AEB6C2') }}>{item.title}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ── AdminLayout ───────────────────────────────────────────
function MegusShell({ children, nav = 'integracoes', onNav, onLogout, onMinhaConta, user, company }) {
  return (
    <div style={st.root}>
      <MegusTopBar
        company={company || { initials: 'CS', name: 'Clínica Sorriso', doc: '66.008.326/0001-73' }}
        user={user || { name: 'Pietro', role: 'Administrador', email: 'pietro@clinica.com.br' }}
        status={{ count: 2 }}
        onLogout={onLogout}
        onMinhaConta={onMinhaConta} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <MegusSidebar nav={nav} onNav={onNav || (() => {})} />
        <main style={st.main}>{children}</main>
      </div>
    </div>
  );
}
window.MegusShell = MegusShell;

const st = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden', background: ST.surface.page, fontFamily: ST.font.sans, color: ST.text.primary },
  topbar: { height: 68, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', background: '#fff', borderBottom: `1px solid ${ST.surface.border}`, flexShrink: 0, position: 'relative', zIndex: 30 },
  cluster: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  vDivider: { width: 1, height: 30, background: ST.surface.border, flexShrink: 0 },
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2, minWidth: 0 },

  // empresa (workspace)
  companyBtn: { display: 'flex', alignItems: 'center', gap: 9, padding: '5px 10px 5px 7px', height: 46, background: 'transparent', border: 'none', borderRadius: 10, cursor: 'pointer' },
  companyMark: { width: 30, height: 30, borderRadius: 8, border: `1px solid ${ST.surface.border}`, background: ST.surface.page, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, color: ST.brand.primary, flexShrink: 0 },
  companyName: { fontSize: 13.5, fontWeight: 700, color: ST.text.primary, whiteSpace: 'nowrap' },
  companyDoc: { fontSize: 10.5, color: ST.text.muted, fontFamily: ST.font.mono },

  // status do serviço
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 999, background: ST.status.successBg, color: ST.status.success, fontSize: 12.5, fontWeight: 600 },
  statusDot: { width: 7, height: 7, borderRadius: 99, background: '#1FA855', flexShrink: 0, animation: 'msPulse 1.8s ease-in-out infinite' },

  // notificações
  iconBtn: { position: 'relative', width: 40, height: 40, borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, borderRadius: 99, background: ST.status.danger, color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff' },

  // conta
  userChip: { display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px 4px 5px', height: 46, background: 'transparent', border: 'none', borderRadius: 10, cursor: 'pointer' },
  avatar: { width: 32, height: 32, borderRadius: 99, flexShrink: 0, background: `linear-gradient(150deg, ${ST.brand.primaryLight}, ${ST.brand.primaryDarker})`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 },
  userName: { fontSize: 13.5, fontWeight: 700, color: ST.text.primary, whiteSpace: 'nowrap' },
  userRole: { fontSize: 10.5, color: ST.text.muted },

  // menu da conta
  menuScrim: { position: 'fixed', inset: 0, zIndex: 40 },
  menu: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 41, width: 232, background: '#fff', border: `1px solid ${ST.surface.border}`, borderRadius: 12, boxShadow: ST.shadow.lg, padding: 6, overflow: 'hidden' },
  menuHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' },
  menuSep: { display: 'block', height: 1, background: ST.surface.divider, margin: '4px 0' },
  menuItem: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: ST.text.secondary, fontFamily: ST.font.sans, textAlign: 'left' },

  sidebar: { width: 72, background: '#F1F3F6', height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: `1px solid ${ST.surface.border}`, position: 'relative', zIndex: 10 },
  navItem: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 0', borderRadius: 8, border: 'none', background: 'transparent', position: 'relative' },
  navActiveBar: { position: 'absolute', left: 0, width: 3, height: 26, background: ST.brand.primary, borderRadius: '0 2px 2px 0' },
  main: { flex: 1, minWidth: 0, overflow: 'auto', background: ST.surface.page },
};

if (typeof document !== 'undefined' && !document.getElementById('megus-shell-css')) {
  const s = document.createElement('style');
  s.id = 'megus-shell-css';
  s.textContent =
    '.ms-hoverable{transition:background .14s}.ms-hoverable:hover{background:' + ST.surface.cardMuted + '}' +
    '.ms-menuitem{transition:background .12s}.ms-menuitem:hover{background:' + ST.surface.cardMuted + '}' +
    '@keyframes msPulse{0%,100%{box-shadow:0 0 0 0 rgba(31,168,85,.45)}50%{box-shadow:0 0 0 4px rgba(31,168,85,0)}}' +
    '@media (max-width:820px){.ms-hide-sm{display:none!important}}';
  document.head.appendChild(s);
}
