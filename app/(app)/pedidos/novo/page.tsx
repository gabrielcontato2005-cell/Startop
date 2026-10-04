import { Pagina } from "@/components/ui";
import { ehUuid, lerCatalogo, lerClientesParaPedido, lerConfig, lerCustos, lerRegras } from "@/lib/dados";
import { hojeSP, minutos, somarDias } from "@/lib/regras/horario";
import { exigirEquipe } from "@/lib/sessao";
import FormPedido from "../form-pedido";

export const metadata = { title: "Novo pedido" };

export default async function NovoPedido({ searchParams }: PageProps<"/pedidos/novo">) {
  const u = await exigirEquipe();
  const { cliente, avulsa } = await searchParams;
  const [clientes, produtos, regras, config, custos] = await Promise.all([
    lerClientesParaPedido(u.perfil === "dono"),
    lerCatalogo(),
    lerRegras(),
    lerConfig(),
    u.perfil === "dono" ? lerCustos() : undefined,
  ]);

  // depois do fechamento o pedido já nasce para amanhã
  const agora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const hoje = hojeSP();
  const dataPadrao = minutos(agora) > minutos(config.horario_fechamento) ? somarDias(hoje, 1) : hoje;

  return (
    <Pagina titulo={avulsa ? "Venda avulsa" : "Novo pedido"}>
      <FormPedido
        clientes={clientes}
        produtos={produtos}
        regras={regras}
        config={config}
        custos={custos}
        dono={u.perfil === "dono"}
        dataPadrao={dataPadrao}
        clienteInicial={
          avulsa ? clientes.find((c) => c.consumidor_final)?.id : typeof cliente === "string" && ehUuid(cliente) ? cliente : undefined
        }
      />
    </Pagina>
  );
}
