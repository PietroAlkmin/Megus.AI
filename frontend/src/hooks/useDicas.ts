import { useCallback, useState } from "react";

const DICAS_KEY = "megus_dicas_vistas";

export type DicaId = "hoje" | "financeiro" | "conversas" | "agentes";

function ler(): DicaId[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(DICAS_KEY) ?? "[]");
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

/**
 * Dicas contextuais — aparecem na PRIMEIRA visita a uma tela, não num tour.
 *
 * Padrão emprestado do Front (as "FRONT TIP"): em vez de arrastar o usuário por
 * 8 balões no primeiro login, a dica espera ele chegar na tela onde ela faz
 * sentido. Custo de atenção menor e o texto chega no momento em que é útil.
 *
 * Persistido no localStorage: dispensou, não volta.
 */
export function useDicas() {
  const [vistas, setVistas] = useState<DicaId[]>(ler);

  const marcar = useCallback((id: DicaId) => {
    setVistas((atual) => {
      if (atual.includes(id)) return atual;
      const proximo = [...atual, id];
      localStorage.setItem(DICAS_KEY, JSON.stringify(proximo));
      return proximo;
    });
  }, []);

  return { vistas, marcar, jaViu: (id: DicaId) => vistas.includes(id) };
}
