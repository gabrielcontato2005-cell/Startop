import { BotaoEnviar, Formulario } from "@/components/formulario";
import { Campo, Cartao, Pagina, Secao, Selecao } from "@/components/ui";
import { lerLinhas, lerRegras } from "@/lib/dados";
import { formatarReais } from "@/lib/regras/dinheiro";
import { exigirDono } from "@/lib/sessao";
import { salvarRegra } from "../acoes";

export const metadata = { title: "Descontos" };

type Regra = Awaited<ReturnType<typeof lerRegras>>[number];
type Linha = Awaited<ReturnType<typeof lerLinhas>>[number];

function FormRegra({ regra, linhas }: { regra?: Regra; linhas: Linha[] }) {
  const valor = regra ? (regra.tipo === "percentual" ? String(regra.valor).replace(".", ",") : (regra.valor / 100).toFixed(2).replace(".", ",")) : "";
  return (
    <Formulario acao={salvarRegra}>
      {regra && <input type="hidden" name="id" value={regra.id} />}
      <Campo rotulo="Nome" name="nome" defaultValue={regra?.nome} required />
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Vale para as linhas</legend>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {linhas.map((l) => (
            <label key={l.id} className="flex items-center gap-2">
              <input type="checkbox" name="linha_ids" value={l.id} defaultChecked={regra?.linha_ids.includes(l.id)} className="h-5 w-5" />
              {l.nome}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Selecao rotulo="Tamanho" name="tamanho_litros" defaultValue={regra?.tamanho_litros?.toString() ?? ""}>
          <option value="">Todos</option>
          <option value="10">10 L</option>
          <option value="5">5 L</option>
        </Selecao>
        <Campo rotulo="A partir de (caixas)" name="qtd_minima" inputMode="numeric" defaultValue={regra?.qtd_minima ?? 10} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Selecao rotulo="Tipo" name="tipo" defaultValue={regra?.tipo ?? "valor_por_caixa"}>
          <option value="valor_por_caixa">R$ por caixa</option>
          <option value="percentual">% do preço</option>
        </Selecao>
        <Campo rotulo="Valor" name="valor" inputMode="decimal" defaultValue={valor} required dica="R$ ou %, conforme o tipo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Selecao rotulo="Aplica em" name="aplica_em" defaultValue={regra?.aplica_em ?? "todas"}>
          <option value="todas">Todas as caixas</option>
          <option value="so_excedente">Só as que passam do mínimo</option>
        </Selecao>
        <Selecao rotulo="Situação" name="ativa" defaultValue={regra?.ativa === false ? "nao" : "sim"}>
          <option value="sim">Ligada</option>
          <option value="nao">Desligada</option>
        </Selecao>
      </div>
      <BotaoEnviar className="w-full">{regra ? "Salvar regra" : "Criar regra"}</BotaoEnviar>
    </Formulario>
  );
}

export default async function Descontos() {
  await exigirDono();
  const [regras, linhas] = await Promise.all([lerRegras(), lerLinhas()]);
  return (
    <Pagina titulo="Descontos" voltar="/produtos">
      <p className="mb-4 text-sm text-slate-600">
        O desconto entra sozinho no pedido quando a soma das caixas das linhas marcadas chega na quantidade mínima.
      </p>
      {regras.map((r) => (
        <Secao key={r.id} titulo={r.ativa ? "Regra ligada" : "Regra desligada"}>
          <Cartao>
            <p className="mb-3 font-medium">
              {r.tipo === "percentual" ? `${String(r.valor).replace(".", ",")}%` : formatarReais(r.valor)} por caixa a partir de {r.qtd_minima}
            </p>
            <FormRegra regra={r} linhas={linhas} />
          </Cartao>
        </Secao>
      ))}
      <Secao titulo="Nova regra">
        <Cartao>
          <FormRegra linhas={linhas} />
        </Cartao>
      </Secao>
    </Pagina>
  );
}
