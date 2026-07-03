import "dotenv/config";
import sql from "mssql";

function parse(url) {
  const s = url.replace(/^sqlserver:\/\//, "");
  const [hp, ...pares] = s.split(";");
  const [server, porta] = hp.split(":");
  const o = {};
  for (const p of pares) { const [k, v] = p.split("="); if (k) o[k.trim().toLowerCase()] = (v ?? "").trim(); }
  return { server, port: porta ? Number(porta) : 1433, database: o["database"], user: o["user"], password: o["password"], options: { encrypt: o["encrypt"] !== "false", trustServerCertificate: false } };
}

async function main() {
  const pool = await sql.connect(parse(process.env.DATABASE_URL));
  console.log("Conectado.\n");
  const t = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  for (const row of t.recordset) {
    const tabela = row.TABLE_NAME;
    let n = "?";
    try { const c = await pool.request().query(`SELECT COUNT(*) AS n FROM [${tabela}]`); n = c.recordset[0].n; } catch {}
    console.log("=".repeat(60));
    console.log(`TABELA: ${tabela}  (linhas: ${n})`);
    const cols = await pool.request().input("t", sql.NVarChar, tabela).query("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t ORDER BY ORDINAL_POSITION");
    for (const c of cols.recordset) {
      const tam = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : "";
      console.log(`  - ${c.COLUMN_NAME}: ${c.DATA_TYPE}${tam} ${c.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL"}`);
    }
  }
  await pool.close();
}
main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
