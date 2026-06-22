import OpenAI from "openai";
import pino from "pino";
import { env } from "./infrastructure/config/env";
import { InMemoryRepositories } from "./infrastructure/persistence/memory/InMemoryRepositories";
import { MockCpfProvider } from "./infrastructure/cpf/MockCpfProvider";
import { MockFiscalProvider } from "./infrastructure/fiscal/MockFiscalProvider";
import { OpenAIProvider } from "./infrastructure/ai/OpenAIProvider";
import { AgentBrain } from "./infrastructure/ai/AgentBrain";
import { ComprovanteAnalyzer } from "./infrastructure/ai/ComprovanteAnalyzer";
import { MockComprovanteAnalyzer } from "./infrastructure/ai/MockComprovanteAnalyzer";
import type { IComprovanteAnalyzer } from "./domain/ports/IComprovanteAnalyzer";
import { EvolutionMessagingProvider } from "./infrastructure/messaging/evolution/EvolutionMessagingProvider";
import { LogMessagingProvider } from "./infrastructure/messaging/LogMessagingProvider";
import { mapEvolutionWebhook } from "./infrastructure/messaging/evolution/webhookMapper";
import { ConversationStateMachine } from "./application/agent/ConversationStateMachine";
import { HandleInboundMessage } from "./application/use-cases/HandleInboundMessage";
import { createServer } from "./infrastructure/http/server";
import type { IMessagingProvider, InboundMessage } from "./domain/ports/IMessagingProvider";

/** Preço do serviço do piloto (R$). Compartilhado entre o seed e o mock de comprovante. */
const PILOT_SERVICE_PRICE = 180;

async function bootstrap(): Promise<void> {
  const logger = pino({ level: env.LOG_LEVEL });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY ?? "placeholder-sem-chave" }) as any;
  const ai = new OpenAIProvider(openai);

  // Seleciona provider de mensageria por env
  let messaging: IMessagingProvider;
  if (env.MESSAGING_PROVIDER === "evolution") {
    messaging = new EvolutionMessagingProvider({
      baseUrl: env.EVOLUTION_BASE_URL ?? "",
      apiKey: env.EVOLUTION_API_KEY ?? "",
      instance: env.EVOLUTION_INSTANCE,
    });
  } else if (env.MESSAGING_PROVIDER === "none") {
    messaging = new LogMessagingProvider();
  } else {
    throw new Error(`MESSAGING_PROVIDER='${env.MESSAGING_PROVIDER}' ainda não implementado`);
  }

  // Repos in-memory + seed do piloto
  const repos = new InMemoryRepositories();
  repos.seed({
    integrations: [
      {
        id: "int-piloto",
        displayName: "Kapty (consultório)",
        whatsappNumber: env.PILOT_WHATSAPP_NUMBER ?? "5511999999999",
        fiscalDoc: "66008326000173",
        fiscalName: "Kapty (consultório)",
        fiscalProviderRef: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    agentConfigs: [
      {
        id: "ag-piloto",
        integrationId: "int-piloto",
        name: "Kaua",
        segment: "saude",
        tone: "equilibrado",
        emojis: true,
        lang: "pt",
        instructions:
          "Você é o atendente do consultório. Seja cordial e ajude o paciente a emitir a nota fiscal após o pagamento.",
        capabilities: {
          chat: true,
          agenda: false,
          agendaLink: null,
          fiscal: true,
          fiscalDocType: "nfse",
          linkedServiceIds: ["svc-massagem"],
        },
        knowledgeFiles: [],
        fewShotDialogs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    services: [
      {
        id: "svc-massagem",
        integrationId: "int-piloto",
        code: "0107",
        description: "Massagem",
        price: PILOT_SERVICE_PRICE,
        issCode: "0107",
      },
    ],
  });

  const cpf = new MockCpfProvider({ "54625255830": "Pietro Augusto Mota Alkmin" });
  const comprovante: IComprovanteAnalyzer =
    env.COMPROVANTE_PROVIDER === "mock"
      ? new MockComprovanteAnalyzer({ amount: PILOT_SERVICE_PRICE, confidence: 1 })
      : new ComprovanteAnalyzer(ai, env.AI_MODEL_VISION);
  const stateMachine = new ConversationStateMachine({
    brain: new AgentBrain(ai, env.AI_MODEL_CHAT),
    cpf,
    comprovante,
    fiscal: new MockFiscalProvider(),
    messaging,
    contacts: repos.contacts,
    conversations: repos.conversations,
    emissions: repos.emissions,
    services: repos.services,
    config: {
      cpfMaxAttempts: env.CPF_MAX_ATTEMPTS,
      comprovanteMinConfidence: env.COMPROVANTE_MIN_CONFIDENCE,
    },
  });

  const handle = new HandleInboundMessage({
    integrations: repos.integrations,
    agentConfigs: repos.agentConfigs,
    conversations: repos.conversations,
    contacts: repos.contacts,
    stateMachine,
  });

  // Registra o handler de inbound no provider e sobe
  messaging.onInboundMessage((m) => handle.execute(m));
  await messaging.start();

  const server = createServer({
    onWebhook: async (body) => {
      const m = mapEvolutionWebhook(body);
      logger.info(
        { event: (body as { event?: string }).event, mapped: m ? { from: m.from, to: m.to, kind: m.kind } : null },
        "[webhook] recebido",
      );
      if (m) await handle.execute(m);
    },
    onDevInbound: async (body) => {
      const b = body as { from?: string; to?: string; kind?: string; text?: string; media?: unknown };
      const m: InboundMessage = {
        providerMessageId: "dev-" + (b.from ?? "x"),
        from: b.from ?? "",
        to: b.to ?? (env.PILOT_WHATSAPP_NUMBER ?? "5511999999999"),
        kind: (b.kind ?? "text") as InboundMessage["kind"],
        text: b.text ?? null,
        media: (b.media as InboundMessage["media"]) ?? null,
        timestamp: new Date(),
      };
      await handle.execute(m);
    },
    getQr: () => messaging.getQrCode(),
  });

  server.listen(env.PORT, () =>
    logger.info(
      { port: env.PORT, messaging: env.MESSAGING_PROVIDER },
      "Megus AI no ar — webhook /webhook/evolution, dev /dev/inbound, QR /qr",
    ),
  );
}

bootstrap().catch((err) => {
  console.error("Falha no boot:", err);
  process.exit(1);
});
