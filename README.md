# StarTop Pedidos

Sistema de pedidos, estoque e clientes da StarTop CostaV (Itaguaí, RJ). Funciona no navegador do celular
e pode ser instalado na tela inicial (PWA).

O que tem nesta primeira fase:

- **Pedidos**: pedido em poucos toques, "repetir último pedido", sabores de sempre do cliente, desconto
  automático (R$ 2 por caixa a partir de 10 caixas de açaí 10 L), acréscimo de 10% no cartão, pedido mínimo
  de 1 caixa a cada 5 km, taxa de entrega sugerida e editável, resumo pronto para o WhatsApp.
- **Estoque**: entrada por nota/lote, contagem (digita o que tem de cada sabor e o sistema ajusta), perdas,
  reserva ao confirmar, baixa ao entregar, devolução ao cancelar. Atendente não vende sem estoque; o dono
  pode forçar.
- **Clientes**: cadastro com busca de CEP, importação por planilha (CSV), contatos (VCF) ou texto colado,
  métricas por cliente (frequência, ticket médio, faturamento, lucro, "sumido").
- **Produtos e preços**: linhas, sabores, tamanhos, preço, custo e histórico de preço.
- **Painel do dono e relatórios**: vendas de hoje, lucro do mês, a receber, estoque baixo, ranking de clientes e
  sabores, exportação CSV.
- **Usuários**: dono (vê tudo), atendente (não vê custo nem lucro) e entregador.

## Como colocar no ar

Você precisa de uma conta no [Supabase](https://supabase.com) (banco e login) e de um lugar para rodar o
site. Os passos abaixo usam a Vercel, mas qualquer serviço que rode Next.js serve. O plano grátis da Vercel
(Hobby) é só para uso não comercial; para a empresa, o plano Pro custa cerca de US$ 20 por mês.

### 1. Banco de dados (Supabase)

1. Crie um projeto novo. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Abra **SQL Editor**, cole o conteúdo de `supabase/migrations/20261002000001_inicial.sql` e clique em
   **Run**. Depois faça o mesmo com `supabase/migrations/20261002000002_catalogo.sql` (sabores, preços e
   custos).
3. Em **Authentication → Users → Add user**, crie o seu login (e-mail e senha, marcando *Auto Confirm User*).
   **O primeiro usuário criado vira o dono.** Os outros você cadastra depois, de dentro do sistema, em
   *Mais → Usuários*.
4. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Assim ninguém cria
   conta sozinho. (Mesmo que crie, entra sem acesso até o dono liberar.)
5. Opcional, para testar com movimento: rode `supabase/demo.sql` no SQL Editor (40 lojas fictícias e 90 dias de
   pedidos). Antes de usar de verdade, rode `supabase/zerar-dados.sql`, que apaga clientes, pedidos e
   movimentos e zera o estoque, mantendo produtos, preços, usuários e configurações.

### 2. Site (Vercel)

1. Em [vercel.com](https://vercel.com), **Add New → Project** e importe este repositório do GitHub.
2. Em **Environment Variables**, cadastre as quatro variáveis abaixo (os valores ficam no Supabase):

   | Variável | Onde achar no Supabase |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key |
   | `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret key |
   | `DATABASE_URL` | Botão **Connect** → *Transaction pooler* (porta 6543), trocando `[YOUR-PASSWORD]` pela senha do banco |

   A chave secreta e a `DATABASE_URL` dão acesso total ao banco: só cadastre na Vercel, nunca no GitHub nem em
   mensagens.
3. Clique em **Deploy**. Quando terminar, abra o endereço no celular, entre com o login do passo 1.3 e use
   **Adicionar à tela inicial** para instalar.

### 3. Primeiros ajustes dentro do sistema

Em *Mais → Configurações*: CEP e WhatsApp da fábrica, valor da taxa de entrega (por km ou por faixa de
distância), pedido mínimo por distância, acréscimo do cartão e horário de funcionamento. Em *Produtos*, confira preços e custos.
Em *Estoque → Contagem*, lance o estoque atual de cada sabor.

### 4. Backup diário (recomendado)

O plano grátis do Supabase não guarda backup que você possa baixar. O workflow
`.github/workflows/backup.yml` faz uma cópia do banco todo dia às 3h, criptografada, e guarda por 30 dias na
aba **Actions** do GitHub. Para ligar, cadastre em **GitHub → Settings → Secrets and variables → Actions**:

- `BACKUP_DATABASE_URL`: no Supabase, **Connect** → *Session pooler* (porta 5432), com a senha do banco.
- `BACKUP_SENHA`: uma senha longa que só você sabe. Sem ela o backup não abre; guarde num lugar seguro.

Para restaurar, baixe o arquivo do backup e rode
`gpg --batch --passphrase "SENHA" -d startop-AAAA-MM-DD.sql.gz.gpg | gunzip > backup.sql`.

## Desenvolvimento

Precisa de Node 22 e de um Postgres local (16 ou mais novo).

```bash
npm install
cp .env.example .env.local   # preencha; para rodar sem Supabase Auth use AUTH_DEV_EMAIL
npm run dev
```

Com `AUTH_DEV_EMAIL` o app entra direto como o usuário desse e-mail, sem tela de login. Só vale fora de
produção. Para montar um banco local igual ao do Supabase, use o mesmo script dos testes apontando para outro
nome de banco e crie um usuário com `insert into auth.users (email) values ('dono@startop.local')`.

Testes das regras de negócio (cálculo do pedido, descontos, pedido mínimo, lucro) e do banco (reserva, baixa,
devolução, venda sem estoque, duas vendas disputando a última caixa, custo congelado, auditoria):

```bash
export TEST_DATABASE_URL=postgres://postgres@localhost:5432/startop_teste
npm run db:teste   # recria o banco de teste com as migrations
npm test
npm run lint && npm run typecheck
```

O CI do GitHub roda tudo isso, carrega os dados de exemplo e faz o build a cada PR.

Organização do código:

- `supabase/migrations`: tabelas, regras de estoque e pedido (funções em SQL com trava de linha), visões de
  relatório. Toda mudança de banco entra como um arquivo novo aqui.
- `lib/regras`: regras puras em TypeScript (dinheiro em centavos, pedido, entrega, horário, importação).
- `lib/db.ts`, `lib/sessao.ts`: acesso ao banco só pelo servidor e checagem de perfil em toda página e ação.
- `app/(app)`: telas. `components`: peças de interface.

Valores em dinheiro são guardados em centavos e datas no fuso de São Paulo.
