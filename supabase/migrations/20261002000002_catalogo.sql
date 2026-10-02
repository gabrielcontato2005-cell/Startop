-- Catálogo real da StarTop (tabela de setembro de 2026) e regra de desconto vigente.
-- Custos iniciais combinados com o gabriel em 2026-10-02:
--   açaí 10 L: lucro de R$ 15 por caixa nas duas linhas (custo R$ 83 tradicional, R$ 88 mesclado);
--   demais caixas (açaí 5 L e sorvetes): lucro de R$ 10 por caixa.
-- Tudo é editável na tela Produtos; nada disso fica preso no código.

insert into public.linhas (nome, categoria, ordem) values
  ('Açaí tradicional', 'acai', 1),
  ('Açaí mesclado', 'acai', 2),
  ('Sorvete tradicional', 'sorvete', 3),
  ('Sorvete Creme Americano', 'sorvete', 4),
  ('Sorvete premium', 'sorvete', 5);

insert into public.sabores (linha_id, nome)
select l.id, s.nome
  from (values
    ('Açaí tradicional', array['Banana', 'Morango', 'Natural', 'Cupuaçu', 'Graviola', 'Abacaxi', 'Maracujá']),
    ('Açaí mesclado', array['Nutella', 'Ninho', 'Paçoca']),
    ('Sorvete tradicional', array['Chocolate', 'Bombom de Morango', 'Flocos', 'Blue Ice', 'Pavê Italiano',
      'Torta Alemã', 'Passas ao Rum', 'Milho Verde', 'Chocomenta', 'Creme', 'Morango com Pedaços']),
    ('Sorvete Creme Americano', array['Creme Americano']),
    ('Sorvete premium', array['Ferrero Rocher', 'Pistache', 'Kinder Ovo', 'Prestígio', 'Ninho Trufado', 'Ovomaltine',
      'Iogurte com Frutas Vermelhas', 'Brownie', 'Banana com Nutella', 'Oreo', 'Sonho de Valsa', 'Mousse de Maracujá',
      'Torta de Limão', 'Galak', 'Banoffee', 'Abacaxi com Vinho', 'Romeu e Julieta'])
  ) as v(linha, nomes)
  join public.linhas l on l.nome = v.linha
  cross join lateral unnest(v.nomes) as s(nome);

insert into public.produtos (sabor_id, tamanho_litros, preco_centavos, custo_medio_centavos, estoque_minimo)
select s.id, t.tamanho, t.preco, t.custo, t.minimo
  from public.sabores s
  join public.linhas l on l.id = s.linha_id
  join (values
    ('Açaí tradicional', 5, 5500, 4500, 5),
    ('Açaí tradicional', 10, 9800, 8300, 10),
    ('Açaí mesclado', 5, 6000, 5000, 3),
    ('Açaí mesclado', 10, 10300, 8800, 5),
    ('Sorvete tradicional', 10, 7000, 6000, 2),
    ('Sorvete Creme Americano', 10, 8400, 7400, 2),
    ('Sorvete premium', 10, 8400, 7400, 2)
  ) as t(linha, tamanho, preco, custo, minimo) on t.linha = l.nome;

insert into public.regras_desconto (nome, linha_ids, tamanho_litros, qtd_minima, tipo, valor, aplica_em)
select 'R$ 2 por caixa de açaí 10 L a partir de 10 caixas',
       array_agg(id order by ordem), 10, 10, 'valor_por_caixa', 200, 'todas'
  from public.linhas where categoria = 'acai';
