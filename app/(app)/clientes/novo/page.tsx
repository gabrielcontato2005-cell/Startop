import { Pagina } from "@/components/ui";
import { lerConfig } from "@/lib/dados";
import { exigirEquipe } from "@/lib/sessao";
import FormCliente from "../form-cliente";

export const metadata = { title: "Novo cliente" };

export default async function NovoCliente({ searchParams }: PageProps<"/clientes/novo">) {
  await exigirEquipe();
  const { voltar } = await searchParams;
  const cfg = await lerConfig();
  const doPedido = voltar === "pedido";
  return (
    <Pagina titulo="Novo cliente" voltar={doPedido ? "/pedidos/novo" : "/clientes"}>
      <FormCliente kmPorCaixa={cfg.km_por_caixa} pisoMinimo={cfg.pedido_minimo_piso} voltarPara={doPedido ? "pedido" : undefined} />
    </Pagina>
  );
}
