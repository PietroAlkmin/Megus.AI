/* global React */
// MegusAtendenteModal · "Configurar Atendente Virtual" como MODAL CENTRAL
// (padrão Kapty: overlay + shell + header com breadcrumb/BETA + seções recolhíveis).
// Conteúdo portado do BotWizard do sócio: identidade/segmento, tom, instruções,
// ações (emitir nota → NFS-e + serviços), treinamento. onSaved(cfg) → abre o QR.

const AT = window.MegusTokens;
const { useState: useStAv, useRef: useRefAv, useEffect: useEffAv } = React;
const WA_AV = AT.status.whatsapp;

const SEGMENTOS = [
  { id: 'varejo', titulo: 'Comércio / Varejo', desc: 'Venda de mercadorias' },
  { id: 'restaurante', titulo: 'Restaurante', desc: 'Consumo no local e balcão' },
  { id: 'servicos', titulo: 'Serviços / Consultório', desc: 'Prestação de serviços' },
  { id: 'saude', titulo: 'Saúde / Clínica', desc: 'Consultas e procedimentos' },
  { id: 'beleza', titulo: 'Beleza / Estética', desc: 'Sessões e tratamentos' },
  { id: 'educacao', titulo: 'Educação / Cursos', desc: 'Aulas e mensalidades' },
];
const TONS = [
  { id: 'formal', titulo: 'Formal', desc: 'Tratamento por "senhor(a)"' },
  { id: 'equilibrado', titulo: 'Equilibrado', desc: 'Cordial e claro (recomendado)' },
  { id: 'descontraido', titulo: 'Descontraído', desc: 'Próximo e leve' },
];
const SUGESTOES = ['Tira-dúvidas sobre a nota fiscal', 'Confirmação de agendamentos', 'Cobrança amigável de pendências'];
const DOCS = [
  { id: 'NF-e', sub: 'Mercadorias', manutencao: true },
  { id: 'NFC-e', sub: 'Consumidor final', manutencao: true },
  { id: 'NFS-e', sub: 'Serviços', manutencao: false },
];
let _avId = 0;
const novoId = () => `sv_${++_avId}_${Date.now()}`;

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ ...av.toggle, background: on ? AT.brand.primary : AT.surface.borderStrong }}>
      <span style={{ ...av.toggleKnob, transform: on ? 'translateX(18px)' : 'none' }} />
    </button>
  );
}

function Secao({ n, titulo, desc, aberta, onToggle, children }) {
  const ref = useRefAv(null);
  return (
    <div style={av.secao}>
      <button style={av.secaoHead} onClick={onToggle}>
        <span style={av.secaoNum}>{n}</span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={av.secaoTitulo}>{titulo}</span>
          <span style={av.secaoDesc}>{desc}</span>
        </span>
        <window.IC.chevron size={17} stroke={AT.text.muted} style={{ transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }} />
      </button>
      <div style={{ maxHeight: aberta ? (ref.current ? ref.current.scrollHeight + 40 : 1600) : 0, opacity: aberta ? 1 : 0, overflow: 'hidden', transition: 'max-height .3s ease, opacity .25s ease' }}>
        <div ref={ref} style={av.secaoBody}>{children}</div>
      </div>
    </div>
  );
}

