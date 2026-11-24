-- DevDeck · Comunidade · 0002: limite de curtidas e denúncias (Sprint 05, H05.6)
-- Rodar depois da 0001 (SQL Editor do projeto Supabase ou `supabase db push`).
--
-- Por que uma tabela de eventos: contar linhas de `likes` não funciona, porque curtir e descurtir
-- apaga a linha e zera a contagem. Cada tentativa aceita vira um evento em `rate_events`, que
-- clientes não leem nem escrevem (RLS sem policy + revoke). A checagem roda em trigger
-- SECURITY DEFINER com search_path vazio e um advisory lock por usuário+ação (sem corrida entre
-- inserts simultâneos).
--
-- Limites (decisão do PO): 120 curtidas por hora e 10 denúncias por 24 h por usuário.
-- Denúncia de conta com menos de 72 h é gravada, mas não conta para ocultar o post.

-- ---------------------------------------------------------------- eventos

create table if not exists public.rate_events (
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in ('like', 'report')),
  created_at timestamptz not null default now()
);
create index if not exists rate_events_user_action_idx on public.rate_events (user_id, action, created_at);

alter table public.rate_events enable row level security;
-- Sem policy: nenhuma linha visível ou gravável por anon/authenticated.
revoke all on public.rate_events from public, anon, authenticated;

-- ---------------------------------------------------------------- checagem

create or replace function public.enforce_rate(p_user uuid, p_action text, p_max int, p_window interval, p_message text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then
    raise exception 'Usuário não identificado.';
  end if;
  -- Serializa tentativas do mesmo usuário na mesma ação até o fim da transação.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_action, 0));
  delete from public.rate_events
   where user_id = p_user and action = p_action and created_at < now() - p_window;
  if (select count(*) from public.rate_events where user_id = p_user and action = p_action) >= p_max then
    raise exception '%', p_message using errcode = 'P0001';
  end if;
  insert into public.rate_events (user_id, action) values (p_user, p_action);
end $$;

-- Só os triggers chamam: nada de RPC direta pela API.
revoke execute on function public.enforce_rate(uuid, text, int, interval, text) from public, anon, authenticated;

create or replace function public.rate_limit_likes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate(new.user_id, 'like', 120, interval '1 hour', 'Limite de 120 curtidas por hora atingido. Tente de novo mais tarde.');
  return new;
end $$;
drop trigger if exists likes_rate_limit on public.likes;
create trigger likes_rate_limit before insert on public.likes
  for each row execute function public.rate_limit_likes();

create or replace function public.rate_limit_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate(new.reporter_id, 'report', 10, interval '24 hours', 'Limite de 10 denúncias por dia atingido.');
  return new;
end $$;
drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.rate_limit_reports();

-- ---------------------------------------------------------------- denúncia de conta nova

-- Substitui a função da 0001: denúncia de conta com menos de 72 h fica registrada (moderação vê),
-- mas não soma no contador que oculta o post. Evita ocultar qualquer post com 3 contas recém-criadas.
create or replace function public.apply_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  account_age interval;
begin
  select now() - u.created_at into account_age from auth.users u where u.id = new.reporter_id;
  if account_age is null or account_age < interval '72 hours' then
    return null;
  end if;
  update public.posts
     set report_count = report_count + 1,
         hidden = hidden or report_count + 1 >= 3
   where id = new.post_id;
  return null;
end $$;

revoke execute on function public.rate_limit_likes() from public, anon, authenticated;
revoke execute on function public.rate_limit_reports() from public, anon, authenticated;
revoke execute on function public.apply_report() from public, anon, authenticated;
