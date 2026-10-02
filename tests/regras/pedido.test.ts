import { describe, expect, it } from "vitest";
import { calcularPedido, custoMedio, lucroPedido, precoDeCusto, type EntradaPedido } from "@/lib/regras/pedido";
import { config, produtos, regraStarTop } from "./fixtures";

const base: EntradaPedido = { itens: [], tipo: "retirada", forma_pagamento: "pix", distancia_km: null };
const calc = (e: Partial<EntradaPedido>, regras = [regraStarTop]) => calcularPedido({ ...base, ...e }, produtos, regras, config);

describe("desconto de volume (R$ 2 por caixa de açaí 10 L a partir de 10)", () => {
  it("9 caixas de 10 L: sem desconto", () => {
    const p = calc({ itens: [{ produto_id: "banana10", quantidade: 9 }] });
    expect(p.desconto_centavos).toBe(0);
    expect(p.total_centavos).toBe(9 * 9800);
  });

  it("10 caixas, sabores e linhas somados: desconto em todas", () => {
    const p = calc({
      itens: [
        { produto_id: "banana10", quantidade: 4 },
        { produto_id: "morango10", quantidade: 3 },
        { produto_id: "nutella10", quantidade: 3 },
      ],
    });
    expect(p.desconto_centavos).toBe(10 * 200);
    expect(p.subtotal_centavos).toBe(7 * 9800 + 3 * 10300);
    expect(p.total_centavos).toBe(7 * 9800 + 3 * 10300 - 2000);
    expect(p.itens.find((i) => i.produto_id === "nutella10")?.desconto_centavos).toBe(600);
  });

  it("açaí 5 L e sorvete não contam nem recebem desconto", () => {
    const p = calc({
      itens: [
        { produto_id: "banana10", quantidade: 9 },
        { produto_id: "banana5", quantidade: 5 },
        { produto_id: "flocos10", quantidade: 5 },
      ],
    });
    expect(p.desconto_centavos).toBe(0);

    const q = calc({
      itens: [
        { produto_id: "banana10", quantidade: 10 },
        { produto_id: "flocos10", quantidade: 5 },
      ],
    });
    expect(q.desconto_centavos).toBe(2000);
    expect(q.itens.find((i) => i.produto_id === "flocos10")?.desconto_centavos).toBe(0);
  });

  it("regra desligada não aplica", () => {
    const p = calc({ itens: [{ produto_id: "banana10", quantidade: 20 }] }, [{ ...regraStarTop, ativa: false }]);
    expect(p.desconto_centavos).toBe(0);
  });

  it("só no excedente, quando configurado", () => {
    const p = calc({ itens: [{ produto_id: "banana10", quantidade: 12 }] }, [{ ...regraStarTop, aplica_em: "so_excedente" }]);
    expect(p.desconto_centavos).toBe(2 * 200);
  });

  it("percentual", () => {
    const p = calc({ itens: [{ produto_id: "banana10", quantidade: 10 }] }, [{ ...regraStarTop, tipo: "percentual", valor: 5 }]);
    expect(p.desconto_centavos).toBe(10 * 490);
  });

  it("itens repetidos são somados e zerados descartados", () => {
    const p = calc({
      itens: [
        { produto_id: "banana10", quantidade: 6 },
        { produto_id: "banana10", quantidade: 4 },
        { produto_id: "morango10", quantidade: 0 },
      ],
    });
    expect(p.itens).toHaveLength(1);
    expect(p.total_caixas).toBe(10);
    expect(p.desconto_centavos).toBe(2000);
  });
});

