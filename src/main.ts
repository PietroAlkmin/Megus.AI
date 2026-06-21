import pino from "pino";
import { env } from "./infrastructure/config/env";
import { MockCpfProvider } from "./infrastructure/cpf/MockCpfProvider";
import { MockFiscalProvider } from "./infrastructure/fiscal/MockFiscalProvider";
import { NullMessagingProvider } from "./infrastructure/messaging/NullMessagingProvider";

/**
 * Composition root: monta as dependências (DI manual) e sobe o serviço.
 *
 * Estado atual = ESQUELETO. Ligado: config, logger, providers MOCK (fiscal/CPF),
 * mensageria NULL (placeholder). Falta:
 *   - adapter de mensageria real → pesquisa wr80xu2as
 *   - persistência (Postgres)    → confirmação de infra
 *   - loop do Kaua (Seção 2)     → design a aprovar
 *   - HTTP/SSE para o front      → depois
 */
async function bootstrap(): Promise<void> {
  const logger = pino({ level: env.LOG_LEVEL });

  // Providers — mocks por ora, mesma porta dos reais.
  const fiscal = new MockFiscalProvider();
  const cpf = new MockCpfProvider(); // seed vazio: configurar no teste/integração
  const messaging = new NullMessagingProvider();

  void fiscal;
  void cpf;
  void messaging;

  logger.info(
    {
      messagingProvider: env.MESSAGING_PROVIDER,
      fiscalProvider: env.FISCAL_PROVIDER,
      cpfProvider: env.CPF_PROVIDER,
    },
    "Megus AI — esqueleto no ar. Pendente: mensageria (pesquisa), persistência e loop do Kaua (Seção 2).",
  );
}

bootstrap().catch((err) => {
  console.error("Falha no boot do Megus AI:", err);
  process.exit(1);
});
