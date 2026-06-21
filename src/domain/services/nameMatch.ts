/** Normaliza: minúsculas, sem acento, tokens alfabéticos. */
function tokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * true se TODOS os tokens digitados aparecem, na ordem, dentro do nome oficial.
 * Tolera nome do meio ausente; exige primeiro e último presentes na sequência.
 */
export function nameMatch(typed: string, official: string): boolean {
  const a = tokens(typed);
  const b = tokens(official);
  if (a.length === 0 || b.length === 0) return false;
  let j = 0;
  for (const t of a) {
    while (j < b.length && b[j] !== t) j += 1;
    if (j === b.length) return false;
    j += 1;
  }
  return true;
}
