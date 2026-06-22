/**
 * Gera um PDF de NOTA de DEMONSTRAÇÃO, válido e sem dependências.
 * Os offsets da xref são calculados em runtime (garante PDF bem-formado).
 * Usado só enquanto o fiscal é mock — em produção a URL vem do provedor real.
 */
export function buildNotaPdf(): Buffer {
  const esc = (s: string): string => s.replace(/[()\\]/g, (m) => "\\" + m);
  const linhas = [
    "MEGUS AI - NOTA FISCAL DE SERVICO (DEMO)",
    "",
    "Prestador: Consultorio (piloto)",
    "Servico: Massagem",
    "Valor: R$ 180,00",
    "",
    "Documento de demonstracao - sem validade fiscal.",
  ];
  const content =
    "BT /F1 13 Tf 40 230 Td 20 TL " +
    linhas.map((l) => `(${esc(l)}) Tj T*`).join(" ") +
    " ET";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 595 300] >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
