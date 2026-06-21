import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/** Configuração tipada e validada. Falha cedo (no boot) se algo obrigatório faltar. */
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),

  // IA — provedor-agnóstico (atrás de IAIProvider). Modelo por env, SEM hardcode de versão.
  AI_PROVIDER: z.enum(["openai"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL_CHAT: z.string().default("gpt-5.4-mini"), // conversa (barato/rápido) — ajustar ao id vigente
  AI_MODEL_VISION: z.string().default("gpt-5.5"), // comprovante (visão) — ajustar ao id vigente

  // Mensageria — Evolution API (modo Baileys); REST + webhook.
  MESSAGING_PROVIDER: z.enum(["none", "evolution", "meta"]).default("evolution"),
  EVOLUTION_BASE_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().default("megus"),

  // Fiscal e CPF — mock no MVP (não fala com a Kapty por ora).
  FISCAL_PROVIDER: z.enum(["mock", "kapty"]).default("mock"),
  CPF_PROVIDER: z.enum(["mock", "serpro"]).default("mock"),

  // Regras de negócio (configuráveis).
  COMPROVANTE_MIN_CONFIDENCE: z.coerce.number().default(0.8),
  CPF_MAX_ATTEMPTS: z.coerce.number().default(2),

  // Persistência (Task Azure SQL). Vazio = repos in-memory (demo). Formato Node (mssql).
  DATABASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
