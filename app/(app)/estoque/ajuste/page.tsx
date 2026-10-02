import { BotaoEnviar, Formulario } from "@/components/formulario";
import { AreaTexto, Campo, Cartao, Pagina, Selecao } from "@/components/ui";
import { lerCatalogo } from "@/lib/dados";
import { exigirDono } from "@/lib/sessao";
import { ajustarEstoque } from "../acoes";

export const metadata = { title: "Ajuste de estoque" };

export default async function Ajuste() {
  await exigirDono();
  const produtos = await lerCatalogo();
  return (
    <Pagina titulo="Ajuste ou perda" voltar="/estoque">
      <Cartao>
        <Formulario acao={ajustarEstoque}>
          <Selecao rotulo="Produto" name="produto_id" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.linha} · {p.sabor} {p.tamanho_litros} L (tem {p.fisico})
              </option>
            ))}
          </Selecao>
          <div className="grid grid-cols-2 gap-3">
            <Selecao rotulo="Tipo" name="tipo" defaultValue="perda">
              <option value="perda">Perda / avaria</option>
              <option value="ajuste">Ajuste</option>
            </Selecao>
            <Selecao rotulo="Ajuste para" name="sentido" defaultValue="tirar">
              <option value="tirar">Tirar caixas</option>
              <option value="somar">Somar caixas</option>
            </Selecao>
          </div>
          <Campo rotulo="Quantidade de caixas" name="quantidade" inputMode="numeric" required />
          <AreaTexto rotulo="Motivo" name="motivo" required placeholder="Ex.: caixa derreteu no freezer" />
          <p className="text-xs text-slate-500">Perda sempre tira do estoque. Para conferir tudo de uma vez, use a Contagem.</p>
          <BotaoEnviar grande className="w-full">Registrar</BotaoEnviar>
        </Formulario>
      </Cartao>
    </Pagina>
  );
}
