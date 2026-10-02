import { notFound, redirect } from "next/navigation";
import { Pagina } from "@/components/ui";
import { ehUuid, lerCatalogo, lerClientesParaPedido, lerConfig, lerCustos, lerRegras } from "@/lib/dados";
import { consultar, consultarUm } from "@/lib/db";
import { exigirEquipe } from "@/lib/sessao";
import FormPedido, { type PedidoInicial } from "../../form-pedido";

export const metadata = { title: "Editar pedido" };

export default async function EditarPedido({ params }: PageProps<"/pedidos/[id]/editar">) {
  const u = await exigirEquipe();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const p = await consultarUm<Omit<PedidoInicial, "itens" | "liberado"> & { status: string; liberado_abaixo_minimo_por: string | null }>(
    `select id, numero, cliente_id, tipo, data_agendada, to_char(hora_agendada, 'HH24:MI') as hora_agendada, forma_pagamento,
            taxa_entrega_centavos, observacoes, status, liberado_abaixo_minimo_por
       from pedidos where id = $1`,
    [id],
  );
  if (!p) notFound();
  if (!["novo", "confirmado", "separado"].includes(p.status)) redirect(`/pedidos/${id}`);

  const [itens, clientes, produtos, regras, config, custos] = await Promise.all([
    consultar<{ produto_id: string; quantidade: number }>(`select produto_id, quantidade from itens_pedido where pedido_id = $1`, [id]),
    lerClientesParaPedido(u.perfil === "dono"),
    lerCatalogo(),
    lerRegras(),
    lerConfig(),
    u.perfil === "dono" ? lerCustos() : undefined,
  ]);

  return (
    <Pagina titulo={`Editar pedido nº ${p.numero}`} voltar={`/pedidos/${id}`}>
      <FormPedido
        clientes={clientes}
        produtos={produtos}
        regras={regras}
        config={config}
        custos={custos}
        dono={u.perfil === "dono"}
        dataPadrao={p.data_agendada}
        inicial={{ ...p, itens, liberado: !!p.liberado_abaixo_minimo_por }}
      />
    </Pagina>
  );
}
