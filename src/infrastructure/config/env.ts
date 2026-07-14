import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Default de DEV do segredo JWT — público (está no repo). Em produção é proibido.
const DEV_JWT_SECRET = "dev-secret-trocar-em-producao";

/** Configuração tipada e validada. Falha cedo (no boot) se algo obrigatório faltar. */
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),

  // API REST (/api) — autenticação e CORS.
  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  CORS_ORIGINS: z.string().default("*"),
  // Rota POST /dev/inbound (injeção fake de mensagem, sem auth) — SÓ para dev
  // local (dev-chat.ps1). Default false: em produção a rota nem existe (404).
  DEV_INBOUND_ENABLED: z.string().default("false").transform((v) => v === "true"),

  // IA — provedor-agnóstico (atrás de IAIProvider). Modelo por env, SEM hardcode de versão.
  AI_PROVIDER: z.enum(["openai"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  // IDs verificados na doc oficial em jun/2026 (família 5.4/5.5). Todos os modelos
  // atuais são multimodais, então o mesmo mini barato serve p/ chat e visão.
  // Disponibilidade varia por conta/tier — verdade-terreno: GET /v1/models.
  AI_MODEL_CHAT: z.string().default("gpt-5.4-mini"), // conversa (barato/rápido)
  AI_MODEL_VISION: z.string().default("gpt-5.4-mini"), // comprovante (visão); subir p/ gpt-5.5 só se errar
  // Teto de passos do loop de tools do cérebro (segurança + latência). Poucos passos
  // bastam: consultar agenda → propor → responder. Subir só se faltar passo.
  // int().positive(): um valor malformado (ex.: "abc"→NaN) FALHA no boot em vez de
  // virar stepCountIs(NaN), que nunca dispara e deixaria o loop sem teto de segurança.
  AI_MAX_STEPS: z.coerce.number().int().positive().default(4),

  // Mensageria — Evolution API (modo Baileys); REST + webhook.
  MESSAGING_PROVIDER: z.enum(["none", "evolution", "meta"]).default("evolution"),
  EVOLUTION_BASE_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().default("megus"),
  // Webhook do Evolution (mesma URL pra toda instância criada no provisionamento
  // multi-tenant) — hostname do serviço dentro da rede Docker do VPS.
  PUBLIC_WEBHOOK_URL: z.string().default("http://megus-app:3000/webhook/evolution"),

  // Fiscal e CPF — mock no MVP (não fala com um provedor real por ora).
  FISCAL_PROVIDER: z.enum(["mock", "erp"]).default("mock"),
  CPF_PROVIDER: z.enum(["mock", "serpro"]).default("mock"),
  // Comprovante: "openai" usa visão real; "mock" auto-aprova (SÓ demo/dev).
  COMPROVANTE_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  // Transcrição de áudio (voz→texto): "openai" usa audio.transcriptions real;
  // "mock" devolve texto fixo (SÓ demo/dev). Mesma OPENAI_API_KEY da visão.
  TRANSCRIBE_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  // Modelo de transcrição. gpt-4o-transcribe pela acurácia em números (CPF) em
  // PT-BR; whisper-1 é o fallback garantido se o modelo não estiver na conta.
  AI_MODEL_TRANSCRIBE: z.string().default("gpt-4o-transcribe"),
  // URL do PDF de demo servido pelo app; o mock fiscal devolve esta URL p/ o WhatsApp baixar.
  MOCK_NOTA_PDF_URL: z.string().optional(),

  // Regras de negócio (configuráveis).
  COMPROVANTE_MIN_CONFIDENCE: z.coerce.number().default(0.8),
  CPF_MAX_ATTEMPTS: z.coerce.number().default(2),

  // Piloto — número de WhatsApp da integração seed (E.164 sem +).
  PILOT_WHATSAPP_NUMBER: z.string().optional(),

  // Persistência (Task Azure SQL). Vazio = repos in-memory (demo). Formato Node (mssql).
  DATABASE_URL: z.string().optional(),

  // Ferramentas dinâmicas por empresa (Fase B — Composio/Google Calendar no loop
  // do Kaua). Tudo opcional: sem COMPOSIO_API_KEY, o toolsProvider nem é criado
  // (main.ts) e o comportamento é o de antes (Fase A intocada).
  COMPOSIO_API_KEY: z.string().optional(),
  COMPOSIO_GCAL_AUTH_CONFIG_ID: z.string().optional(),
  // TTL do cache de tools por empresa (s). int().positive(): valor malformado
  // (ex.: "abc"→NaN) FALHA no boot em vez de virar um cache que nunca expira
  // (mesmo raciocínio do AI_MAX_STEPS acima).
  COMPOSIO_TOOLS_TTL_S: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

// Fail-fast: com banco real (produção), o segredo JWT default (público, forjável)
// derrubaria o isolamento de tenant inteiro — melhor não subir do que subir aberto.
if (env.DATABASE_URL && env.JWT_SECRET === DEV_JWT_SECRET) {
  throw new Error(
    "JWT_SECRET obrigatório em produção: defina um segredo forte no .env (o default de dev é público e permite forjar tokens).",
  );
}