describe("entrega, taxa e pedido mínimo no pedido", () => {
  it("entrega a 30 km pede 6 caixas", () => {
    const p = calc({ tipo: "entrega", distancia_km: 30, itens: [{ produto_id: "banana10", quantidade: 5 }] });
    expect(p.pedido_minimo).toBe(6);
    expect(p.abaixo_do_minimo).toBe(true);
    const q = calc({ tipo: "entrega", distancia_km: 30, itens: [{ produto_id: "banana10", quantidade: 6 }] });
    expect(q.abaixo_do_minimo).toBe(false);
  });

  it("toda caixa conta 1 no mínimo, de qualquer tamanho", () => {
    const p = calc({
      tipo: "entrega",
      distancia_km: 15,
      itens: [
        { produto_id: "banana5", quantidade: 1 },
        { produto_id: "flocos10", quantidade: 1 },
        { produto_id: "banana10", quantidade: 1 },
      ],
    });
    expect(p.pedido_minimo).toBe(3);
    expect(p.abaixo_do_minimo).toBe(false);
  });

  it("retirada não tem mínimo nem taxa", () => {
    const p = calc({ tipo: "retirada", distancia_km: 30, taxa_entrega_centavos: 5000, itens: [{ produto_id: "banana10", quantidade: 1 }] });
    expect(p.pedido_minimo).toBeNull();
    expect(p.abaixo_do_minimo).toBe(false);
    expect(p.taxa_entrega_centavos).toBe(0);
  });

  it("taxa sugerida pela distância e alterada à mão fica com os dois valores", () => {
    const sugerida = calc({ tipo: "entrega", distancia_km: 12, itens: [{ produto_id: "banana10", quantidade: 3 }] });
    expect(sugerida.taxa_entrega_sugerida_centavos).toBe(1200);
    expect(sugerida.taxa_entrega_centavos).toBe(1200);
    expect(sugerida.total_centavos).toBe(3 * 9800 + 1200);

    const alterada = calc({ tipo: "entrega", distancia_km: 12, taxa_entrega_centavos: 1500, itens: [{ produto_id: "banana10", quantidade: 3 }] });
    expect(alterada.taxa_entrega_sugerida_centavos).toBe(1200);
    expect(alterada.taxa_entrega_centavos).toBe(1500);
    expect(alterada.total_centavos).toBe(3 * 9800 + 1500);
  });

  it("mínimo manual do cliente sobrepõe a distância", () => {
    const p = calc({ tipo: "entrega", distancia_km: 30, pedido_minimo_manual: 2, itens: [{ produto_id: "banana10", quantidade: 2 }] });
    expect(p.pedido_minimo).toBe(2);
    expect(p.abaixo_do_minimo).toBe(false);
  });

  it("acima do raio máximo marca fora do raio", () => {
    expect(calc({ tipo: "entrega", distancia_km: 70, itens: [{ produto_id: "banana10", quantidade: 20 }] }).fora_do_raio).toBe(true);
  });
});

describe("acréscimo do cartão (10%)", () => {
  it("sobre produtos com desconto mais a taxa, arredondado ao centavo", () => {
    const p = calc({
      tipo: "entrega",
      distancia_km: 12,
      forma_pagamento: "cartao_credito",
      itens: [{ produto_id: "banana10", quantidade: 10 }],
    });
    const base = 10 * 9800 - 2000 + 1200;
    expect(p.acrescimo_cartao_centavos).toBe(Math.round(base * 0.1));
    expect(p.total_centavos).toBe(base + Math.round(base * 0.1));
  });

  it("arredonda meio centavo para cima", () => {
    // 3 × R$ 55,00 = R$ 165,00 → 10% = R$ 16,50 exatos; 1 × R$ 0,05 → 0,5 centavo → 1 centavo
    const p = calcularPedido(
      { ...base, forma_pagamento: "cartao_credito", itens: [{ produto_id: "x", quantidade: 1 }] },
      new Map([["x", { id: "x", linha_id: "l", tamanho_litros: 5, preco_centavos: 5 }]]),
      [],
      config,
    );
    expect(p.acrescimo_cartao_centavos).toBe(1);
    expect(Number.isInteger(p.total_centavos)).toBe(true);
  });

  it("não existe em Pix e dinheiro", () => {
    expect(calc({ forma_pagamento: "pix", itens: [{ produto_id: "banana10", quantidade: 3 }] }).acrescimo_cartao_centavos).toBe(0);
    expect(calc({ forma_pagamento: "dinheiro", itens: [{ produto_id: "banana10", quantidade: 3 }] }).acrescimo_cartao_centavos).toBe(0);
  });
});

