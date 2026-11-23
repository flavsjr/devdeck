import type { AchievementDef } from './types'

// Catálogo de conquistas. Adicionar aqui = aparece no perfil e é avaliado no main.
// Nunca reutilize um id: ele é a chave persistida e sincronizada com a comunidade.

export const ACHIEVEMENTS: AchievementDef[] = [
  // IA / fluxo com o agente
  { id: 'first-prompt', title: 'Hello, Claude', description: 'Conclua o primeiro turno com o agente.', icon: '👋', category: 'ia', metric: 'turns', target: 1, xp: 10 },
  { id: 'turns-50', title: 'Pair programmer', description: '50 turnos com o agente.', icon: '🤝', category: 'ia', metric: 'turns', target: 50, xp: 40 },
  { id: 'turns-500', title: 'Maratonista', description: '500 turnos com o agente.', icon: '🏃', category: 'ia', metric: 'turns', target: 500, xp: 120 },
  { id: 'approved-25', title: 'Mão firme', description: 'Aprove 25 alterações revisadas.', icon: '✅', category: 'ia', metric: 'approved', target: 25, xp: 30 },
  { id: 'rejected-10', title: 'Revisor criterioso', description: 'Rejeite ou peça ajuste em 10 propostas.', icon: '🧐', category: 'ia', metric: 'rejected', target: 10, xp: 40 },
  { id: 'reverts-3', title: 'Ctrl+Z ninja', description: 'Reverta 3 alterações aplicadas.', icon: '⏪', category: 'ia', metric: 'reverts', target: 3, xp: 20 },
  { id: 'mcp-1', title: 'Conector', description: 'Ligue o primeiro servidor MCP.', icon: '🔌', category: 'ia', metric: 'mcpEnabled', target: 1, xp: 15 },
  { id: 'mcp-5', title: 'Orquestrador', description: 'Mantenha 5 servidores MCP ligados.', icon: '🎛️', category: 'ia', metric: 'mcpEnabled', target: 5, xp: 50 },
  { id: 'night-owl', title: 'Coruja', description: 'Conclua 5 turnos entre 0h e 5h.', icon: '🦉', category: 'ia', metric: 'nightTurns', target: 5, xp: 25 },
  { id: 'early-bird', title: 'Madrugador', description: 'Conclua 5 turnos entre 5h e 7h.', icon: '🌅', category: 'ia', metric: 'earlyTurns', target: 5, xp: 25 },

  // Git
  { id: 'provider-1', title: 'Na rede', description: 'Conecte um provedor git (GitHub, GitLab ou Bitbucket).', icon: '🔗', category: 'git', metric: 'providers', target: 1, xp: 15 },
  { id: 'provider-3', title: 'Multiplataforma', description: 'Conecte os três provedores.', icon: '🌐', category: 'git', metric: 'providers', target: 3, xp: 60 },
  { id: 'commits-100', title: 'Centenário', description: '100 commits nos últimos 6 meses.', icon: '💯', category: 'git', metric: 'commits', target: 100, xp: 50 },
  { id: 'commits-500', title: 'Máquina de commits', description: '500 commits nos últimos 6 meses.', icon: '⚙️', category: 'git', metric: 'commits', target: 500, xp: 120 },
  { id: 'prs-20', title: 'Pull requester', description: '20 pull/merge requests nos últimos 6 meses.', icon: '🔀', category: 'git', metric: 'pullRequests', target: 20, xp: 50 },
  { id: 'reviews-20', title: 'Guardião do main', description: '20 code reviews nos últimos 6 meses.', icon: '🛡️', category: 'git', metric: 'reviews', target: 20, xp: 60 },
  { id: 'streak-7', title: 'Semana cheia', description: 'Sequência de 7 dias com commits.', icon: '🔥', category: 'git', metric: 'longestStreak', target: 7, xp: 40 },
  { id: 'streak-30', title: 'Inabalável', description: 'Sequência de 30 dias com commits.', icon: '🌋', category: 'git', metric: 'longestStreak', target: 30, xp: 150 },
  { id: 'polyglot', title: 'Poliglota', description: 'Repositórios em 5 linguagens diferentes.', icon: '🗣️', category: 'git', metric: 'languages', target: 5, xp: 40 },

  // Foco
  { id: 'focus-1', title: 'Primeiro pomodoro', description: 'Complete um ciclo de foco de 25 min.', icon: '🍅', category: 'foco', metric: 'focusSessions', target: 1, xp: 10 },
  { id: 'focus-25', title: 'Zona de flow', description: 'Complete 25 ciclos de foco.', icon: '🎧', category: 'foco', metric: 'focusSessions', target: 25, xp: 60 },
  { id: 'profile-complete', title: 'Cartão de visita', description: 'Preencha nome e headline do perfil.', icon: '🪪', category: 'foco', metric: 'profileComplete', target: 1, xp: 10 },

  // Agenda
  { id: 'agenda-1', title: 'Organizado', description: 'Crie o primeiro evento na agenda.', icon: '📅', category: 'agenda', metric: 'eventsCreated', target: 1, xp: 10 },
  { id: 'agenda-10', title: 'Agenda em dia', description: 'Crie 10 eventos.', icon: '🗓️', category: 'agenda', metric: 'eventsCreated', target: 10, xp: 30 },
  { id: 'ics-1', title: 'Sincronizado', description: 'Assine um calendário ICS (Outlook/Google).', icon: '🔄', category: 'agenda', metric: 'icsFeeds', target: 1, xp: 15 },

  // Comunidade
  { id: 'article-1', title: 'Autor', description: 'Publique seu primeiro artigo.', icon: '✍️', category: 'comunidade', metric: 'articles', target: 1, xp: 25 },
  { id: 'article-10', title: 'Colunista', description: 'Publique 10 artigos.', icon: '📰', category: 'comunidade', metric: 'articles', target: 10, xp: 100 },
  { id: 'snippet-1', title: 'Compartilhador', description: 'Publique o primeiro snippet de código.', icon: '🧩', category: 'comunidade', metric: 'snippets', target: 1, xp: 20 },
  { id: 'snippet-10', title: 'Biblioteca viva', description: 'Publique 10 snippets.', icon: '📚', category: 'comunidade', metric: 'snippets', target: 10, xp: 80 },
  { id: 'likes-10', title: 'Curtido', description: 'Receba 10 curtidas.', icon: '❤️', category: 'comunidade', metric: 'likesReceived', target: 10, xp: 40 },
  { id: 'likes-100', title: 'Referência', description: 'Receba 100 curtidas.', icon: '🌟', category: 'comunidade', metric: 'likesReceived', target: 100, xp: 150 }
]

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export const CATEGORY_LABEL: Record<AchievementDef['category'], string> = {
  ia: 'IA & agente',
  git: 'Git',
  foco: 'Foco & perfil',
  agenda: 'Agenda',
  comunidade: 'Comunidade'
}

/** XP acumulado para atingir o nível n (n >= 1): 50 · (n-1) · n / 2. */
export function xpForLevel(level: number): number {
  return (50 * (level - 1) * level) / 2
}

export function levelFromXp(xp: number): { level: number; levelStartXp: number; nextLevelXp: number } {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return { level, levelStartXp: xpForLevel(level), nextLevelXp: xpForLevel(level + 1) }
}
