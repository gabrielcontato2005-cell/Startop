import { notFound } from "next/navigation";
import { Pagina } from "@/components/ui";
import { ehUuid, lerConfig } from "@/lib/dados";
import { consultarUm } from "@/lib/db";
import { exigirEquipe } from "@/lib/sessao";
import FormCliente, { type ClienteForm } from "../../form-cliente";

export const metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }: PageProps<"/clientes/[id]/editar">) {
  await exigirEquipe();
  const { id } = await params;
  const [cliente, cfg] = await Promise.all([
    ehUuid(id) ? consultarUm<ClienteForm>(`select * from clientes where id = $1`, [id]) : null,
    lerConfig(),
  ]);
  if (!cliente) notFound();
  return (
    <Pagina titulo="Editar cliente" voltar={`/clientes/${id}`}>
      <FormCliente cliente={cliente} kmPorCaixa={cfg.km_por_caixa} pisoMinimo={cfg.pedido_minimo_piso} />
    </Pagina>
  );
}
