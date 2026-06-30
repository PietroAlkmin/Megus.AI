import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { makeAuthMiddleware } from "./authMiddleware";
import { authRoutes } from "./routes/auth.routes";
import { RegisterUser } from "../../../application/use-cases/auth/RegisterUser";
import { LoginUser } from "../../../application/use-cases/auth/LoginUser";
import type { InMemoryRepositories } from "../../persistence/memory/InMemoryRepositories";
import { empresaRoutes } from "./routes/empresa.routes";
import { atendimentosRoutes } from "./routes/atendimentos.routes";
import { createConversasRouters } from "./routes/conversas.routes";

export interface ApiDeps {
  repos: InMemoryRepositories;
  jwtSecret: string;
  /** origens permitidas no CORS (ex.: a URL do front no Vercel). "*" em dev. */
  corsOrigins: string[] | "*";
  /** quando true, rotas de painel devolvem dados de exemplo (USE_MOCK_DATA). */
  useMock: boolean;
}

/**
 * Monta o app Express da API REST (/api/*). É montado DENTRO do servidor http
 * existente (ver server.ts) — as rotas legadas (/webhook, /qr, /dev/inbound,
 * /health) continuam no http nativo; só a /api nova é Express.
 */
export function createApiApp(deps: ApiDeps): Express {
  const app = express();

  app.use(express.json({ limit: "5mb" }));
  app.use(cors({
    origin: deps.corsOrigins,
    credentials: true,
  }));

  const authMiddleware = makeAuthMiddleware(deps.jwtSecret);

  // Casos de uso (DI manual, como no main.ts)
  const registerUser = new RegisterUser(deps.repos.users);
  const loginUser = new LoginUser({ users: deps.repos.users, jwtSecret: deps.jwtSecret });

  // Rotas
  app.use("/api/auth", authRoutes({ registerUser, loginUser, users: deps.repos.users, authMiddleware }));

  app.use("/api/empresa", empresaRoutes({
    profiles: deps.repos.companyProfiles,
    services: deps.repos.companyServices,
    authMiddleware,
  }));

  app.use("/api/agentes", atendimentosRoutes({
    useMock: deps.useMock,
    integrations: deps.repos.integrations,
    conversations: deps.repos.conversations,
    emissions: deps.repos.emissions,
    authMiddleware,
  }));

  // Conversas: dois routers (um em /api/agentes para .../conversas, outro em /api/conversas)
  const conversas = createConversasRouters({
    useMock: deps.useMock,
    conversations: deps.repos.conversations,
    authMiddleware,
  });
  app.use("/api/agentes", conversas.agentesRouter);
  app.use("/api/conversas", conversas.conversasRouter);

  // 404 da API em formato ResultResponse
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({
      success: false, data: null, message: "Rota não encontrada.",
      errors: ["NOT_FOUND"], correlationId: null, statusCode: 404,
    });
  });

  return app;
}