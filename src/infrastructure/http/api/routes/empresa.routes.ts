import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail } from "../result";
import type { AuthContext } from "../authMiddleware";
import type {
  ICompanyProfileRepository,
  ICompanyServiceRepository,
} from "../../../../domain/ports/repositories";

export interface EmpresaRoutesDeps {
  profiles: ICompanyProfileRepository;
  services: ICompanyServiceRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Perfil vazio padrão — quando a empresa ainda não preencheu nada.
function perfilVazio(companyId: string) {
  return {
    companyId,
    razaoSocial: "", nomeFantasia: "", cnpj: "", inscricaoMunicipal: "",
    email: "", telefone: "", cep: "", endereco: "", cidade: "", uf: "",
    pixTipo: "cnpj", pixChave: "", instrucoesPagamento: "",
    updatedAt: new Date(),
  };
}

const empresaSchema = z.object({
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().optional(),
  inscricaoMunicipal: z.string().optional(),
  email: z.string().optional(),
  telefone: z.string().optional(),
  cep: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  pixTipo: z.string().optional(),
  pixChave: z.string().optional(),
  instrucoesPagamento: z.string().optional(),
});

const servicoSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  nome: z.string().min(1, "Informe o nome do serviço."),
  iss: z.string().optional(),
  preco: z.coerce.number().optional(),
});

export function empresaRoutes(deps: EmpresaRoutesDeps): Router {
  const r = Router();

  // Todas as rotas de empresa exigem login.
  r.use(deps.authMiddleware);

  // GET /api/empresa — dados cadastrais + cobrança da empresa logada
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const profile = await deps.profiles.getByCompanyId(companyId);
    ok(res, profile ?? perfilVazio(companyId));
  });

  // PUT /api/empresa — salva os dados cadastrais
  r.put("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const parsed = empresaSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    const profile = { ...perfilVazio(companyId), ...parsed.data, companyId, updatedAt: new Date() };
    await deps.profiles.save(profile);
    ok(res, profile, "Dados da empresa salvos.");
  });

  // GET /api/empresa/servicos — catálogo de serviços (NFS-e)
  r.get("/servicos", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const list = await deps.services.listByCompanyId(companyId);
    ok(res, list.map((s) => ({ id: s.id, code: s.code, nome: s.nome, iss: s.iss, preco: s.preco })));
  });

  // POST /api/empresa/servicos — cria ou atualiza um serviço
  r.post("/servicos", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const parsed = servicoSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    const d = parsed.data;
    const id = d.id && d.id.trim() ? d.id : "svc_" + randomUUID().slice(0, 8);
    const service = {
      id, companyId,
      code: d.code ?? "", nome: d.nome, iss: d.iss ?? "", preco: d.preco ?? 0,
    };
    await deps.services.save(service);
    ok(res, { id: service.id, code: service.code, nome: service.nome, iss: service.iss, preco: service.preco });
  });

  // DELETE /api/empresa/servicos/:id — exclui um serviço
  r.delete("/servicos/:id", async (req: Request, res: Response) => {
      const { companyId } = req.auth as AuthContext;
      const id = String(req.params.id ?? "");
      if (!id) {
        fail(res, "Serviço não informado.", 400, "VALIDATION");
        return;
      }
      await deps.services.delete(companyId, id);
      ok(res, { id });
    });

  return r;
}