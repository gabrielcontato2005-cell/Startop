export type ConfigEntrega = {
  km_por_caixa: number;
  pedido_minimo_piso: number;
  raio_max_km: number | null;
  taxa_entrega_modo: "por_km" | "por_faixa";
  taxa_entrega_por_km_centavos: number;
  taxa_entrega_faixas: { ate_km: number; valor_centavos: number }[];
};

/**
 * Pedido mínimo de caixas para entrega: 1 caixa a cada `km_por_caixa` km, arredondado para cima.
 * 30 km → 6; 31 km → 7; 3 km → 1. Sem distância conhecida → null (o sistema só avisa).
 */
export function pedidoMinimo(distanciaKm: number | null, cfg: Pick<ConfigEntrega, "km_por_caixa" | "pedido_minimo_piso">): number | null {
  if (distanciaKm == null || Number.isNaN(distanciaKm)) return null;
  // arredonda a divisão a 6 casas antes do ceil para 30 / 5 não virar 6,0000001
  const caixas = Math.ceil(Number((distanciaKm / cfg.km_por_caixa).toFixed(6)));
  return Math.max(cfg.pedido_minimo_piso, caixas);
}

export function foraDoRaio(distanciaKm: number | null, cfg: Pick<ConfigEntrega, "raio_max_km">): boolean {
  return distanciaKm != null && cfg.raio_max_km != null && distanciaKm > cfg.raio_max_km;
}

/** Taxa sugerida pela distância, arredondada para o real. O valor final pode ser alterado no pedido. */
export function taxaEntregaSugerida(distanciaKm: number | null, cfg: ConfigEntrega): number {
  if (distanciaKm == null || distanciaKm <= 0) return 0;
  let centavos: number;
  if (cfg.taxa_entrega_modo === "por_faixa") {
    const faixas = [...cfg.taxa_entrega_faixas].sort((a, b) => a.ate_km - b.ate_km);
    const faixa = faixas.find((f) => distanciaKm <= f.ate_km) ?? faixas.at(-1);
    centavos = faixa?.valor_centavos ?? 0;
  } else {
    centavos = distanciaKm * cfg.taxa_entrega_por_km_centavos;
  }
  return Math.round(centavos / 100) * 100;
}
