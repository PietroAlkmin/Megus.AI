import { useCallback, useEffect, useState } from "react";

export type Tema = "creme" | "salvia";

const TEMA_KEY = "megus_tema";

/**
 * Tema da marca — `creme` (gesto grafite, sóbrio) ou `salvia` (gesto verde).
 *
 * Os dois são oficiais: a identidade tem um modo neutro e um modo verde, e só
 * a cor do GESTO muda entre eles (token `--gesto` em `index.css`). Nenhuma outra
 * cor da paleta é afetada — não é dark mode.
 *
 * Aplicado em `document.documentElement[data-theme]` e persistido no localStorage.
 */
export function useTema() {
  const [tema, setTemaState] = useState<Tema>(() => {
    const salvo = localStorage.getItem(TEMA_KEY);
    return salvo === "salvia" ? "salvia" : "creme";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
  }, [tema]);

  const setTema = useCallback((novo: Tema) => {
    localStorage.setItem(TEMA_KEY, novo);
    setTemaState(novo);
  }, []);

  return { tema, setTema };
}
