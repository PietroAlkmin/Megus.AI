/* global React */
// MegusEmpresaPage · ajustes da empresa: dados cadastrais, formas de cobrança
// e catálogo de serviços. Seções calmas em cards, largura contida. Padrão Megus:
// window.*, estilos `ep`, hooks sufixados, MegusTokens.
// Dados via window.MegusEmpresa (envelope ResultResponse).

const EP = window.MegusTokens;
const { useState: useStEp, useEffect: useEffEp } = React;

const PIX_TIPOS = [
  { id: 'cnpj', label: 'CNPJ' }, { id: 'cpf', label: 'CPF' },
  { id: 'email', label: 'E-mail' }, { id: 'telefone', label: 'Telefone' }, { id: 'aleatoria', label: 'Aleatória' },
];
const BRL = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

function MegusEmpresaPage() {
  const [emp, setEmp] = useStEp(null);
  const [servicos, setServicos] = useStEp(null);
  const [salvo, setSalvo] = useStEp(false);
  const [form, setForm] = useStEp(null); // serviço em edição/criação

  useEffEp(() => {
    window.MegusEmpresa.getEmpresa().then((r) => { if (r.success) setEmp(r.data); });
    window.MegusEmpresa.listServicos().then((r) => { if (r.success) setServicos(r.data); });
  }, []);

  const set = (k, v) => { setEmp((e) => ({ ...e, [k]: v })); setSalvo(false); };

  async function salvar() {
    await window.MegusEmpresa.salvarEmpresa(emp);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2600);
  }

  // serviços
  const novoServico = () => setForm({ code: '', nome: '', iss: '', preco: '', id: null });
  const editarServico = (s) => setForm({ ...s, preco: String(s.preco) });
  async function salvarServico() {
    if (!form.nome.trim()) return;
    const r = await window.MegusEmpresa.salvarServico({ ...form, preco: parseFloat(String(form.preco).replace(',', '.')) || 0 });
    if (r.success) {
      setServicos((ss) => form.id ? ss.map((x) => x.id === form.id ? r.data : x) : [...ss, r.data]);
      setForm(null);
    }
  }
  async function excluirServico(id) {
    await window.MegusEmpresa.excluirServico(id);
    setServicos((ss) => ss.filter((x) => x.id !== id));
  }

  if (!emp) return <div style={ep.loading}><window.IC.refresh size={18} stroke={EP.text.subtle} style={{ animation: 'megusSpin 1s linear infinite' }} /> Carregando…</div>;

  return (
    <div style={ep.page}>
      <div style={ep.wrap}>
        <header style={ep.head}>
          <div>
            <h1 style={ep.title}>Empresa</h1>
            <p style={ep.subtitle}>Dados da clínica, formas de cobrança e serviços usados nas notas.</p>
          </div>
        </header>

        {/* 1 · Dados da empresa */}
        <Section icon="building" titulo="Dados da empresa" desc="Aparecem como prestador na NFS-e.">
          <div style={ep.grid}>
            <Campo label="Razão social" value={emp.razaoSocial} onChange={(v) => set('razaoSocial', v)} span={2} />
            <Campo label="Nome fantasia" value={emp.nomeFantasia} onChange={(v) => set('nomeFantasia', v)} />
            <Campo label="CNPJ" value={emp.cnpj} onChange={(v) => set('cnpj', v)} mono />
            <Campo label="Inscrição municipal" value={emp.inscricaoMunicipal} onChange={(v) => set('inscricaoMunicipal', v)} mono />
            <Campo label="E-mail" value={emp.email} onChange={(v) => set('email', v)} />
            <Campo label="Telefone" value={emp.telefone} onChange={(v) => set('telefone', v)} mono />
            <Campo label="CEP" value={emp.cep} onChange={(v) => set('cep', v)} mono />
            <Campo label="Endereço" value={emp.endereco} onChange={(v) => set('endereco', v)} span={2} />
            <Campo label="Cidade" value={emp.cidade} onChange={(v) => set('cidade', v)} />
            <Campo label="UF" value={emp.uf} onChange={(v) => set('uf', v)} />
          </div>
        </Section>

        {/* 2 · Formas de cobrança */}
        <Section icon="pix" titulo="Formas de cobrança" desc="Chave que recebe os pagamentos e a mensagem que o Kaua envia ao cobrar.">
          <div style={ep.grid}>
            <div style={{ ...ep.field, gridColumn: 'span 1' }}>
              <span style={ep.label}>Tipo de chave Pix</span>
              <select value={emp.pixTipo} onChange={(e) => set('pixTipo', e.target.value)} style={ep.select}>
                {PIX_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <Campo label="Chave Pix" value={emp.pixChave} onChange={(v) => set('pixChave', v)} mono />
            <div style={{ ...ep.field, gridColumn: 'span 2' }}>
              <span style={ep.label}>Mensagem de cobrança</span>
              <textarea value={emp.instrucoesPagamento} onChange={(e) => set('instrucoesPagamento', e.target.value)} rows={3} style={ep.textarea} />
              <span style={ep.hint}>O Kaua envia esta mensagem (com o valor) ao cobrar um cliente que ainda não pagou.</span>
            </div>
          </div>
        </Section>

        {/* 3 · Serviços */}
        <Section icon="layout" titulo="Serviços" desc="Catálogo usado na emissão das NFS-e."
          action={<button style={ep.addBtn} onClick={novoServico}><window.IC.plus size={13} stroke="#fff" sw={2.4} /> Adicionar serviço</button>}>
          {servicos === null ? (
            <div style={ep.svcMsg}>Carregando serviços…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {servicos.map((s) => (
                <div key={s.id} style={ep.svcRow}>
                  <span style={ep.svcCode}>{s.code || '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: EP.text.primary }}>{s.nome}</span>
                  <span style={ep.svcMeta}>ISS {s.iss || '—'}</span>
                  <span style={ep.svcPrice}>{BRL(s.preco)}</span>
                  <button style={ep.iconBtn} className="ep-hover" onClick={() => editarServico(s)} title="Editar"><window.IC.edit size={14} stroke={EP.text.muted} /></button>
                  <button style={ep.iconBtn} className="ep-hover" onClick={() => excluirServico(s.id)} title="Excluir"><window.IC.trash size={14} stroke={EP.text.muted} /></button>
                </div>
              ))}
              {servicos.length === 0 && !form && <div style={ep.svcMsg}>Nenhum serviço cadastrado.</div>}

              {form && (
                <div style={ep.svcForm}>
                  <div style={ep.svcFormGrid}>
                    <input style={ep.inputSm} placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                    <input style={{ ...ep.inputSm, gridColumn: 'span 2' }} placeholder="Nome do serviço" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                    <input style={ep.inputSm} placeholder="ISS (ex: 4.01)" value={form.iss} onChange={(e) => setForm({ ...form, iss: e.target.value })} />
                    <input style={ep.inputSm} placeholder="Valor (ex: 250)" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                    <button style={ep.ghostSm} onClick={() => setForm(null)}>Cancelar</button>
                    <button style={ep.primarySm} onClick={salvarServico}>{form.id ? 'Salvar' : 'Adicionar'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Barra de salvar */}
        <div style={ep.saveBar}>
          {salvo && <span style={ep.saved}><window.IC.check size={14} stroke={EP.status.success} sw={2.5} /> Alterações salvas</span>}
          <div style={{ flex: 1 }} />
          <button style={ep.saveBtn} onClick={salvar}>Salvar alterações</button>
        </div>
      </div>
    </div>
  );
}
window.MegusEmpresaPage = MegusEmpresaPage;

function Section({ icon, titulo, desc, action, children }) {
  const Ic = window.IC[icon] || window.IC.settings;
  return (
    <section style={ep.section}>
      <div style={ep.sectionHead}>
        <span style={ep.sectionIcon}><Ic size={17} stroke={EP.brand.primary} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={ep.sectionTitle}>{titulo}</div>
          {desc && <div style={ep.sectionDesc}>{desc}</div>}
        </div>
        {action}
      </div>
      <div style={ep.sectionBody}>{children}</div>
    </section>
  );
}

function Campo({ label, value, onChange, mono, span }) {
  return (
    <label style={{ ...ep.field, gridColumn: span === 2 ? 'span 2' : 'span 1' }}>
      <span style={ep.label}>{label}</span>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} style={{ ...ep.input, fontFamily: mono ? EP.font.mono : EP.font.sans }} />
    </label>
  );
}

const ep = {
  page: { padding: '30px 28px 48px', minHeight: '100%', fontFamily: EP.font.sans },
  wrap: { maxWidth: 880, margin: '0 auto' },
  loading: { padding: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: EP.text.muted, fontSize: 14, fontFamily: EP.font.sans },
  head: { marginBottom: 20 },
  title: { fontFamily: EP.font.brand, fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: EP.text.primary },
  subtitle: { fontSize: 14, color: EP.text.muted, margin: '7px 0 0' },

  section: { background: '#fff', border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.lg, boxShadow: EP.shadow.sm, marginBottom: 16, overflow: 'hidden' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${EP.surface.divider}` },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `${EP.brand.primary}10`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15.5, fontWeight: 700, color: EP.text.primary, fontFamily: EP.font.brand },
  sectionDesc: { fontSize: 12.5, color: EP.text.muted, marginTop: 1 },
  sectionBody: { padding: 20 },

  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: EP.text.secondary },
  input: { height: 42, padding: '0 13px', fontSize: 14, border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.md, outline: 'none', background: '#fff', color: EP.text.primary, boxSizing: 'border-box' },
  select: { height: 42, padding: '0 11px', fontSize: 14, border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.md, outline: 'none', background: '#fff', color: EP.text.primary, fontFamily: EP.font.sans, cursor: 'pointer' },
  textarea: { padding: '11px 13px', fontSize: 14, lineHeight: 1.5, border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.md, outline: 'none', resize: 'vertical', fontFamily: EP.font.sans, color: EP.text.primary, boxSizing: 'border-box' },
  hint: { fontSize: 11.5, color: EP.text.subtle, lineHeight: 1.4 },

  addBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px', borderRadius: EP.radius.sm, border: 'none', background: `linear-gradient(150deg, ${EP.brand.primaryLight}, ${EP.brand.primaryDark})`, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: EP.font.sans, flexShrink: 0 },
  svcMsg: { padding: '16px', textAlign: 'center', fontSize: 13, color: EP.text.muted, background: EP.surface.cardMuted, borderRadius: EP.radius.md, border: `1px dashed ${EP.surface.border}` },
  svcRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.md, background: '#fff' },
  svcCode: { fontSize: 11.5, fontWeight: 700, fontFamily: EP.font.mono, color: EP.text.muted, background: EP.surface.cardMuted, padding: '3px 8px', borderRadius: 6, flexShrink: 0 },
  svcMeta: { fontSize: 12, color: EP.text.muted, fontFamily: EP.font.mono, flexShrink: 0 },
  svcPrice: { fontSize: 13.5, fontWeight: 700, fontFamily: EP.font.mono, color: EP.text.primary, flexShrink: 0, width: 92, textAlign: 'right' },
  iconBtn: { width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  svcForm: { padding: 14, border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.md, background: EP.surface.cardMuted },
  svcFormGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  inputSm: { height: 38, padding: '0 11px', fontSize: 13.5, border: `1px solid ${EP.surface.border}`, borderRadius: EP.radius.sm, outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: EP.font.sans, color: EP.text.primary },
  ghostSm: { height: 36, padding: '0 14px', borderRadius: EP.radius.sm, border: `1px solid ${EP.surface.borderStrong}`, background: '#fff', color: EP.text.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: EP.font.sans },
  primarySm: { height: 36, padding: '0 16px', borderRadius: EP.radius.sm, border: 'none', background: EP.brand.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: EP.font.sans },

  saveBar: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, position: 'sticky', bottom: 0, padding: '14px 4px' },
  saved: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: EP.status.success },
  saveBtn: { height: 44, padding: '0 22px', borderRadius: EP.radius.md, border: 'none', background: `linear-gradient(150deg, ${EP.brand.primaryLight}, ${EP.brand.primaryDark})`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: EP.font.sans, boxShadow: '0 6px 18px rgba(27,35,48,.22)' },
};

if (typeof document !== 'undefined' && !document.getElementById('megus-ep-css')) {
  const s = document.createElement('style');
  s.id = 'megus-ep-css';
  s.textContent = '@keyframes megusSpin{to{transform:rotate(360deg)}}.ep-hover:hover{background:' + EP.surface.cardMuted + '}';
  document.head.appendChild(s);
}
