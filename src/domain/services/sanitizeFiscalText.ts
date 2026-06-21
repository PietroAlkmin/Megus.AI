/** Remove caracteres perigosos para XML/fiscal e limita o tamanho. */
export function sanitizeFiscalText(s: string): string {
  return (s ?? "").replace(/[<>&"']/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}