function MegusAtendenteModal({ onClose, onSaved }) {
  const [aberta, setAberta] = useStAv(1);
  const [cfg, setCfg] = useStAv({
    nome: 'Kaua', segmento: 'saude', tom: 'equilibrado', emojis: true, idioma: 'pt-BR',
    instrucoes: '', emitirNota: true, tipoDoc: 'NFS-e', servicos: [], arquivos: [], exemplos: [],
  });
  const [svForm, setSvForm] = useStAv(null);
  const fileRef = useRefAv(null);
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const toggleSecao = (n) => setAberta((a) => (a === n ? 0 : n));

  useEffAv(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Serviços (CRUD inline)
  const addServico = () => { if (!svForm.nome.trim()) return; set('servicos', svForm.editId ? cfg.servicos.map((x) => x.id === svForm.editId ? { ...svForm, id: svForm.editId } : x) : [...cfg.servicos, { ...svForm, id: novoId() }]); setSvForm(null); };
  // Arquivos
  const onFiles = (e) => { const novos = Array.from(e.target.files || []).map((f) => ({ id: novoId(), nome: f.name, tipo: (f.name.split('.').pop() || '').toUpperCase() })); set('arquivos', [...cfg.arquivos, ...novos]); e.target.value = ''; };
  // Exemplos
  const addExemplo = () => set('exemplos', [...cfg.exemplos, { id: novoId(), cliente: '', agente: '' }]);
  const editExemplo = (id, k, v) => set('exemplos', cfg.exemplos.map((x) => x.id === id ? { ...x, [k]: v } : x));

  const secoes = [
    { n: 1, titulo: 'Identidade e segmento', desc: 'Quem é o agente e em que área você atua.' },
    { n: 2, titulo: 'Personalidade e tom', desc: 'O estilo da escrita do agente.' },
    { n: 3, titulo: 'Instruções iniciais', desc: 'O briefing — o que fazer, evitar e quando chamar um humano.' },
    { n: 4, titulo: 'O que o agente faz', desc: 'Ações que o agente pode executar nas conversas.' },
    { n: 5, titulo: 'Treinamento', desc: 'Conteúdo que o agente usa como base.' },
  ];

  return (
    <React.Fragment>
      <div onClick={onClose} style={av.overlay} />
      <div style={av.shell} role="dialog" aria-modal="true">
        <div style={av.header}>
          <span style={av.waLogo}><window.IC.robot size={22} stroke={AT.brand.primary} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={av.crumb}>WhatsApp <span style={{ opacity: 0.5 }}>›</span> Atendente Virtual <span style={av.beta}>BETA</span></div>
            <h2 style={av.title}>Configurar Atendente Virtual</h2>
          </div>
          <button onClick={onClose} style={av.closeBtn} title="Fechar (Esc)"><window.IC.x size={16} stroke={AT.text.muted} /></button>
        </div>

        <div style={av.body}>
          {secoes.map((s) => (
            <Secao key={s.n} {...s} aberta={aberta === s.n} onToggle={() => toggleSecao(s.n)}>
              {s.n === 1 && (
                <div>
                  <Campo label="Nome do agente" sub="Aparece no início da conversa e na assinatura das mensagens.">
                    <input style={av.input} value={cfg.nome} onChange={(e) => set('nome', e.target.value)} />
                  </Campo>
                  <Campo label="Segmento de negócio" sub="Direciona o estilo das respostas e sugere o tipo de nota fiscal.">
                    <div style={av.grid2}>
                      {SEGMENTOS.map((seg) => (
                        <button key={seg.id} onClick={() => set('segmento', seg.id)} style={{ ...av.cardOpt, ...(cfg.segmento === seg.id ? av.cardOptOn : {}) }}>
                          <span style={av.cardOptTit}>{seg.titulo}</span>
                          <span style={av.cardOptDesc}>{seg.desc}</span>
                        </button>
                      ))}
                    </div>
                  </Campo>
                </div>
              )}

              {s.n === 2 && (
                <div>
                  <div style={av.grid3}>
                    {TONS.map((t) => (
                      <button key={t.id} onClick={() => set('tom', t.id)} style={{ ...av.cardOpt, ...(cfg.tom === t.id ? av.cardOptOn : {}) }}>
                        <span style={av.cardOptTit}>{t.titulo}</span>
                        <span style={av.cardOptDesc}>{t.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div style={av.grid2b}>
                    <div style={av.boxToggle}>
                      <div><div style={av.boxTit}>Usar emojis</div><div style={av.boxSub}>Deixa a conversa mais leve</div></div>
                      <Toggle on={cfg.emojis} onClick={() => set('emojis', !cfg.emojis)} />
                    </div>
                    <div style={av.boxToggle}>
                      <div><div style={av.boxTit}>Idioma</div><div style={av.boxSub}>Idioma das respostas</div></div>
                      <select value={cfg.idioma} onChange={(e) => set('idioma', e.target.value)} style={av.select}>
                        <option value="pt-BR">Português (BR)</option><option value="en">English</option><option value="es">Español</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {s.n === 3 && (
                <div>
                  <textarea style={av.textarea} rows={5} value={cfg.instrucoes} onChange={(e) => set('instrucoes', e.target.value)}
                    placeholder="Descreva como o agente deve se comportar: o que fazer, o que evitar e quando transferir para um humano." />
                  <div style={av.sugestoes}>
                    <span style={{ fontSize: 12.5, color: AT.text.muted }}>Sugestões:</span>
                    {SUGESTOES.map((sug) => (
                      <button key={sug} style={av.chip} onClick={() => set('instrucoes', cfg.instrucoes ? cfg.instrucoes + '\n\n' + sug + '.' : sug + '.')}>+ {sug}</button>
                    ))}
                  </div>
                </div>
              )}

              {s.n === 4 && (
                <div style={av.boxAcao}>
                  <div style={av.boxAcaoHead}>
                    <div><div style={av.boxTit}>Emitir nota após o pagamento</div><div style={av.boxSub}>Confere o comprovante e emite o documento fiscal automaticamente.</div></div>
                    <Toggle on={cfg.emitirNota} onClick={() => set('emitirNota', !cfg.emitirNota)} />
                  </div>
                  {cfg.emitirNota && (
                    <div style={av.boxAcaoBody}>
                      <div style={av.subLabel}>Tipo de documento</div>
                      <div style={av.grid3}>
                        {DOCS.map((doc) => {
                          const on = cfg.tipoDoc === doc.id && !doc.manutencao;
                          return (
                            <button key={doc.id} disabled={doc.manutencao} onClick={() => !doc.manutencao && set('tipoDoc', doc.id)}
                              style={{ ...av.cardOpt, textAlign: 'center', ...(on ? av.cardOptOn : {}), ...(doc.manutencao ? av.cardOptOff : {}) }}>
                              <span style={av.cardOptTit}>{doc.id}</span>
                              <span style={av.cardOptDesc}>{doc.manutencao ? 'Em manutenção!' : doc.sub}</span>
                            </button>
                          );
                        })}
                      </div>
                      {cfg.tipoDoc === 'NFS-e' && (
                        <React.Fragment>
                          <div style={{ ...av.rowBetween, marginTop: 18 }}>
                            <div style={av.subLabel}>Serviços vinculados ({cfg.servicos.length})</div>
                            <button style={av.btnSmall} onClick={() => setSvForm({ cod: '', nome: '', iss: '', valor: '', editId: null })}>+ Cadastrar serviço</button>
                          </div>
                          {cfg.servicos.length === 0 && !svForm && <div style={av.vazio}>Nenhum serviço cadastrado. Clique em "Cadastrar serviço".</div>}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                            {cfg.servicos.map((sv) => (
                              <div key={sv.id} style={av.svLinha}>
                                <span style={{ fontSize: 12, color: AT.text.muted, fontFamily: AT.font.mono }}>{sv.cod || '—'}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{sv.nome}</span>
                                <span style={{ fontSize: 12, color: AT.text.muted, fontFamily: AT.font.mono }}>ISS {sv.iss || '—'} · {sv.valor || '—'}</span>
                                <button style={av.iconBtn} onClick={() => setSvForm({ ...sv, editId: sv.id })}><window.IC.edit size={15} stroke={AT.text.muted} /></button>
                                <button style={av.iconBtn} onClick={() => set('servicos', cfg.servicos.filter((x) => x.id !== sv.id))}><window.IC.trash size={15} stroke={AT.text.muted} /></button>
                              </div>
                            ))}
                          </div>
                          {svForm && (
                            <div style={av.svFormInline}>
                              <div style={av.svFormGrid}>
                                <input style={av.inputSm} placeholder="Código" value={svForm.cod} onChange={(e) => setSvForm({ ...svForm, cod: e.target.value })} />
                                <input style={{ ...av.inputSm, gridColumn: 'span 2' }} placeholder="Nome do serviço" value={svForm.nome} onChange={(e) => setSvForm({ ...svForm, nome: e.target.value })} />
                                <input style={av.inputSm} placeholder="ISS (ex: 4.01)" value={svForm.iss} onChange={(e) => setSvForm({ ...svForm, iss: e.target.value })} />
                                <input style={av.inputSm} placeholder="Valor (R$ 250,00)" value={svForm.valor} onChange={(e) => setSvForm({ ...svForm, valor: e.target.value })} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                                <button style={av.btnGhostSm} onClick={() => setSvForm(null)}>Cancelar</button>
                                <button style={av.btnPrimarySm} onClick={addServico}>{svForm.editId ? 'Salvar' : 'Adicionar'}</button>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      )}
                    </div>
                  )}
                </div>
              )}

              {s.n === 5 && (
                <div>
                  <div style={av.subLabel}>Arquivos de conhecimento</div>
                  <div style={{ ...av.boxSub, marginBottom: 10 }}>PDF, Word, planilhas ou TXT. O agente consulta esses documentos ao responder.</div>
                  <div style={av.dropzone} onClick={() => fileRef.current && fileRef.current.click()}>
                    <window.IC.upload size={24} stroke={AT.brand.primary} />
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Clique para enviar</div>
                    <div style={{ fontSize: 12, color: AT.text.muted, marginTop: 4 }}>PDF · DOCX · XLSX · TXT — até 20 MB cada</div>
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.txt" style={{ display: 'none' }} onChange={onFiles} />
                  </div>
                  {cfg.arquivos.map((arq) => (
                    <div key={arq.id} style={av.arquivo}>
                      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{arq.nome}</div><div style={{ fontSize: 11.5, color: AT.text.muted, fontFamily: AT.font.mono, marginTop: 2 }}>{arq.tipo}</div></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={av.badgeOk}>✓ Pronto</span>
                        <button style={av.iconBtn} onClick={() => set('arquivos', cfg.arquivos.filter((a) => a.id !== arq.id))}><window.IC.trash size={15} stroke={AT.text.muted} /></button>
                      </div>
                    </div>
                  ))}
                  <div style={{ ...av.rowBetween, marginTop: 20 }}>
                    <div><div style={av.subLabel}>Exemplos de conversa</div><div style={av.boxSub}>Pares de pergunta e resposta ideais.</div></div>
                    <button style={av.btnSmall} onClick={addExemplo}>+ Adicionar exemplo</button>
                  </div>
                  {cfg.exemplos.map((ex, i) => (
                    <div key={ex.id} style={av.exemplo}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: AT.text.muted, letterSpacing: '.05em' }}>EXEMPLO {i + 1}</span>
                        <button style={av.iconBtn} onClick={() => set('exemplos', cfg.exemplos.filter((x) => x.id !== ex.id))}><window.IC.trash size={15} stroke={AT.text.muted} /></button>
                      </div>
                      <div style={av.exLinha}><span style={av.tagCliente}>CLIENTE</span><textarea style={av.exInput} rows={2} placeholder="Mensagem do cliente…" value={ex.cliente} onChange={(e) => editExemplo(ex.id, 'cliente', e.target.value)} /></div>
                      <div style={av.exLinha}><span style={av.tagAgente}>AGENTE</span><textarea style={av.exInput} rows={2} placeholder="Resposta ideal do agente…" value={ex.agente} onChange={(e) => editExemplo(ex.id, 'agente', e.target.value)} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Secao>
          ))}
        </div>

        <div style={av.footer}>
          <span style={{ fontSize: 12.5, color: AT.text.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}><window.IC.info size={14} stroke={AT.text.subtle} /> Você poderá editar tudo isso depois.</span>
          <div style={{ flex: 1 }} />
          <button style={av.btnGhost} onClick={onClose}>Cancelar</button>
          <button style={av.btnPrimary} onClick={() => (onSaved || onClose)(cfg)}>Salvar e gerar conexão <window.IC.chevronR size={15} stroke="#fff" /></button>
        </div>
      </div>
    </React.Fragment>
  );
}
window.MegusAtendenteModal = MegusAtendenteModal;

function Campo({ label, sub, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3, color: AT.text.secondary }}>{label}</div>
      {sub && <div style={{ fontSize: 12.5, color: AT.text.muted, marginBottom: 10, lineHeight: 1.4 }}>{sub}</div>}
      {children}
    </div>
  );
}

const av = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(27,35,48,.45)', zIndex: 290 },
  shell: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(780px, 95vw)', maxHeight: '92vh', zIndex: 291, background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(27,35,48,.30)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: AT.font.sans, animation: 'megusPop .24s cubic-bezier(.2,.7,.3,1)' },
  header: { padding: '16px 20px', borderBottom: `1px solid ${AT.surface.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 13, background: `linear-gradient(90deg, ${AT.brand.primary}0E, #fff 60%)` },
  waLogo: { width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: '#fff', border: `1px solid ${AT.surface.border}`, boxShadow: '0 2px 8px rgba(27,35,48,.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  crumb: { fontSize: 11, fontWeight: 600, color: AT.text.muted, letterSpacing: '.03em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 },
  beta: { fontSize: 9.5, fontWeight: 800, color: AT.brand.accent, background: `${AT.brand.accent}1A`, padding: '1px 7px', borderRadius: 99, letterSpacing: '.05em' },
  title: { fontFamily: AT.font.brand, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: AT.text.primary },
  closeBtn: { width: 32, height: 32, padding: 0, background: AT.surface.page, border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body: { padding: '6px 22px 14px', overflow: 'auto', flex: 1 },
  secao: { borderBottom: `1px solid ${AT.surface.border}` },
  secaoHead: { width: '100%', display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  secaoNum: { flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: AT.surface.page, color: AT.brand.primary, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  secaoTitulo: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: AT.text.primary },
  secaoDesc: { fontSize: 12.5, color: AT.text.muted, lineHeight: 1.4 },
  secaoBody: { padding: '4px 0 22px 36px' },
  input: { width: '100%', height: 44, padding: '0 14px', fontSize: 14.5, border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, outline: 'none', boxSizing: 'border-box', fontFamily: AT.font.sans },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  grid2b: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  cardOpt: { display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 14px', border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .12s' },
  cardOptOn: { borderColor: AT.brand.primary, background: `${AT.brand.primary}08`, boxShadow: `inset 0 0 0 1px ${AT.brand.primary}` },
  cardOptOff: { opacity: 0.55, cursor: 'not-allowed', background: AT.surface.cardMuted },
  cardOptTit: { fontSize: 14, fontWeight: 600, color: AT.text.primary },
  cardOptDesc: { fontSize: 12, color: AT.text.muted },
  boxToggle: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, background: AT.surface.cardMuted },
  boxTit: { fontSize: 14, fontWeight: 600, color: AT.text.primary },
  boxSub: { fontSize: 12, color: AT.text.muted },
  select: { height: 36, borderRadius: 8, border: `1px solid ${AT.surface.border}`, padding: '0 8px', fontSize: 13.5, background: '#fff', fontFamily: AT.font.sans },
  textarea: { width: '100%', padding: '12px 14px', fontSize: 14, lineHeight: 1.6, border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: AT.font.sans },
  sugestoes: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  chip: { fontSize: 12.5, padding: '6px 12px', border: `1px solid ${AT.surface.border}`, borderRadius: 999, background: '#fff', cursor: 'pointer', color: AT.brand.primary, fontWeight: 500, fontFamily: AT.font.sans },
  boxAcao: { border: `1px solid ${AT.surface.border}`, borderRadius: 12, overflow: 'hidden' },
  boxAcaoHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', background: AT.surface.cardMuted },
  boxAcaoBody: { padding: '16px 18px', borderTop: `1px solid ${AT.surface.border}` },
  subLabel: { fontSize: 13, fontWeight: 600, marginBottom: 8, color: AT.text.secondary },
  rowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  vazio: { fontSize: 13, color: AT.text.muted, padding: '14px 16px', background: AT.surface.cardMuted, borderRadius: AT.radius.md, border: `1px dashed ${AT.surface.border}`, textAlign: 'center', marginTop: 10 },
  svLinha: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, background: '#fff' },
  iconBtn: { border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'inline-flex' },
  svFormInline: { marginTop: 12, padding: 14, border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, background: AT.surface.cardMuted },
  svFormGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  inputSm: { height: 38, padding: '0 12px', fontSize: 13.5, border: `1px solid ${AT.surface.border}`, borderRadius: 8, outline: 'none', boxSizing: 'border-box', fontFamily: AT.font.sans },
  dropzone: { border: `1.5px dashed ${AT.surface.borderStrong}`, borderRadius: 12, padding: '26px 20px', textAlign: 'center', background: AT.surface.cardMuted, marginBottom: 14, cursor: 'pointer' },
  arquivo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, marginBottom: 8 },
  badgeOk: { fontSize: 12, fontWeight: 600, color: AT.status.success, background: AT.status.successBg, padding: '4px 10px', borderRadius: 999 },
  exemplo: { border: `1px solid ${AT.surface.border}`, borderRadius: 12, padding: 14, marginTop: 10 },
  exLinha: { display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  tagCliente: { fontSize: 10, fontWeight: 700, color: AT.brand.primary, background: `${AT.brand.primary}12`, padding: '3px 8px', borderRadius: 6, flexShrink: 0, marginTop: 6 },
  tagAgente: { fontSize: 10, fontWeight: 700, color: AT.status.success, background: AT.status.successBg, padding: '3px 8px', borderRadius: 6, flexShrink: 0, marginTop: 6 },
  exInput: { flex: 1, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.5, border: `1px solid ${AT.surface.border}`, borderRadius: 8, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: AT.font.sans },
  footer: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: `1px solid ${AT.surface.border}`, background: AT.surface.cardMuted, flexShrink: 0 },
  btnGhost: { height: 42, padding: '0 20px', border: `1px solid ${AT.surface.border}`, borderRadius: AT.radius.md, background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: AT.font.sans },
  btnPrimary: { height: 42, padding: '0 20px', border: 'none', borderRadius: AT.radius.md, background: `linear-gradient(140deg, ${AT.brand.primaryLight}, ${AT.brand.primaryDark})`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: AT.font.sans },
  btnSmall: { fontSize: 13, fontWeight: 600, color: AT.brand.primary, background: '#fff', border: `1px solid ${AT.surface.border}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: AT.font.sans },
  btnGhostSm: { fontSize: 13, fontWeight: 600, background: '#fff', border: `1px solid ${AT.surface.border}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: AT.font.sans },
  btnPrimarySm: { fontSize: 13, fontWeight: 600, color: '#fff', background: AT.brand.primary, border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontFamily: AT.font.sans },
  toggle: { width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .15s', flexShrink: 0 },
  toggleKnob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform .15s' },
};
