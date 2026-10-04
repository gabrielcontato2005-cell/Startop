import { notFound } from "next/navigation";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { Campo, Cartao, Pagina, Secao, Selecao } from "@/components/ui";
import { ehUuid } from "@/lib/dados";
import { consultar, consultarUm } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { formatarDataHora } from "@/lib/regras/horario";
import { exigirDono } from "@/lib/sessao";
import { salvarProduto } from "../acoes";

export const metadata = { title: "Produto" };

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default async function EditarProduto({ params }: PageProps<"/produtos/[id]">) {
  await exigirDono();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const [p, historico] = await Promise.all([
    consultarUm<{ sabor: string; linha: string; tamanho_litros: number; preco_centavos: number; preco_consumidor_centavos: number | null; custo_medio_centavos: number; custo_adicional_centavos: number; ativo: boolean }>(
      `select vp.sabor, vp.linha, vp.tamanho_litros, vp.preco_centavos, vp.preco_consumidor_centavos, vp.custo_medio_centavos, vp.custo_adicional_centavos,
              p.ativo
         from v_produtos vp join produtos p on p.id = vp.id where vp.id = $1`, [id]),
    consultar<{ preco_centavos: number; custo_medio_centavos: number; custo_adicional_centavos: number; vigente_desde: string; nome: string | null }>(
      `select h.preco_centavos, h.custo_medio_centavos, h.custo_adicional_centavos, h.vigente_desde, u.nome
         from precos_historico h left join usuarios u on u.id = h.alterado_por
        where h.produto_id = $1 order by h.id desc limit 15`, [id]),
  ]);
  if (!p) notFound();

  return (
    <Pagina titulo={`${p.sabor} ${p.tamanho_litros} L`} voltar="/produtos">
      <p className="-mt-2 mb-4 text-sm text-slate-500">{p.linha}</p>
      <Cartao>
        <Formulario acao={salvarProduto}>
          <input type="hidden" name="id" value={id} />
          <Campo rotulo="Nome do sabor" name="sabor" defaultValue={p.sabor} required dica="Muda o nome nos dois tamanhos" />
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Preço de venda (R$)" name="preco" inputMode="decimal" defaultValue={reais(p.preco_centavos)} required />
            <Campo rotulo="Preço consumidor (R$)" name="preco_consumidor" inputMode="decimal"
              defaultValue={p.preco_consumidor_centavos == null ? "" : reais(p.preco_consumidor_centavos)}
              placeholder={reais(p.preco_centavos)} dica="Venda avulsa. Vazio = preço de venda" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Custo da fábrica (R$)" name="custo_medio" inputMode="decimal" defaultValue={reais(p.custo_medio_centavos)} required
              dica="Atualiza sozinho com a média dos lotes" />
            <Campo rotulo="Embalagem e outros (R$)" name="custo_adicional" inputMode="decimal" defaultValue={reais(p.custo_adicional_centavos)} />
          </div>
          <Selecao rotulo="Situação" name="ativo" defaultValue={p.ativo ? "sim" : "nao"}>
            <option value="sim">À venda</option>
            <option value="nao">Fora de linha (some do pedido)</option>
          </Selecao>
          <BotaoEnviar grande className="w-full">Salvar</BotaoEnviar>
        </Formulario>
      </Cartao>

      <Secao titulo="Histórico de preço e custo">
        <Cartao className="divide-y divide-slate-100 p-0 text-sm">
          {historico.map((h, i) => (
            <div key={i} className="flex justify-between gap-2 px-4 py-2">
              <span className="text-slate-500">{formatarDataHora(h.vigente_desde)}{h.nome ? ` · ${h.nome}` : ""}</span>
              <span className="tabular-nums">
                {formatarReais(h.preco_centavos)} · custo {formatarReais(h.custo_medio_centavos + h.custo_adicional_centavos)}
              </span>
            </div>
          ))}
        </Cartao>
      </Secao>
    </Pagina>
  );
}
