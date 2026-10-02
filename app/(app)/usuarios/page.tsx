import { revalidatePath } from "next/cache";
import { BotaoEnviar, Formulario, type EstadoAcao } from "@/components/formulario";
import { Campo, Cartao, Etiqueta, Pagina, Secao, Selecao } from "@/components/ui";
import { ehUuid } from "@/lib/dados";
import { consultar, mensagemDoBanco } from "@/lib/db";
import { exigirDono } from "@/lib/sessao";
import { supabaseAdmin } from "@/lib/supabase";

export const metadata = { title: "Usuários" };

const PERFIS = { dono: "Dono (vê tudo)", atendente: "Atendente (sem custo e lucro)", entregador: "Entregador (só entregas)" };

async function criar(_: EstadoAcao, d: FormData): Promise<EstadoAcao> {
  "use server";
  await exigirDono();
  const nome = String(d.get("nome") ?? "").trim();
  const email = String(d.get("email") ?? "").trim().toLowerCase();
  const senha = String(d.get("senha") ?? "");
  const perfil = String(d.get("perfil") ?? "");
  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (senha.length < 8) return { erro: "A senha precisa de pelo menos 8 caracteres." };
  if (!(perfil in PERFIS)) return { erro: "Escolha o perfil." };
  // o gatilho do banco cria a linha em usuarios sem acesso; o perfil e a liberação vêm daqui
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) return { erro: error.message.includes("already") ? "Esse e-mail já tem acesso." : `Não deu para criar: ${error.message}` };
  try {
    await consultar(
      `insert into usuarios (id, nome, email, perfil, ativo) values ($1, $2, $3, $4, true)
       on conflict (id) do update set nome = excluded.nome, perfil = excluded.perfil, ativo = true`,
      [data.user.id, nome, email, perfil],
    );
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/usuarios");
  return { ok: `${nome} já pode entrar com o e-mail e a senha que você definiu.` };
}

async function alterar(_: EstadoAcao, d: FormData): Promise<EstadoAcao> {
  "use server";
  const u = await exigirDono();
  const id = String(d.get("id") ?? "");
  const perfil = String(d.get("perfil") ?? "");
  const ativo = d.get("ativo") === "sim";
  if (!ehUuid(id) || !(perfil in PERFIS)) return { erro: "Dados inválidos." };
  if (id === u.id && (perfil !== "dono" || !ativo)) return { erro: "Você não pode tirar o seu próprio acesso de dono." };
  try {
    await consultar(`update usuarios set perfil = $2, ativo = $3 where id = $1`, [id, perfil, ativo]);
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/usuarios");
  return { ok: "Salvo." };
}

export default async function Usuarios() {
  await exigirDono();
  const usuarios = await consultar<{ id: string; nome: string; email: string | null; perfil: keyof typeof PERFIS; ativo: boolean }>(
    `select id, nome, email, perfil, ativo from usuarios order by ativo desc, nome`,
  );
  return (
    <Pagina titulo="Usuários" voltar="/mais">
      <Secao titulo="Quem tem acesso">
        <div className="space-y-3">
          {usuarios.map((x) => (
            <Cartao key={x.id}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{x.nome}</div>
                  <div className="text-sm text-slate-500">{x.email}</div>
                </div>
                {!x.ativo && <Etiqueta cor="bg-slate-200 text-slate-600">Sem acesso</Etiqueta>}
              </div>
              <Formulario acao={alterar} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                <input type="hidden" name="id" value={x.id} />
                <Selecao rotulo="Perfil" name="perfil" defaultValue={x.perfil}>
                  {Object.entries(PERFIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </Selecao>
                <Selecao rotulo="Acesso" name="ativo" defaultValue={x.ativo ? "sim" : "nao"}>
                  <option value="sim">Ativo</option>
                  <option value="nao">Bloqueado</option>
                </Selecao>
                <BotaoEnviar estilo="secundario">Salvar</BotaoEnviar>
              </Formulario>
            </Cartao>
          ))}
        </div>
      </Secao>
      <Secao titulo="Dar acesso a alguém">
        <Cartao>
          <Formulario acao={criar}>
            <Campo rotulo="Nome" name="nome" required />
            <Campo rotulo="E-mail" name="email" type="email" required />
            <Campo rotulo="Senha inicial" name="senha" type="text" minLength={8} required dica="Mínimo 8 caracteres. Passe para a pessoa pelo WhatsApp." />
            <Selecao rotulo="Perfil" name="perfil" defaultValue="atendente">
              {Object.entries(PERFIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
            <BotaoEnviar className="w-full">Criar acesso</BotaoEnviar>
          </Formulario>
        </Cartao>
      </Secao>
    </Pagina>
  );
}
