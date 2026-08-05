import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { createApiApp } from "../../src/infrastructure/http/api/app";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { IWhatsAppProvisioner } from "../../src/domain/ports/IWhatsAppProvisioner";

/**
 * Gravação PARCIAL não pode apagar o resto do cadastro.
 *
 * Falha real (05/08, ao vivo com a clínica): o handler montava o perfil a
 * partir de um objeto VAZIO e só depois aplicava o corpo da requisição — todo
 * campo ausente virava string vazia. Salvar a descrição da chave apagava a
 * chave, o endereço e o CNPJ. Todos os campos do schema são opcionais
 * justamente para permitir gravação parcial; o handler é que não honrava.
 */
const JWT_SECRET = "test-secret-empresa";
const provisioner: IWhatsAppProvisioner = { provision: vi.fn(), status: vi.fn(), disconnect: vi.fn() };

function listen(app: ReturnType<typeof createApiApp>): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ port: (server.address() as { port: number }).port, server }));
  });
}

const token = jwt.sign({ sub: "u1", companyId: "c1", email: "time@megus.ai" }, JWT_SECRET);

describe("PUT /api/empresa — gravação parcial", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function sobe() {
    const repos = new InMemoryRepositories();
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const l = await listen(app);
    server = l.server;
    return { repos, url: `http://localhost:${l.port}` };
  }

  const salvar = (url: string, body: Record<string, unknown>) =>
    fetch(`${url}/api/empresa`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  const ler = async (url: string): Promise<Record<string, string>> => {
    const r = await fetch(`${url}/api/empresa`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await r.json()) as { data: Record<string, string> };
    return body.data;
  };

  it("salvar UM campo preserva todos os outros", async () => {
    const { url } = await sobe();
    await salvar(url, { name: "Clínica Sorriso", pixType: "cnpj", pixKey: "28756515000135", address: "Av. X, 100" });

    // Exatamente o caso ao vivo: só a descrição da chave.
    await salvar(url, { pixDescricao: "conta da clínica" });

    const e = await ler(url);
    expect(e.pixDescricao).toBe("conta da clínica");
    expect(e.pixKey).toBe("28756515000135"); // não pode ter sumido
    expect(e.pixType).toBe("cnpj");
    expect(e.name).toBe("Clínica Sorriso");
    expect(e.address).toBe("Av. X, 100");
  });

  it("apagar de propósito continua funcionando (string vazia é intenção, ausência não)", async () => {
    const { url } = await sobe();
    await salvar(url, { pixKey: "28756515000135" });
    await salvar(url, { pixKey: "" });
    expect((await ler(url)).pixKey).toBe("");
  });

  it("as duas chaves convivem: gravar a de nota não mexe na principal", async () => {
    const { url } = await sobe();
    await salvar(url, { pixType: "cpf", pixKey: "54625255830", pixDescricao: "conta pessoal" });
    await salvar(url, { pixTypeNota: "cnpj", pixKeyNota: "28756515000135", pixDescricaoNota: "conta PJ" });

    const e = await ler(url);
    expect(e.pixKey).toBe("54625255830");
    expect(e.pixDescricao).toBe("conta pessoal");
    expect(e.pixKeyNota).toBe("28756515000135");
    expect(e.pixDescricaoNota).toBe("conta PJ");
  });
});
