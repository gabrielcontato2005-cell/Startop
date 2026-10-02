import { describe, expect, it } from "vitest";
import { foraDoRaio, pedidoMinimo, taxaEntregaSugerida } from "@/lib/regras/entrega";
import { config } from "./fixtures";

describe("pedido mínimo por distância (1 caixa a cada 5 km)", () => {
  it.each([
    [0, 1],
    [3, 1],
    [5, 1],
    [5.1, 2],
    [30, 6],
    [31, 7],
  ])("%s km → %s caixas", (km, caixas) => {
    expect(pedidoMinimo(km, config)).toBe(caixas);
  });

  it("respeita km por caixa alterado", () => {
    expect(pedidoMinimo(30, { ...config, km_por_caixa: 10 })).toBe(3);
    expect(pedidoMinimo(30, { ...config, km_por_caixa: 3 })).toBe(10);
  });

  it("sem distância cadastrada não calcula mínimo", () => {
    expect(pedidoMinimo(null, config)).toBeNull();
  });

  it("acima do raio máximo não entrega", () => {
    expect(foraDoRaio(61, config)).toBe(true);
    expect(foraDoRaio(60, config)).toBe(false);
    expect(foraDoRaio(500, { ...config, raio_max_km: null })).toBe(false);
  });
});

describe("taxa de entrega sugerida", () => {
  it("por km, arredondada para o real", () => {
    expect(taxaEntregaSugerida(12, { ...config, taxa_entrega_por_km_centavos: 150 })).toBe(1800);
    expect(taxaEntregaSugerida(12.3, { ...config, taxa_entrega_por_km_centavos: 150 })).toBe(1800); // R$ 18,45 → R$ 18
    expect(taxaEntregaSugerida(12.4, { ...config, taxa_entrega_por_km_centavos: 150 })).toBe(1900); // R$ 18,60 → R$ 19
  });

  it("por faixa", () => {
    const cfg = {
      ...config,
      taxa_entrega_modo: "por_faixa" as const,
      taxa_entrega_faixas: [
        { ate_km: 20, valor_centavos: 2000 },
        { ate_km: 10, valor_centavos: 1000 },
        { ate_km: 40, valor_centavos: 3500 },
      ],
    };
    expect(taxaEntregaSugerida(5, cfg)).toBe(1000);
    expect(taxaEntregaSugerida(10, cfg)).toBe(1000);
    expect(taxaEntregaSugerida(15, cfg)).toBe(2000);
    expect(taxaEntregaSugerida(80, cfg)).toBe(3500); // passou da última faixa: usa a última
  });

  it("sem distância ou sem valor configurado é zero", () => {
    expect(taxaEntregaSugerida(null, config)).toBe(0);
    expect(taxaEntregaSugerida(20, { ...config, taxa_entrega_por_km_centavos: 0 })).toBe(0);
  });
});
