import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ACHIEVEMENT_BY_ID } from '@shared/achievements'
import { useStore } from '../store'
import { supabase, POST_SELECT, type Comment, type CommunityProfile, type Post } from '../supabase'
import { Markdown } from './Markdown'

// Comunidade: feed de artigos e snippets no Supabase (leitura pública, escrita autenticada via RLS).

type Tab = 'feed' | 'mine' | 'new'
type KindFilter = 'all' | 'article' | 'snippet'

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function Author({ a }: { a: Post['author'] }) {
  if (!a) return <span className="muted">anônimo</span>
  return (
    <span className="author">
      <b>@{a.username}</b> <span className="pill">nv {a.level}</span>
      {a.badges.map((b) => {
        const def = ACHIEVEMENT_BY_ID.get(b)
        return def ? (
          <span key={b} title={def.title}>
            {def.icon}
          </span>
        ) : null
      })}
    </span>
  )
}

function SetupNeeded() {
  return (
    <div className="view-pad">
      <div className="view-head">
        <h2>Comunidade</h2>
      </div>
      <div className="card">
        <div className="panel-title">Backend da comunidade não configurado</div>
        <ol className="small">
          <li>Crie um projeto em supabase.com (plano free serve para começar).</li>
          <li>
            No SQL Editor, rode <code>supabase/migrations/0001_community.sql</code> deste repositório.
          </li>
          <li>
            Em Authentication → Email Templates → Magic Link, inclua <code>{'{{ .Token }}'}</code> no corpo para o login por código de 6 dígitos.
          </li>
          <li>
            Copie <code>.env.example</code> para <code>.env</code> com a URL e a chave publishable/anon (nunca a service_role).
          </li>
          <li>
            Reinicie com <code>npm run dev</code>.
          </li>
        </ol>
      </div>
    </div>
  )
}

function Login() {
  const notify = useStore((s) => s.notify)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const send = async (): Promise<void> => {
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) return notify(error.message)
    setSent(true)
  }

  const verify = async (): Promise<void> => {
    setBusy(true)
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) notify(error.message)
  }

  return (
    <div className="card login">
      <div className="panel-title">Entrar para publicar, curtir e comentar</div>
      {!sent ? (
        <div className="row-actions">
          <input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} />
          <button className="btn primary" disabled={!/.+@.+\..+/.test(email) || busy} onClick={() => void send()}>
            Enviar código
          </button>
        </div>
      ) : (
        <div className="row-actions">
          <input inputMode="numeric" placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void verify()} />
          <button className="btn primary" disabled={code.trim().length < 6 || busy} onClick={() => void verify()}>
            Verificar
          </button>
          <button className="btn ghost" onClick={() => setSent(false)}>
            Trocar e-mail
          </button>
        </div>
      )}
    </div>
  )
}

function UsernameSetup({ uid, onDone }: { uid: string; onDone: (p: CommunityProfile) => void }) {
  const notify = useStore((s) => s.notify)
  const [username, setUsername] = useState('')
  const create = async (): Promise<void> => {
    const local = await window.deck.profile.get()
    const ach = await window.deck.achievements.get()
    const row = {
      id: uid,
      username: username.trim().toLowerCase(),
      display_name: local.profile.displayName || null,
      headline: local.profile.headline || null,
      level: ach.level,
      badges: local.profile.featured.slice(0, 3)
    }
    const { data, error } = await supabase!.from('profiles').insert(row).select().single()
    if (error) return notify(error.code === '23505' ? 'Esse username já existe.' : error.message)
    onDone(data as CommunityProfile)
  }
  return (
    <div className="card">
      <div className="panel-title">Escolha seu @username público</div>
      <p className="small muted">3–24 caracteres: letras minúsculas, números e _. Nível e conquistas em destaque do seu perfil local são exibidos junto.</p>
      <div className="row-actions">
        <input value={username} placeholder="ex.: flavs_dev" onChange={(e) => setUsername(e.target.value)} />
        <button className="btn primary" disabled={!/^[a-z0-9_]{3,24}$/.test(username.trim().toLowerCase())} onClick={() => void create()}>
          Criar perfil
        </button>
      </div>
    </div>
  )
}

