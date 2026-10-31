/** Título do grupo de produtos: "Açaí tradicional · 10 L", ou só a linha nos outros produtos (sem tamanho). */
export function grupoDoProduto(p: { linha: string; tamanho_litros: number | null }) {
  return p.tamanho_litros == null ? p.linha : `${p.linha} · ${p.tamanho_litros} L`;
}

/** "Banana 10 L", ou só o nome nos outros produtos (o mesmo que v_produtos.nome). */
export function nomeDoProduto(p: { sabor: string; tamanho_litros: number | null }) {
  return p.tamanho_litros == null ? p.sabor : `${p.sabor} ${p.tamanho_litros} L`;
}
