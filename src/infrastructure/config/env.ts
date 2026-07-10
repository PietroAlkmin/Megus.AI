import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/** Configuração tipada e validada. Falha cedo (no boot) se algo obrigatório faltar. */
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),

  // API REST (/api) — autenticação e CORS.
  JWT_SECRET: z.string().default("dev-secret-trocar-em-producao"),
  CORS_ORIGINS: z.string().default("*"),
  USE_MOCK_DATA: z.string().default("true").transform((v) => v === "true"),

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
  // URL do PDF de demo servido pelo app; o mock fiscal devolve esta URL p/ o WhatsApp baixar.
  MOCK_NOTA_PDF_URL: z.string().optional(),

  // Regras de negócio (configuráveis).
  COMPROVANTE_MIN_CONFIDENCE: z.coerce.number().default(0.8),
  CPF_MAX_ATTEMPTS: z.coerce.number().default(2),

  // Piloto — número de WhatsApp da integração seed (E.164 sem +).
  PILOT_WHATSAPP_NUMBER: z.string().optional(),

  // Persistência (Task Azure SQL). Vazio = repos in-memory (demo). Formato Node (mssql).
  DATABASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