function Composer({ uid, onPosted }: { uid: string; onPosted: () => void }) {
  const notify = useStore((s) => s.notify)
  const [kind, setKind] = useState<'article' | 'snippet'>('snippet')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('typescript')
  const [tags, setTags] = useState('')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)

  const publish = async (): Promise<void> => {
    const tagList = [...new Set(tags.split(',').map((t) => t.trim().toLowerCase().replace(/[^a-z0-9#+.-]/g, '')).filter(Boolean))].slice(0, 5)
    setBusy(true)
    const { error } = await supabase!.from('posts').insert({
      author_id: uid,
      kind,
      title: title.trim(),
      body: body.trim(),
      code: kind === 'snippet' ? code : null,
      language: kind === 'snippet' ? language.trim().slice(0, 30) : null,
      tags: tagList
    })
    setBusy(false)
    if (error) return notify(error.message)
    notify('Publicado! 🎉')
    onPosted()
  }

  const valid = title.trim().length >= 3 && (kind === 'article' ? body.trim().length > 0 : code.trim().length > 0)

  return (
    <div className="card editor">
      <div className="row-actions" style={{ marginTop: 10 }}>
        <div className="seg">
          <button className={kind === 'snippet' ? 'on' : ''} onClick={() => setKind('snippet')}>
            Snippet de código
          </button>
          <button className={kind === 'article' ? 'on' : ''} onClick={() => setKind('article')}>
            Artigo
          </button>
        </div>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => setPreview(!preview)}>
          {preview ? 'Editar' : 'Pré-visualizar'}
        </button>
      </div>
      <label>
        Título
        <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {preview ? (
        <div className="post-body">
          {body && <Markdown text={body} />}
          {kind === 'snippet' && code && <Markdown text={`\`\`\`${language}\n${code}\n\`\`\``} />}
        </div>
      ) : (
        <>
          {kind === 'snippet' && (
            <>
              <label>
                Linguagem
                <input value={language} onChange={(e) => setLanguage(e.target.value)} />
              </label>
              <label>
                Código
                <textarea className="mono" rows={10} value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
            </>
          )}
          <label>
            {kind === 'article' ? 'Texto (Markdown)' : 'Explicação (opcional, Markdown)'}
            <textarea rows={kind === 'article' ? 14 : 4} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        </>
      )}
      <label>
        Tags (até 5, separadas por vírgula)
        <input value={tags} placeholder="dotnet, react, sql" onChange={(e) => setTags(e.target.value)} />
      </label>
      <p className="small muted">Não publique segredos, tokens ou código proprietário da sua empresa.</p>
      <div className="row-actions">
        <button className="btn primary" disabled={!valid || busy} onClick={() => void publish()}>
          {busy ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
    </div>
  )
}

function PostDetail({ post, uid, liked, onLike, onBack, onDeleted }: { post: Post; uid?: string; liked: boolean; onLike: () => void; onBack: () => void; onDeleted: () => void }) {
  const notify = useStore((s) => s.notify)
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')

  const loadComments = useCallback(async () => {
    const { data, error } = await supabase!
      .from('comments')
      .select('id, post_id, author_id, body, created_at, author:profiles!comments_author_id_fkey(username, level)')
      .eq('post_id', post.id)
      .order('created_at')
      .limit(200)
    if (error) notify(error.message)
    else setComments(data as unknown as Comment[])
  }, [post.id, notify])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const comment = async (): Promise<void> => {
    const { error } = await supabase!.from('comments').insert({ post_id: post.id, author_id: uid, body: text.trim() })
    if (error) return notify(error.message)
    setText('')
    void loadComments()
  }

  // Electron não tem diálogo de texto nativo (window.prompt): o motivo é coletado num modal próprio.
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const openReport = (): void => {
    if (!uid) return notify('Entre na comunidade para denunciar um post.')
    setReason('')
    setReporting(true)
  }

  const sendReport = async (): Promise<void> => {
    const r = reason.trim()
    if (r.length < 3) return notify('Descreva o motivo (mínimo 3 caracteres).')
    setSending(true)
    const { error } = await supabase!.from('reports').insert({ post_id: post.id, reporter_id: uid, reason: r.slice(0, 500) })
    setSending(false)
    if (error) return notify(error.code === '23505' ? 'Você já denunciou este post.' : error.message)
    setReporting(false)
    notify('Denúncia registrada. Obrigado por ajudar a comunidade!')
  }

  const remove = async (): Promise<void> => {
    if (!confirm('Excluir este post e todos os comentários? Não dá para desfazer.')) return
    const { error } = await supabase!.from('posts').delete().eq('id', post.id)
    if (error) return notify(error.message)
    onDeleted()
  }

  return (
    <div className="post-detail">
      {reporting && (
        <div className="modal-backdrop" role="presentation" onClick={() => !sending && setReporting(false)}>
          <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title" id="report-title">
              Denunciar "{post.title}"
            </div>
            <p className="small muted">Spam, conteúdo ofensivo, segredo exposto (token, senha) ou código proprietário. Com 3 denúncias o post fica oculto até revisão.</p>
            <textarea autoFocus rows={4} maxLength={500} placeholder="Motivo da denúncia" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row-actions">
              <button className="btn danger" disabled={sending || reason.trim().length < 3} onClick={() => void sendReport()}>
                {sending ? 'Enviando…' : 'Enviar denúncia'}
              </button>
              <button className="btn ghost" disabled={sending} onClick={() => setReporting(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      <button className="link" onClick={onBack}>
        ‹ voltar ao feed
      </button>
      <h2>{post.title}</h2>
      <div className="post-meta small">
        <Author a={post.author} /> · {ago(post.created_at)} · {post.tags.map((t) => `#${t}`).join(' ')}
      </div>
      <div className="post-body">
        {post.body && <Markdown text={post.body} />}
        {post.code && (
          <div className="snippet">
            <div className="snippet-head">
              <span className="mono small">{post.language}</span>
              <button className="btn ghost sm" onClick={() => void navigator.clipboard.writeText(post.code ?? '').then(() => notify('Código copiado.'))}>
                Copiar
              </button>
            </div>
            <pre>
              <code>{post.code}</code>
            </pre>
          </div>
        )}
      </div>
      <div className="row-actions">
        <button className={`btn ${liked ? 'primary' : 'ghost'}`} disabled={!uid} onClick={onLike}>
          ♥ {post.like_count}
        </button>
        {uid !== post.author_id && (
          <button className="btn ghost sm" onClick={openReport}>
            Denunciar
          </button>
        )}
        {uid === post.author_id && (
          <button className="btn danger sm" onClick={() => void remove()}>
            Excluir
          </button>
        )}
      </div>
      <div className="comments">
        <div className="panel-title">Comentários ({comments.length})</div>
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <div className="small">
              <b>@{c.author?.username ?? 'anônimo'}</b> <span className="muted">{ago(c.created_at)}</span>
              {c.author_id === uid && (
                <button className="link small" onClick={() => void supabase!.from('comments').delete().eq('id', c.id).then(() => loadComments())}>
                  {' '}
                  excluir
                </button>
              )}
            </div>
            <Markdown text={c.body} />
          </div>
        ))}
        {uid ? (
          <div className="row-actions">
            <textarea rows={2} maxLength={4000} placeholder="Comente algo construtivo…" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn primary" disabled={!text.trim()} onClick={() => void comment()}>
              Comentar
            </button>
          </div>
        ) : (
          <div className="muted small">Entre para comentar.</div>
        )}
      </div>
    </div>
  )
}

export function CommunityView() {
  const notify = useStore((s) => s.notify)
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<CommunityProfile | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('feed')
  const [kind, setKind] = useState<KindFilter>('all')
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [likes, setLikes] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Post | null>(null)
  const [loading, setLoading] = useState(false)
  const uid = session?.user.id

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Perfil público + sincronização de nível/destaques do perfil local.
  useEffect(() => {
    if (!supabase || !uid) {
      setMe(undefined)
      return
    }
    void (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (!data) return setMe(null)
      const local = await window.deck.profile.get()
      const ach = await window.deck.achievements.get()
      const patch = { level: ach.level, badges: local.profile.featured.slice(0, 3) }
      await supabase.from('profiles').update(patch).eq('id', uid)
      setMe({ ...(data as CommunityProfile), ...patch })
    })()
  }, [uid])

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    let query = supabase.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).limit(40)
    if (kind !== 'all') query = query.eq('kind', kind)
    if (tag.trim()) query = query.contains('tags', [tag.trim().toLowerCase()])
    if (q.trim()) query = query.ilike('title', `%${q.trim().replace(/[%_]/g, '')}%`)
    if (tab === 'mine' && uid) query = query.eq('author_id', uid)
    const { data, error } = await query
    setLoading(false)
    if (error) return notify(error.message)
    const list = data as unknown as Post[]
    setPosts(list)
    if (uid && list.length) {
      const { data: mine } = await supabase.from('likes').select('post_id').eq('user_id', uid).in('post_id', list.map((p) => p.id))
      setLikes(new Set((mine ?? []).map((l: { post_id: string }) => l.post_id)))
    }
  }, [kind, tag, q, tab, uid, notify])

  useEffect(() => {
    if (tab !== 'new') void load()
  }, [load, tab])

  // Estatísticas para conquistas de comunidade.
  useEffect(() => {
    if (!supabase || !uid) return
    void supabase
      .from('posts')
      .select('kind, like_count')
      .eq('author_id', uid)
      .then(({ data }) => {
        const rows = (data ?? []) as { kind: string; like_count: number }[]
        void window.deck.achievements.reportCommunity({
          articles: rows.filter((r) => r.kind === 'article').length,
          snippets: rows.filter((r) => r.kind === 'snippet').length,
          likesReceived: rows.reduce((a, r) => a + r.like_count, 0)
        })
      })
  }, [uid, posts])

  const toggleLike = async (p: Post): Promise<void> => {
    if (!uid) return
    const has = likes.has(p.id)
    const next = new Set(likes)
    if (has) next.delete(p.id)
    else next.add(p.id)
    setLikes(next)
    const delta = has ? -1 : 1
    setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, like_count: x.like_count + delta } : x)))
    setOpen((o) => (o && o.id === p.id ? { ...o, like_count: o.like_count + delta } : o))
    const { error } = has ? await supabase!.from('likes').delete().eq('post_id', p.id).eq('user_id', uid) : await supabase!.from('likes').insert({ post_id: p.id, user_id: uid })
    if (error) {
      notify(errMsg(error))
      void load()
    }
  }

  if (!supabase) return <SetupNeeded />

  return (
    <div className="view-pad community">
      <div className="view-head">
        <h2>Comunidade</h2>
        <div className="seg">
          <button className={tab === 'feed' ? 'on' : ''} onClick={() => (setTab('feed'), setOpen(null))}>
            Feed
          </button>
          {uid && me && (
            <>
              <button className={tab === 'mine' ? 'on' : ''} onClick={() => (setTab('mine'), setOpen(null))}>
                Meus posts
              </button>
              <button className={tab === 'new' ? 'on' : ''} onClick={() => (setTab('new'), setOpen(null))}>
                + Publicar
              </button>
            </>
          )}
        </div>
        <span className="spacer" />
        {uid && me && (
          <span className="small muted">
            @{me.username} ·{' '}
            <button className="link small" onClick={() => void supabase!.auth.signOut()}>
              sair
            </button>
          </span>
        )}
      </div>

      {!uid && <Login />}
      {uid && me === null && <UsernameSetup uid={uid} onDone={setMe} />}

      {tab === 'new' && uid && me ? (
        <Composer uid={uid} onPosted={() => setTab('mine')} />
      ) : open ? (
        <PostDetail
          post={open}
          uid={me ? uid : undefined}
          liked={likes.has(open.id)}
          onLike={() => void toggleLike(open)}
          onBack={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null)
            void load()
          }}
        />
      ) : (
        <>
          <div className="row-actions filters">
            <div className="seg">
              {(['all', 'snippet', 'article'] as KindFilter[]).map((k) => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                  {k === 'all' ? 'Tudo' : k === 'snippet' ? 'Códigos' : 'Artigos'}
                </button>
              ))}
            </div>
            <input placeholder="Buscar no título" value={q} onChange={(e) => setQ(e.target.value)} />
            <input style={{ maxWidth: 160 }} placeholder="#tag" value={tag} onChange={(e) => setTag(e.target.value.replace(/^#/, ''))} />
          </div>
          {loading && <div className="muted small pad">Carregando…</div>}
          {!loading && posts.length === 0 && <div className="muted pad">Nada por aqui ainda. Que tal publicar o primeiro?</div>}
          <div className="feed">
            {posts.map((p) => (
              <div key={p.id} className="post-card" onClick={() => setOpen(p)}>
                <div className="post-kind">{p.kind === 'snippet' ? `‹/› ${p.language ?? ''}` : '✍️ artigo'}</div>
                <div className="post-title">{p.title}</div>
                <div className="post-excerpt small muted">{(p.body || p.code || '').slice(0, 180)}</div>
                <div className="post-meta small">
                  <Author a={p.author} /> · {ago(p.created_at)}
                  <span className="spacer" />
                  {p.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                  <button
                    className={`like ${likes.has(p.id) ? 'on' : ''}`}
                    disabled={!uid || !me}
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleLike(p)
                    }}
                  >
                    ♥ {p.like_count}
                  </button>
                  <span className="muted">💬 {p.comment_count}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
