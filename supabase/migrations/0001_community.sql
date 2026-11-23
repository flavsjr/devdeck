-- DevDeck · Comunidade (artigos e snippets)
-- Rodar no SQL Editor do projeto Supabase (ou `supabase db push`).
-- Modelo de segurança: leitura pública do feed; escrita só autenticada e sempre do próprio usuário (RLS).
-- Contadores (curtidas/comentários) e ocultação por denúncia são mantidos por triggers SECURITY DEFINER;
-- clientes não têm privilégio de coluna para alterá-los.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  headline     text check (char_length(headline) <= 120),
  level        int  not null default 1 check (level between 1 and 999),
  badges       text[] not null default '{}' check (cardinality(badges) <= 3),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('article', 'snippet')),
  title         text not null check (char_length(title) between 3 and 140),
  body          text not null default '' check (char_length(body) <= 40000),
  code          text check (char_length(code) <= 40000),
  language      text check (char_length(language) <= 30),
  tags          text[] not null default '{}' check (cardinality(tags) <= 5),
  like_count    int not null default 0,
  comment_count int not null default 0,
  report_count  int not null default 0,
  hidden        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint snippet_has_code check (kind = 'article' or (code is not null and char_length(code) > 0))
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists posts_tags_idx on public.posts using gin (tags);

create table if not exists public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists likes_user_idx on public.likes (user_id);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      text not null check (char_length(reason) between 3 and 500),
  created_at  timestamptz not null default now(),
  unique (post_id, reporter_id)
);

-- ---------------------------------------------------------------- triggers

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

create or replace function public.bump_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes
  for each row execute function public.bump_like_count();

create or replace function public.bump_comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_comment_count();

-- 3 denúncias distintas ocultam o post até revisão manual (via dashboard, com service role).
create or replace function public.apply_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts
     set report_count = report_count + 1,
         hidden = hidden or report_count + 1 >= 3
   where id = new.post_id;
  return null;
end $$;
drop trigger if exists reports_apply on public.reports;
create trigger reports_apply after insert on public.reports
  for each row execute function public.apply_report();

-- Anti-spam simples: no máximo 10 posts por hora e 60 comentários por hora por usuário.
create or replace function public.rate_limit_posts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Limite de 10 publicações por hora atingido.';
  end if;
  return new;
end $$;
drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit before insert on public.posts
  for each row execute function public.rate_limit_posts();

create or replace function public.rate_limit_comments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.comments where author_id = new.author_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Limite de 60 comentários por hora atingido.';
  end if;
  return new;
end $$;
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments
  for each row execute function public.rate_limit_comments();

-- ---------------------------------------------------------------- privilégios de coluna

revoke all on public.profiles, public.posts, public.likes, public.comments, public.reports from anon, authenticated;

grant select on public.profiles, public.posts, public.likes, public.comments to anon, authenticated;
grant insert (id, username, display_name, headline, level, badges) on public.profiles to authenticated;
grant update (username, display_name, headline, level, badges) on public.profiles to authenticated;
grant insert (author_id, kind, title, body, code, language, tags) on public.posts to authenticated;
grant update (title, body, code, language, tags) on public.posts to authenticated;
grant delete on public.posts to authenticated;
grant insert (post_id, user_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;
grant insert (post_id, author_id, body) on public.comments to authenticated;
grant delete on public.comments to authenticated;
grant insert (post_id, reporter_id, reason) on public.reports to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;
alter table public.reports  enable row level security;

drop policy if exists "profiles: leitura pública" on public.profiles;
create policy "profiles: leitura pública" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "profiles: cria o próprio" on public.profiles;
create policy "profiles: cria o próprio" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "profiles: edita o próprio" on public.profiles;
create policy "profiles: edita o próprio" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "posts: leitura de visíveis" on public.posts;
create policy "posts: leitura de visíveis" on public.posts for select to anon, authenticated
  using (not hidden or author_id = (select auth.uid()));
drop policy if exists "posts: cria como si" on public.posts;
create policy "posts: cria como si" on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "posts: edita os seus" on public.posts;
create policy "posts: edita os seus" on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "posts: apaga os seus" on public.posts;
create policy "posts: apaga os seus" on public.posts for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists "likes: leitura pública" on public.likes;
create policy "likes: leitura pública" on public.likes for select to anon, authenticated using (true);
drop policy if exists "likes: curte como si" on public.likes;
create policy "likes: curte como si" on public.likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "likes: descurte o seu" on public.likes;
create policy "likes: descurte o seu" on public.likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "comments: leitura de posts visíveis" on public.comments;
create policy "comments: leitura de posts visíveis" on public.comments for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and (not p.hidden or p.author_id = (select auth.uid()))));
drop policy if exists "comments: comenta como si" on public.comments;
create policy "comments: comenta como si" on public.comments for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "comments: apaga os seus" on public.comments;
create policy "comments: apaga os seus" on public.comments for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists "reports: denuncia como si" on public.reports;
create policy "reports: denuncia como si" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
-- Sem policy de select: denúncias só são lidas com service role (dashboard).
