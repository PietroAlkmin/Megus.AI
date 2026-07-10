/**
 * Seed da EMPRESA DEMO (co-demo, "Clínica Demo Megus") + acesso todos×todas.
 *
 * Objetivo: o time valida as telas do painel com uma empresa cheia de dados
 * FICTÍCIOS porém REAIS no banco — substitui o antigo USE_MOCK_DATA (removido).
 *
 *  1. limpa contas de teste antigas (*@teste.megus) e a casca vazia company-piloto;
 *  2. cria/atualiza a demo: empresa (cadastro completo) + 4 integrações cobrindo
 *     todos os status do painel (operando ×2, atenção, desconectado) + agentes,
 *     serviços, contatos, conversas (BOT/AGUARDANDO/HUMANO/encerrada), mensagens
 *     e emissões (paga+emitida, pendente, cobrada, emitida ontem);
 *  3. dá a TODOS os usuários acesso a TODAS as empresas (Membership) — o seletor
 *     do painel faz o resto.
 *
 * Idempotente e "re-rodável": upserts por id fixo (demo-*) atualizam os
 * timestamps pra HOJE — rodar de novo rejuvenesce a demo (notas/mensagens "hoje").
 * Rodar dentro do container (tem @prisma/client gerado + DATABASE_URL):
 *   docker exec megus_app node scripts/seed-demo.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const agora = new Date();
const h = (horas) => new Date(agora.getTime() - horas * 3600_000);
const min = (minutos) => new Date(agora.getTime() - minutos * 60_000);

// ---------------------------------------------------------------- limpeza ---
async function limparContasDeTeste() {
  const junkUsers = await prisma.user.findMany({
    where: { email: { endsWith: "@teste.megus" } },
    include: { Membership: true },
  });
  if (junkUsers.length === 0) {
    console.log("[limpeza] nenhuma conta *@teste.megus encontrada");
  }
  const junkUserIds = new Set(junkUsers.map((u) => u.id));

  // Empresa é lixo se TODAS as memberships dela são de usuários de teste.
  const candidatas = new Set(junkUsers.flatMap((u) => u.Membership.map((m) => m.companyId)));
  const junkCompanies = [];
  for (const companyId of candidatas) {
    const donos = await prisma.membership.findMany({ where: { companyId }, select: { userId: true } });
    if (donos.every((d) => junkUserIds.has(d.userId))) junkCompanies.push(companyId);
  }

  for (const companyId of junkCompanies) {
    await apagarEmpresaInteira(companyId);
    console.log(`[limpeza] empresa de teste removida: ${companyId}`);
  }
  if (junkUsers.length > 0) {
    await prisma.membership.deleteMany({ where: { userId: { in: [...junkUserIds] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...junkUserIds] } } });
    console.log(`[limpeza] ${junkUsers.length} usuário(s) *@teste.megus removido(s)`);
  }

  // Casca vazia do seed antigo: só some se realmente não tem nada pendurado.
  const casca = await prisma.company.findUnique({
    where: { id: "company-piloto" },
    include: { Integration: { select: { id: true } } },
  });
  if (casca && casca.Integration.length === 0) {
    await prisma.membership.deleteMany({ where: { companyId: "company-piloto" } });
    await prisma.company.delete({ where: { id: "company-piloto" } });
    console.log("[limpeza] casca vazia company-piloto removida");
  }
}

async function apagarEmpresaInteira(companyId) {
  const integs = await prisma.integration.findMany({ where: { companyId }, select: { id: true } });
  const ids = integs.map((i) => i.id);
  if (ids.length > 0) {
    await prisma.message.deleteMany({ where: { Conversation: { integrationId: { in: ids } } } });
    await prisma.conversation.deleteMany({ where: { integrationId: { in: ids } } });
    await prisma.emissionIntent.deleteMany({ where: { integrationId: { in: ids } } });
    await prisma.contact.deleteMany({ where: { integrationId: { in: ids } } });
    await prisma.service.deleteMany({ where: { integrationId: { in: ids } } });
    await prisma.agentConfig.deleteMany({ where: { integrationId: { in: ids } } });
    await prisma.integration.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.membership.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

// ------------------------------------------------------------------- demo ---
async function seedEmpresaDemo() {
  await prisma.company.upsert({
    where: { id: "co-demo" },
    update: { updatedAt: agora },
    create: {
      id: "co-demo",
      name: "Clínica Demo Megus",
      fiscalName: "Clínica Demo Megus LTDA",
      fiscalDoc: "11222333000181", // CNPJ fictício (formato válido)
      municipalRegistration: "8.214.399-0",
      email: "contato@demo.megus.ai",
      phone: "(11) 4002-8922",
      zip: "01310-100",
      address: "Av. Paulista, 1000 — cj 42",
      city: "São Paulo",
      state: "SP",
      pixType: "cnpj",
      pixKey: "11222333000181",
      paymentInstructions: "Pix preferencial. Envie o comprovante aqui na conversa para emitir a nota.",
      updatedAt: agora,
    },
  });

  // 4 integrações — uma por status do painel
  const integracoes = [
    { id: "demo-int-recepcao", displayName: "Recepção · Alphaville", whatsappNumber: "5511980000001" },
    { id: "demo-int-estetica", displayName: "Estética", whatsappNumber: "5511980000002" },
    { id: "demo-int-odonto", displayName: "Odontologia", whatsappNumber: "" }, // desconectado
    { id: "demo-int-nova", displayName: "Unidade Nova", whatsappNumber: "5511980000004" }, // sem agente → atenção
  ];
  for (const integ of integracoes) {
    await prisma.integration.upsert({
      where: { id: integ.id },
      update: { updatedAt: agora },
      create: { ...integ, companyId: "co-demo", evolutionInstance: "", active: true, updatedAt: agora },
    });
  }

  const servicos = [
    { id: "demo-svc-consulta", integrationId: "demo-int-recepcao", code: "0401", description: "Consulta clínica", price: 250, issCode: "0401" },
    { id: "demo-svc-retorno", integrationId: "demo-int-recepcao", code: "0401", description: "Retorno / reavaliação", price: 120, issCode: "0401" },
    { id: "demo-svc-avaliacao", integrationId: "demo-int-recepcao", code: "0401", description: "Avaliação inicial", price: 180, issCode: "0401" },
    { id: "demo-svc-procedimento", integrationId: "demo-int-estetica", code: "0602", description: "Procedimento estético", price: 400, issCode: "0602" },
    { id: "demo-svc-massagem", integrationId: "demo-int-estetica", code: "0602", description: "Massagem relaxante", price: 180, issCode: "0602" },
    { id: "demo-svc-limpeza", integrationId: "demo-int-odonto", code: "0403", description: "Limpeza dental", price: 200, issCode: "0403" },
  ];
  for (const s of servicos) {
    await prisma.service.upsert({ where: { id: s.id }, update: {}, create: s });
  }

  const agentes = [
    {
      id: "demo-ag-kaua", integrationId: "demo-int-recepcao", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
      instructions: "Você é o atendente da clínica. Seja cordial, confirme nome e CPF antes de emitir a nota e chame um humano quando o paciente pedir remarcação.",
      linked: ["demo-svc-consulta", "demo-svc-retorno", "demo-svc-avaliacao"],
      fewShot: [
        { q: "Quanto custa a consulta?", a: "A consulta clínica custa R$ 250. Quer agendar? 😊" },
        { q: "Já paguei, e a nota?", a: "Perfeito! Me confirma seu nome completo e CPF que eu já emito a sua nota." },
      ],
    },
    {
      id: "demo-ag-sofia", integrationId: "demo-int-estetica", name: "Sofia", segment: "beleza", tone: "descontraido", emojis: true, lang: "pt",
      instructions: "Você atende o estúdio de estética. Tom leve, sempre confirme o pagamento antes da nota.",
      linked: ["demo-svc-procedimento", "demo-svc-massagem"],
      fewShot: [{ q: "Tem horário sábado?", a: "Tenho sim! 💆 Sábado às 10h ou 14h — qual prefere?" }],
    },
    {
      id: "demo-ag-odonto", integrationId: "demo-int-odonto", name: "Kaua", segment: "saude", tone: "formal", emojis: false, lang: "pt",
      instructions: "Você atende o consultório odontológico. Tratamento formal (senhor/senhora).",
      linked: ["demo-svc-limpeza"],
      fewShot: [],
    },
    // demo-int-nova fica de propósito SEM agente → status "atenção" no painel
  ];
  for (const a of agentes) {
    await prisma.agentConfig.upsert({
      where: { integrationId: a.integrationId },
      update: { updatedAt: agora },
      create: {
        id: a.id, integrationId: a.integrationId, name: a.name, segment: a.segment, tone: a.tone,
        emojis: a.emojis, lang: a.lang, instructions: a.instructions,
        capabilitiesJson: JSON.stringify({ chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: a.linked }),
        knowledgeFilesJson: JSON.stringify([]),
        fewShotDialogsJson: JSON.stringify(a.fewShot),
        updatedAt: agora,
      },
    });
  }

  const contatos = [
    { id: "demo-ct-marina", integrationId: "demo-int-recepcao", whatsappNumber: "5511960000001", fullName: "Marina Lopes", cpf: "39053344705", cpfNameVerified: true },
    { id: "demo-ct-carlos", integrationId: "demo-int-recepcao", whatsappNumber: "5511960000002", fullName: "Carlos Aguiar", cpf: null, cpfNameVerified: false },
    { id: "demo-ct-helena", integrationId: "demo-int-recepcao", whatsappNumber: "5511960000003", fullName: "Helena Prado", cpf: null, cpfNameVerified: false },
    { id: "demo-ct-rafael", integrationId: "demo-int-recepcao", whatsappNumber: "5511960000004", fullName: "Rafael Dias", cpf: "52998224725", cpfNameVerified: true },
    { id: "demo-ct-bianca", integrationId: "demo-int-estetica", whatsappNumber: "5511960000005", fullName: "Bianca Nunes", cpf: null, cpfNameVerified: false },
    { id: "demo-ct-teo", integrationId: "demo-int-estetica", whatsappNumber: "5511960000006", fullName: "Téo Martins", cpf: "39053344705", cpfNameVerified: true },
  ];
  for (const c of contatos) {
    await prisma.contact.upsert({
      where: { id: c.id },
      update: { updatedAt: agora },
      create: { ...c, createdAt: h(72), updatedAt: agora },
    });
  }

  // Conversas: estados que o painel precisa mostrar (BOT, AGUARDANDO, HUMANO, encerrada)
  const conversas = [
    { id: "demo-conv-marina", integrationId: "demo-int-recepcao", contactId: "demo-ct-marina", whatsappNumber: "5511960000001", state: "done", humanHandoff: false, lastInboundAt: h(2) },
    { id: "demo-conv-carlos", integrationId: "demo-int-recepcao", contactId: "demo-ct-carlos", whatsappNumber: "5511960000002", state: "collecting_identity", humanHandoff: false, lastInboundAt: min(30) },
    { id: "demo-conv-rafael", integrationId: "demo-int-recepcao", contactId: "demo-ct-rafael", whatsappNumber: "5511960000004", state: "new", humanHandoff: true, lastInboundAt: h(1) },
    { id: "demo-conv-bianca", integrationId: "demo-int-estetica", contactId: "demo-ct-bianca", whatsappNumber: "5511960000005", state: "awaiting_comprovante", humanHandoff: false, lastInboundAt: min(20) },
    { id: "demo-conv-teo", integrationId: "demo-int-estetica", contactId: "demo-ct-teo", whatsappNumber: "5511960000006", state: "done", humanHandoff: false, lastInboundAt: h(1) },
  ];
  for (const conv of conversas) {
    await prisma.conversation.upsert({
      where: { id: conv.id },
      update: { state: conv.state, humanHandoff: conv.humanHandoff, lastInboundAt: conv.lastInboundAt, updatedAt: agora },
      create: { ...conv, createdAt: h(72), updatedAt: agora },
    });
  }

  // Mensagens (todas de HOJE → métrica "mensagens hoje" viva; re-rodar rejuvenesce)
  const M = (id, conversationId, minAtras, author, body, extra = {}) => ({
    id, conversationId, direction: author === "contact" ? "inbound" : "outbound",
    author, kind: extra.kind ?? "text", body, mediaUrl: extra.mediaUrl ?? null, createdAt: min(minAtras),
  });
  const mensagens = [
    // Marina — fluxo feliz completo (identidade → comprovante → nota emitida)
    M("demo-msg-m1", "demo-conv-marina", 190, "contact", "Oi! Fiz uma consulta hoje e já paguei. Consigo a nota fiscal?"),
    M("demo-msg-m2", "demo-conv-marina", 189, "agent", "Oi, Marina! 😊 Claro, eu emito sua NFS-e. Antes, me confirma seu nome completo e CPF, por favor?"),
    M("demo-msg-m3", "demo-conv-marina", 187, "contact", "Marina Lopes de Souza — 390.533.447-05"),
    M("demo-msg-m4", "demo-conv-marina", 186, "agent", "Perfeito, conferi seus dados ✅ Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito a nota."),
    M("demo-msg-m5", "demo-conv-marina", 182, "contact", "", { kind: "image", mediaUrl: "https://demo.megus.ai/anexos/comprovante-pix.jpg" }),
    M("demo-msg-m6", "demo-conv-marina", 181, "agent", "Recebi! Confirmei o pagamento de R$ 250,00 para a Clínica Demo Megus. Emitindo sua nota fiscal…"),
    M("demo-msg-m7", "demo-conv-marina", 180, "agent", "Prontinho! Sua NFS-e está emitida ✅ Segue o PDF. Qualquer coisa, é só chamar 😉", { kind: "file", mediaUrl: "https://demo.megus.ai/anexos/NFS-e-2026-00481.pdf" }),
    // Carlos — coletando identidade (AGUARDANDO)
    M("demo-msg-c1", "demo-conv-carlos", 35, "contact", "Boa tarde"),
    M("demo-msg-c2", "demo-conv-carlos", 34, "contact", "Já fiz o pagamento, e a nota?"),
    M("demo-msg-c3", "demo-conv-carlos", 33, "agent", "Boa tarde! Claro, posso emitir 😊 Me confirma seu nome completo e CPF, por favor?"),
    // Rafael — transferido pra humano
    M("demo-msg-r1", "demo-conv-rafael", 70, "contact", "Bom dia! Queria remarcar minha consulta."),
    M("demo-msg-r2", "demo-conv-rafael", 69, "agent", "Bom dia! Para remarcação eu chamo a recepção, um instante 🙂"),
    M("demo-msg-r3", "demo-conv-rafael", 65, "human", "Oi Rafael, aqui é a Paula da recepção. Tenho quinta às 15h ou sexta às 10h, qual prefere?"),
    // Bianca — aguardando comprovante
    M("demo-msg-b1", "demo-conv-bianca", 25, "contact", "Oi! Terminei a sessão agora, como pego a nota?"),
    M("demo-msg-b2", "demo-conv-bianca", 24, "agent", "Oi, Bianca! 💆 Me manda o comprovante do pagamento (foto ou PDF) que eu já emito pra você."),
    // Téo — emitida hoje
    M("demo-msg-t1", "demo-conv-teo", 95, "contact", "Massagem paga! Nota por favor 🙏"),
    M("demo-msg-t2", "demo-conv-teo", 93, "agent", "Fechou, Téo! Conferi o pagamento de R$ 180,00 ✅ Sua nota está emitida — segue o PDF.", { kind: "file", mediaUrl: "https://demo.megus.ai/anexos/NFS-e-2026-00482.pdf" }),
  ];
  for (const m of mensagens) {
    await prisma.message.upsert({
      where: { id: m.id },
      update: { createdAt: m.createdAt },
      create: m,
    });
  }

  // Emissões — cobre todos os status da tela de Cobranças
  const emissoes = [
    { id: "demo-em-marina", integrationId: "demo-int-recepcao", conversationId: "demo-conv-marina", contactId: "demo-ct-marina", status: "emitted", tomadorName: "Marina Lopes de Souza", tomadorCpf: "39053344705", serviceId: "demo-svc-consulta", description: "Consulta clínica", amount: 250, paymentVerified: true, paymentConfidence: 0.98, notaNumber: "2026-00481", pdfUrl: "https://demo.megus.ai/anexos/NFS-e-2026-00481.pdf", appointmentAt: h(5), paidAt: h(3), chargeSentAt: null, createdAt: h(3), updatedAt: h(3) },
    { id: "demo-em-carlos", integrationId: "demo-int-recepcao", conversationId: "demo-conv-carlos", contactId: "demo-ct-carlos", status: "draft", tomadorName: "Carlos Aguiar", tomadorCpf: "", serviceId: "demo-svc-retorno", description: "Retorno / reavaliação", amount: 120, paymentVerified: false, paymentConfidence: 0, notaNumber: null, pdfUrl: null, appointmentAt: h(-2), paidAt: null, chargeSentAt: null, createdAt: h(1), updatedAt: h(1) },
    { id: "demo-em-helena", integrationId: "demo-int-recepcao", conversationId: null, contactId: "demo-ct-helena", status: "draft", tomadorName: "Helena Prado", tomadorCpf: "", serviceId: "demo-svc-avaliacao", description: "Avaliação inicial", amount: 180, paymentVerified: false, paymentConfidence: 0, notaNumber: null, pdfUrl: null, appointmentAt: h(26), paidAt: null, chargeSentAt: h(20), createdAt: h(26), updatedAt: h(20) },
    { id: "demo-em-rafael", integrationId: "demo-int-recepcao", conversationId: "demo-conv-rafael", contactId: "demo-ct-rafael", status: "emitted", tomadorName: "Rafael Dias", tomadorCpf: "52998224725", serviceId: "demo-svc-consulta", description: "Consulta clínica", amount: 250, paymentVerified: true, paymentConfidence: 0.95, notaNumber: "2026-00479", pdfUrl: "https://demo.megus.ai/anexos/NFS-e-2026-00479.pdf", appointmentAt: h(28), paidAt: h(27), chargeSentAt: null, createdAt: h(28), updatedAt: h(27) },
    { id: "demo-em-bianca", integrationId: "demo-int-estetica", conversationId: "demo-conv-bianca", contactId: "demo-ct-bianca", status: "ready", tomadorName: "Bianca Nunes", tomadorCpf: "", serviceId: "demo-svc-procedimento", description: "Procedimento estético", amount: 400, paymentVerified: false, paymentConfidence: 0, notaNumber: null, pdfUrl: null, appointmentAt: min(40), paidAt: null, chargeSentAt: null, createdAt: min(30), updatedAt: min(30) },
    { id: "demo-em-teo", integrationId: "demo-int-estetica", conversationId: "demo-conv-teo", contactId: "demo-ct-teo", status: "emitted", tomadorName: "Téo Martins", tomadorCpf: "39053344705", serviceId: "demo-svc-massagem", description: "Massagem relaxante", amount: 180, paymentVerified: true, paymentConfidence: 0.97, notaNumber: "2026-00482", pdfUrl: "https://demo.megus.ai/anexos/NFS-e-2026-00482.pdf", appointmentAt: h(2), paidAt: min(95), chargeSentAt: null, createdAt: min(95), updatedAt: min(93) },
  ];
  for (const e of emissoes) {
    await prisma.emissionIntent.upsert({
      where: { id: e.id },
      update: { status: e.status, appointmentAt: e.appointmentAt, paidAt: e.paidAt, chargeSentAt: e.chargeSentAt, notaNumber: e.notaNumber, createdAt: e.createdAt, updatedAt: e.updatedAt },
      create: e,
    });
  }
  console.log("[demo] Clínica Demo Megus semeada (4 integrações, 5 conversas, 17 mensagens, 6 emissões)");
}

// ------------------------------------------------- acesso todos × todas ---
async function concederAcessoTotal() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const u of users) {
    for (const c of companies) {
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: u.id, companyId: c.id } },
        update: {},
        create: { id: randomUUID(), userId: u.id, companyId: c.id, role: "member" },
      });
    }
  }
  console.log(`[acesso] ${users.length} usuário(s) × ${companies.length} empresa(s) — memberships garantidas`);
}

// ------------------------------------------------------------------ main ---
try {
  await limparContasDeTeste();
  await seedEmpresaDemo();
  await concederAcessoTotal();
  const resumo = await prisma.$queryRaw`SELECT (SELECT COUNT(*) FROM [User]) AS usuarios, (SELECT COUNT(*) FROM Company) AS empresas, (SELECT COUNT(*) FROM Membership) AS memberships`;
  console.log("[resumo]", JSON.stringify(resumo.map((r) => ({ usuarios: Number(r.usuarios), empresas: Number(r.empresas), memberships: Number(r.memberships) }))));
} finally {
  await prisma.$disconnect();
}
