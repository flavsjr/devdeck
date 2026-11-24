-- pgTAP da migration 0002 (H05.6). Rodar com `supabase test db` ou colar no SQL Editor (tudo em rollback).
begin;
create extension if not exists pgtap;
select plan(9);

-- Usuários de teste: um com conta antiga, um recém-criado.
insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'antigo@example.test', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000b2', 'novo@example.test', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000c3', 'antigo2@example.test', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000d4', 'antigo3@example.test', now() - interval '30 days');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000000a1', 'qa_antigo'),
  ('00000000-0000-0000-0000-0000000000b2', 'qa_novo'),
  ('00000000-0000-0000-0000-0000000000c3', 'qa_antigo2'),
  ('00000000-0000-0000-0000-0000000000d4', 'qa_antigo3');

-- 130 posts de outro autor (só para ter o que curtir), com created_at no passado e distinto:
-- fica fora da janela do limite de posts da 0001 e a ordenação é determinística.
insert into public.posts (id, author_id, kind, title, body, created_at)
select gen_random_uuid(), '00000000-0000-0000-0000-0000000000c3', 'article', 'post ' || g, 'corpo', now() - interval '2 hours' - g * interval '1 second'
  from generate_series(1, 130) g;

-- Como o usuário autenticado (RLS ativa).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.likes (post_id, user_id)
     select id, '00000000-0000-0000-0000-0000000000a1' from public.posts order by created_at limit 120 $$,
  '120 curtidas em 1 h passam'
);
select throws_ok(
  $$ insert into public.likes (post_id, user_id)
     select id, '00000000-0000-0000-0000-0000000000a1' from public.posts order by created_at offset 120 limit 1 $$,
  'P0001', null, 'a 121ª curtida em 1 h é recusada'
);
-- Descurtir não devolve a cota (o evento continua contando).
delete from public.likes where user_id = '00000000-0000-0000-0000-0000000000a1';
select throws_ok(
  $$ insert into public.likes (post_id, user_id)
     select id, '00000000-0000-0000-0000-0000000000a1' from public.posts order by created_at limit 1 $$,
  'P0001', null, 'curtir/descurtir não zera o limite'
);

select throws_ok($$ select * from public.rate_events $$, '42501', null, 'cliente não lê rate_events');
select throws_ok($$ insert into public.rate_events (user_id, action) values ('00000000-0000-0000-0000-0000000000a1', 'like') $$, '42501', null, 'cliente não grava rate_events');
select throws_ok($$ select public.enforce_rate('00000000-0000-0000-0000-0000000000a1', 'like', 1, interval '1 hour', 'x') $$, '42501', null, 'cliente não chama enforce_rate');

-- Denúncias: 10 em 24 h passam, a 11ª não.
select lives_ok(
  $$ insert into public.reports (post_id, reporter_id, reason)
     select id, '00000000-0000-0000-0000-0000000000a1', 'spam repetido' from public.posts order by created_at limit 10 $$,
  '10 denúncias em 24 h passam'
);
select throws_ok(
  $$ insert into public.reports (post_id, reporter_id, reason)
     select id, '00000000-0000-0000-0000-0000000000a1', 'spam repetido' from public.posts order by created_at offset 10 limit 1 $$,
  'P0001', null, 'a 11ª denúncia em 24 h é recusada'
);

-- Conta nova denuncia, mas não conta para ocultar: 2 antigas + 1 nova não ocultam.
reset role;
with alvo as (select id from public.posts order by created_at desc limit 1)
insert into public.reports (post_id, reporter_id, reason)
select alvo.id, r.uid::uuid, 'conteúdo ruim'
  from alvo, (values ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4')) r(uid);
select is(
  (select hidden from public.posts order by created_at desc limit 1),
  false,
  'denúncia de conta com menos de 72 h não oculta o post'
);

select * from finish();
rollback;
