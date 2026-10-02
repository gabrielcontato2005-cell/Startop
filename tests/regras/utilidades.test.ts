import { describe, expect, it } from "vitest";
import { formatarReais, lerReais } from "@/lib/regras/dinheiro";
import { hojeSP } from "@/lib/regras/horario";
import { lerCsv, lerTexto, lerVcf, separarDuplicados } from "@/lib/regras/importacao";
import { textoResumoPedido } from "@/lib/regras/resumo";
import { formatarWhatsapp, linkWhatsapp, normalizarWhatsapp } from "@/lib/regras/telefone";

describe("dinheiro", () => {
  it("formata em R$", () => {
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(formatarReais(9800)).toBe("R$ 98,00");
    expect(formatarReais(0)).toBe("R$ 0,00");
  });

  it("lê valores digitados", () => {
    expect(lerReais("98")).toBe(9800);
    expect(lerReais("98,5")).toBe(9850);
    expect(lerReais("1.234,56")).toBe(123456);
    expect(lerReais("R$ 103,00")).toBe(10300);
    expect(lerReais("12.5")).toBe(1250);
    expect(lerReais("abc")).toBeNull();
    expect(lerReais("")).toBeNull();
  });
});

describe("fuso de São Paulo", () => {
  it("às 23h30 de SP ainda é o mesmo dia, mesmo já sendo outro dia em UTC", () => {
    expect(hojeSP(new Date("2026-10-03T02:30:00Z"))).toBe("2026-10-02");
    expect(hojeSP(new Date("2026-10-03T03:30:00Z"))).toBe("2026-10-03");
  });
});

describe("WhatsApp", () => {
  it("normaliza formatos comuns", () => {
    expect(normalizarWhatsapp("(21) 99999-8888")).toBe("5521999998888");
    expect(normalizarWhatsapp("+55 21 99999-8888")).toBe("5521999998888");
    expect(normalizarWhatsapp("021 99999 8888")).toBe("5521999998888");
    expect(normalizarWhatsapp("99999-8888")).toBe("5521999998888");
    expect(normalizarWhatsapp("21 9999-8888")).toBe("5521999998888");
    expect(normalizarWhatsapp("21 2688-1234")).toBe("552126881234");
    expect(normalizarWhatsapp("123")).toBeNull();
  });

  it("formata e monta link", () => {
    expect(formatarWhatsapp("5521999998888")).toBe("(21) 99999-8888");
    expect(linkWhatsapp("5521999998888", "Olá, tudo bem?")).toBe("https://wa.me/5521999998888?text=Ol%C3%A1%2C%20tudo%20bem%3F");
  });
});

describe("importação de clientes", () => {
  it("CSV com ponto e vírgula, aspas e acentos no cabeçalho", () => {
    const r = lerCsv(
      'Nome da loja;Responsável;Telefone;CEP;Distância\n"Açaí do Zé; Centro";Zé;(21) 99999-8888;23815-000;12,5\n;Sem nome;21988887777;;\nPonto do Açaí;Ana;abc;;',
    );
    expect(r.clientes).toHaveLength(2);
    expect(r.clientes[0]).toMatchObject({ nome_loja: "Açaí do Zé; Centro", responsavel: "Zé", whatsapp: "5521999998888", cep: "23815000", distancia_km: 12.5 });
    expect(r.clientes[1].whatsapp).toBeNull();
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4]);
  });

  it("CSV sem coluna de nome é recusado", () => {
    expect(lerCsv("telefone\n21999998888").erros[0].motivo).toMatch(/nome da loja/);
  });

  it("arquivo de contatos .vcf", () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:Açaí Bom Demais", "TEL;TYPE=CELL:+55 21 98888-7777", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "N:Silva;Maria;;;", "TEL:21977776666", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:Sem telefone", "END:VCARD",
    ].join("\r\n");
    const r = lerVcf(vcf);
    expect(r.clientes.map((c) => [c.nome_loja, c.whatsapp])).toEqual([
      ["Açaí Bom Demais", "5521988887777"],
      ["Maria Silva", "5521977776666"],
    ]);
    expect(r.erros).toHaveLength(1);
  });

  it("lista colada do WhatsApp", () => {
    const r = lerTexto("Açaí do Zé - 21 99999-8888\n\n(21) 98888-7777 Sorveteria Gelada\nLoja sem telefone");
    expect(r.clientes.map((c) => [c.nome_loja, c.whatsapp])).toEqual([
      ["Açaí do Zé", "5521999998888"],
      ["Sorveteria Gelada", "5521988887777"],
      ["Loja sem telefone", null],
    ]);
  });

  it("junta duplicados pelo telefone", () => {
    const { clientes } = lerTexto("A 21999998888\nB 21999998888\nC 21988887777\nD");
    const r = separarDuplicados(clientes, new Set(["5521988887777"]));
    expect(r.novos.map((c) => c.nome_loja)).toEqual(["A", "D"]);
    expect(r.duplicados.map((c) => c.nome_loja)).toEqual(["B", "C"]);
  });
});

describe("resumo do pedido para o WhatsApp", () => {
  it("traz itens, total, forma de pagamento e horário", () => {
    const texto = textoResumoPedido({
      numero: 1042,
      nome_loja: "Açaí do Zé",
      tipo: "entrega",
      data_agendada: "2026-10-03",
      hora_agendada: "14:30:00",
      forma_pagamento: "pix",
      itens: [{ descricao: "Banana 10 L", quantidade: 10, total_centavos: 96000 }],
      desconto_centavos: 2000,
      taxa_entrega_centavos: 1500,
      acrescimo_cartao_centavos: 0,
      total_centavos: 97500,
    });
    expect(texto).toContain("Pedido nº 1042");
    expect(texto).toContain("10× Banana 10 L: R$ 960,00");
    expect(texto).toContain("*Total: R$ 975,00* (Pix)");
    expect(texto).toContain("Entrega: 03/10/2026 às 14:30");
  });
});
