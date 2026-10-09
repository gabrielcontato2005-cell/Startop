import Link from "next/link";
import { BotaoLink, Cartao, Etiqueta, Numero, Pagina, Secao, Vazio } from "@/components/ui";
import { NOME_CLIENTE_SQL, STATUS } from "@/lib/dados";
import { consultar, consultarUm } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { hojeSP } from "@/lib/regras/horario";
import { exigirUsuario } from "@/lib/sessao";

type PedidoDia = { id: string; numero: number; nome_loja: string; tipo: string; hora: string | null; status: string; total_caixas: number; total_centavos: number };

async function pedidosDoDia(hoje: string) {
  return consultar<PedidoDia>(
    `select p.id, p.numero, ${NOME_CLIENTE_SQL} as nome_loja, p.tipo, to_char(p.hora_agendada, 'HH24:MI') as hora, p.status, p.total_caixas, p.total_centavos
       from pedidos p join clientes c on c.id = p.cliente_id
      where p.data_agendada = $1 and p.status <> 'cancelado'
      order by p.status = 'entregue', p.hora_agendada nulls last, p.numero`,
    [hoje],
  );
}

function ListaDoDia({ pedidos }: { pedidos: PedidoDia[] }) {
  if (pedidos.length === 0) return <Vazio>Nenhuma entrega ou retirada hoje.</Vazio>;
  return (
    <Cartao className="divide-y divide-slate-100 p-0">
      {pedidos.map((p) => (
        <Link key={p.id} href={`/pedidos/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 active:bg-slate-50">
          <div className="min-w-0">
            <div className="truncate font-medium">{p.nome_loja}</div>
            <div className="text-xs text-slate-500">
              {p.tipo === "entrega" ? "Entrega" : "Retirada"}{p.hora ? ` às ${p.hora}` : ""} · {p.total_caixas} cx
            </div>
          </div>
          <Etiqueta cor={STATUS[p.status].cor}>{STATUS[p.status].nome}</Etiqueta>
        </Link>
      ))}
    </Cartao>
  );
}

export default async function Inicio() {
  const u = await exigirUsuario();
  const hoje = hojeSP();
  const primeiroNome = u.nome.split(" ")[0];

  if (u.perfil !== "dono") {
    const pedidos = await pedidosDoDia(hoje);
    return (
      <Pagina titulo={`Olá, ${primeiroNome}`}>
        {u.perfil === "atendente" && (
          <BotaoLink href="/pedidos/novo" grande estilo="destaque" className="mb-5 w-full">
            + Novo pedido
          </BotaoLink>
        )}
        <Secao titulo="Hoje" acao={<Link href="/separacao" className="text-sm font-medium text-roxo">Separação →</Link>}>
          <ListaDoDia pedidos={pedidos} />
        </Secao>
      </Pagina>
    );
  }

  const [dia, mes, aReceber, sumidos, pedidos] = await Promise.all([
    consultarUm<{ pedidos: number; caixas: number; faturamento: number; lucro: number }>(
      `select count(*) as pedidos, coalesce(sum(total_caixas), 0) as caixas, coalesce(sum(total_centavos), 0) as faturamento,
              coalesce(sum(lucro_recebido_centavos), 0) as lucro
         from v_vendas where data_agendada = $1`,
      [hoje],
    ),
    // lucro só de pedido pago; o dos pedidos ainda não pagos aparece à parte, como "a receber"
    consultarUm<{ faturamento: number; lucro: number; lucro_a_receber: number; caixas: number }>(
      `select coalesce(sum(total_centavos), 0) as faturamento, coalesce(sum(lucro_recebido_centavos), 0) as lucro,
              coalesce(sum(lucro_a_receber_centavos), 0) as lucro_a_receber, coalesce(sum(total_caixas), 0) as caixas
         from v_vendas where date_trunc('month', data_agendada) = date_trunc('month', $1::date) and data_agendada <= $1`,
      [hoje],
    ),
    consultarUm<{ valor: number; pedidos: number }>(
      `select coalesce(sum(total_centavos - pago_centavos), 0) as valor, count(*) as pedidos
         from v_vendas where status_pagamento <> 'pago' and status = 'entregue'`,
    ),
    consultarUm<{ n: number }>(`select count(*) as n from v_cliente_metricas m join clientes c on c.id = m.cliente_id where c.ativo and m.sumido and not c.consumidor_final`),
    pedidosDoDia(hoje),
  ]);


  return (
    <Pagina titulo={`Olá, ${primeiroNome}`}>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Numero rotulo="Vendas de hoje" valor={formatarReais(dia!.faturamento)} detalhe={`${dia!.pedidos} pedidos · ${dia!.caixas} cx`} />
        <Numero rotulo="Lucro do mês" valor={formatarReais(mes!.lucro)} detalhe={`pago · + ${formatarReais(mes!.lucro_a_receber)} a receber`} destaque />
        <Link href="/pedidos?filtro=a_receber">
          <Numero rotulo="A receber" valor={formatarReais(aReceber!.valor)} detalhe={`${aReceber!.pedidos} entregues sem pagar`} />
        </Link>
        <Link href="/clientes?filtro=sumidos">
          <Numero rotulo="Clientes sumidos" valor={sumidos!.n} detalhe="ver e chamar no WhatsApp" />
        </Link>
      </div>

      <Secao titulo="Entregas e retiradas de hoje" acao={<Link href="/separacao" className="text-sm font-medium text-roxo">Separação →</Link>}>
        <ListaDoDia pedidos={pedidos} />
      </Secao>

      <p className="text-center text-xs text-slate-500">
        <Link href="/relatorios" className="font-medium text-roxo underline">Relatórios completos</Link>
      </p>
    </Pagina>
  );
}