describe("horário de funcionamento (8:00 às 17:00)", () => {
  it.each([
    ["07:59", true],
    ["08:00", false],
    ["12:30", false],
    ["17:00", false],
    ["17:01", true],
  ])("%s fora do horário? %s", (hora, fora) => {
    expect(calc({ hora_agendada: hora, itens: [{ produto_id: "banana10", quantidade: 1 }] }).fora_do_horario).toBe(fora);
  });
});

describe("lucro e custo", () => {
  it("açaí 10 L dá R$ 15 por caixa nas duas linhas; demais R$ 10", () => {
    expect(lucroPedido(9800, [{ quantidade: 1, custo_unitario_centavos: 8300 }])).toBe(1500);
    expect(lucroPedido(10300, [{ quantidade: 1, custo_unitario_centavos: 8800 }])).toBe(1500);
    expect(lucroPedido(5500 + 7000, [
      { quantidade: 1, custo_unitario_centavos: 4500 },
      { quantidade: 1, custo_unitario_centavos: 6000 },
    ])).toBe(2000);
  });

  it("custo médio ponderado na entrada de lote", () => {
    expect(custoMedio(0, 8300, 100, 8000)).toBe(8000);
    expect(custoMedio(100, 8300, 100, 8000)).toBe(8150);
    expect(custoMedio(-3, 8300, 10, 8000)).toBe(8000);
  });

  it("nenhum valor com fração de centavo", () => {
    const p = calc({
      tipo: "entrega",
      distancia_km: 17.3,
      forma_pagamento: "cartao_credito",
      itens: [
        { produto_id: "banana10", quantidade: 7 },
        { produto_id: "nutella10", quantidade: 5 },
        { produto_id: "flocos10", quantidade: 3 },
      ],
    }, [{ ...regraStarTop, tipo: "percentual", valor: 3.3 }]);
    for (const v of [p.subtotal_centavos, p.desconto_centavos, p.taxa_entrega_centavos, p.acrescimo_cartao_centavos, p.total_centavos]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    p.itens.forEach((i) => expect(Number.isInteger(i.total_centavos)).toBe(true));
  });
});

describe("loja própria a preço de custo", () => {
  const custos = new Map([["banana10", 8300], ["nutella10", 8800], ["flocos10", 6000]]);
  const proprio = precoDeCusto(produtos, custos);

  it("cobra o custo de cada caixa, sem desconto de volume, e o lucro fica zero", () => {
    const p = calcularPedido(
      { ...base, itens: [{ produto_id: "banana10", quantidade: 8 }, { produto_id: "nutella10", quantidade: 4 }, { produto_id: "flocos10", quantidade: 1 }] },
      proprio.produtos,
      proprio.regras,
      config,
    );
    expect(p.desconto_centavos).toBe(0);
    expect(p.total_centavos).toBe(8 * 8300 + 4 * 8800 + 6000);
    const itensComCusto = p.itens.map((i) => ({ quantidade: i.quantidade, custo_unitario_centavos: custos.get(i.produto_id)! }));
    expect(lucroPedido(p.total_centavos, itensComCusto)).toBe(0);
  });

  it("entrega sem pedido mínimo", () => {
    const p = calcularPedido(
      { ...base, tipo: "entrega", distancia_km: 30, pedido_minimo_manual: proprio.pedido_minimo_manual, itens: [{ produto_id: "banana10", quantidade: 1 }] },
      proprio.produtos,
      proprio.regras,
      config,
    );
    expect(p.abaixo_do_minimo).toBe(false);
  });

  it("não mexe no catálogo normal", () => {
    expect(produtos.get("banana10")!.preco_centavos).toBe(9800);
  });
});
