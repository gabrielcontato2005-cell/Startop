// Todo dinheiro do sistema é inteiro em centavos. Só a tela formata em R$.

const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(centavos: number | bigint | null | undefined): string {
  return formatador.format(Number(centavos ?? 0) / 100).replace(/ /g, " ");
}

/** "98", "98,5", "1.234,56", "R$ 98,00" → centavos. Devolve null se não for um valor. */
export function lerReais(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  const limpo = texto.replace(/R\$|\s/g, "");
  if (limpo === "") return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Math.round(Number(normalizado) * 100);
}

/** Percentual de um valor em centavos, arredondado ao centavo (meio para cima). */
export function percentualDe(centavos: number, pct: number): number {
  return Math.round((centavos * pct) / 100);
}
