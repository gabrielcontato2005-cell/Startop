import { NextResponse, type NextRequest } from "next/server";
import { lerPeriodo, rankingClientes, rankingSabores, vendasPorDia } from "@/lib/relatorios";
import { usuarioLogado } from "@/lib/sessao";

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function csv(linhas: (string | number)[][]) {
  // ponto e vírgula e BOM: abre certo no Excel em português
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const u = await usuarioLogado();
  if (!u || u.perfil !== "dono") return new NextResponse("Sem permissão", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const p = lerPeriodo({ ...sp, p: "custom" });
  const tipo = sp.tipo;

  let linhas: (string | number)[][];
  if (tipo === "clientes") {
    const r = await rankingClientes(p);
    linhas = [["Loja", "Pedidos", "Caixas", "Faturamento (R$)", "Lucro pago (R$)"], ...r.map((c) => [c.nome_loja, c.pedidos, c.caixas, reais(c.faturamento), reais(c.lucro)])];
  } else if (tipo === "sabores") {
    const r = await rankingSabores(p);
    linhas = [["Produto", "Linha", "Caixas", "Faturamento (R$)", "Lucro pago (R$)"], ...r.map((s) => [s.produto, s.linha, s.caixas, reais(s.faturamento), reais(s.lucro)])];
  } else {
    const r = await vendasPorDia(p);
    linhas = [
      ["Data", "Pedidos", "Caixas", "Faturamento (R$)", "Custo (R$)", "Lucro pago (R$)"],
      ...r.map((d) => [d.data.split("-").reverse().join("/"), d.pedidos, d.caixas, reais(d.faturamento_centavos), reais(d.custo_centavos), reais(d.lucro_centavos)]),
    ];
  }
  return new NextResponse(csv(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="startop-${tipo ?? "dias"}-${p.de}-a-${p.ate}.csv"`,
    },
  });
}
