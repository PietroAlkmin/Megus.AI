/**
 * Script de teste de conexão ao Azure SQL — isolado, não mexe no sistema.
 *
 * O que faz: lê DATABASE_URL do .env, conecta, lista as tabelas existentes e sai.
 * Serve para provar que o backend consegue falar com o banco antes de escrever
 * qualquer repositório.
 *
 * Rodar:  npx tsx scripts/test-db.ts
 */
import "dotenv/config";
import sql from "mssql";

// Faz o parse do formato: sqlserver://HOST:PORT;database=DB;user=U;password=P;encrypt=true
function parseConnectionString(url: string): sql.config {
  const semPrefixo = url.replace(/^sqlserver:\/\//, "");
  const [hostPorta, ...pares] = semPrefixo.split(";");
  const [server, portaStr] = hostPorta.split(":");
  const opts: Record<string, string> = {};
  for (const par of pares) {
    const [k, v] = par.split("=");
    if (k) opts[k.trim().toLowerCase()] = (v ?? "").trim();
  }
  return {
    server,
    port: portaStr ? Number(portaStr) : 1433,
    database: opts["database"],
    user: opts["user"],
    password: opts["password"],
    options: {
      encrypt: opts["encrypt"] !== "false", // Azure exige encrypt
      trustServerCertificate: false,
    },
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL não está no .env");
    process.exit(1);
  }

  const config = parseConnectionString(url);
  console.log(`🔌 Conectando em ${config.server}:${config.port} / banco "${config.database}"…`);

  try {
    const pool = await sql.connect(config);
    console.log("✅ Conectado ao Azure SQL com sucesso!\n");

    const result = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    const tabelas = result.recordset.map((r) => r.TABLE_NAME);
    if (tabelas.length === 0) {
      console.log("📭 O banco está VAZIO — nenhuma tabela ainda.");
      console.log("   (esperado: as tabelas serão criadas na próxima etapa)");
    } else {
      console.log(`📋 Tabelas encontradas (${tabelas.length}):`);
      tabelas.forEach((t) => console.log("   -", t));
    }

    await pool.close();
    console.log("\n🏁 Teste concluído. A conexão funciona.");
  } catch (err) {
    console.error("\n❌ Falha ao conectar:");
    console.error(err instanceof Error ? err.message : err);
    console.error("\nCausas comuns:");
    console.error(" - firewall do Azure não liberou seu IP (portal → SQL → Networking)");
    console.error(" - usuário/senha incorretos no .env");
    console.error(" - o valor de 'encrypt' precisa ser true no Azure");
    process.exit(1);
  }
}

main();