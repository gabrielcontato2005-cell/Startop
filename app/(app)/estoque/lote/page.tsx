import { Pagina } from "@/components/ui";
import { lerCatalogoComCusto } from "@/lib/dados";
import { exigirDono } from "@/lib/sessao";
import Grade from "../grade";

export const metadata = { title: "Chegou mercadoria" };

export default async function PaginaLote() {
  await exigirDono();
  const produtos = (await lerCatalogoComCusto()).filter((p) => p.ativo);
  return (
    <Pagina titulo="Chegou mercadoria" voltar="/estoque">
      <Grade
        modo="lote"
        produtos={produtos.map((p) => ({ id: p.id, sabor: p.sabor, linha: p.linha, tamanho_litros: p.tamanho_litros, fisico: p.fisico, custo_centavos: p.custo_medio_centavos }))}
      />
    </Pagina>
  );
}
