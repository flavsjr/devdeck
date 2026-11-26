import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import type { SettingSource } from '@anthropic-ai/claude-agent-sdk'
import { describeGitRisk } from './lib/gitconfig'
import { classifyEditPath, type EditVerdict } from './lib/paths'
import { CLAUDE_DIR_LIMITS, describeSummary, summarizeProjectConfig, type ClaudeDirEntry, type ClaudeDirScan } from './lib/trust'
import { GIT_FOOTER, gitGate, recordGitDecision, showDialog } from './gitTrust'
import { resolveReal } from './realpath'
import { getTrustedHash, trustWorkspace } from './store'

// Confiança em workspaces de terceiros (B1, B3) e confinamento de edições (B2).

export { resolveReal }

export function classifyEditTarget(cwd: string, filePath: string): EditVerdict {
  if (!filePath) return 'outside'
  return classifyEditPath(resolveReal(cwd), resolveReal(filePath))
}

function readIfExists(file: string): string | null {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

/**
 * Fontes de configuração do projeto para o SDK. Hooks, permissões, env, helpers e MCPs do repositório
 * executam código sem passar pela aprovação do DevDeck: só carregam depois de o usuário confiar
 * no workspace, e a confiança cai se esses arquivos mudarem.
 */
/**
 * Varre .claude/ sem seguir links (lstat): arquivo entra pelo sha256 do conteúdo, link pelo alvo.
 * Passou dos limites → overflow (o diálogo aparece sempre; falha fechada).
 */
export function scanClaudeDir(cwd: string): ClaudeDirScan {
  const base = join(cwd, '.claude')
  const entries: ClaudeDirEntry[] = []
  let bytes = 0
  let overflow = false
  const walk = (dir: string, rel: string, depth: number): void => {
    if (overflow) return
    if (depth > CLAUDE_DIR_LIMITS.depth) {
      overflow = true
      return
    }
    let names: string[]
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      if (entries.length >= CLAUDE_DIR_LIMITS.files) {
        overflow = true
        return
      }
      const abs = join(dir, name)
      const path = rel ? `${rel}/${name}` : name
      let st
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) {
        let target = '?'
        try {
          target = readlinkSync(abs)
        } catch {
          // alvo ilegível: entra como '?'
        }
        entries.push({ path, kind: 'link', digest: target })
      } else if (st.isDirectory()) {
        walk(abs, path, depth + 1)
      } else if (st.isFile()) {
        bytes += st.size
        if (bytes > CLAUDE_DIR_LIMITS.bytes) {
          overflow = true
          return
        }
        let digest = '?'
        try {
          digest = createHash('sha256').update(readFileSync(abs)).digest('hex')
        } catch {
          // ilegível: o hash muda quando voltar a ser legível
        }
        entries.push({ path, kind: 'file', digest })
      } else {
        entries.push({ path, kind: 'other', digest: String(st.mode) })
      }
    }
  }
  if (existsSync(base)) walk(base, '', 0)
  return { entries, overflow }
}

export interface WorkspaceDecision {
  settingSources: SettingSource[]
  /** Git do workspace liberado (limpo ou confiado). Falso → o agente recebe env sem repositório. */
  gitAllowed: boolean
  /** Submódulos vistos pelo gate: o agente recebe `submodule.<nome>.ignore=all` para cada um (hotfix v0.6.1). */
  submodules: string[]
}

/**
 * Decide, antes de abrir a sessão do agente, o que carrega do projeto (.claude/, .mcp.json) e se o git
 * pode rodar. Um diálogo só, com seções; "Abrir sem…" é o padrão e o cancelamento.
 */
export async function decideWorkspace(cwd: string, loadProject: boolean): Promise<WorkspaceDecision> {
  const root = resolveReal(cwd)
  const summary = loadProject ? summarizeProjectConfig(readIfExists(join(cwd, '.claude', 'settings.json')), readIfExists(join(cwd, '.mcp.json')), scanClaudeDir(cwd)) : null
  const projectOk = !summary || !summary.risky || (!summary.overflow && getTrustedHash(root) === summary.hash)

  let gate: Awaited<ReturnType<typeof gitGate>> | null = null
  try {
    gate = await gitGate(cwd)
  } catch {
    gate = null // sem git instalado: nada a decidir; o agente segue sem repositório
  }
  // Bloqueado (H07.3) não pergunta: não há o que confiar; os motivos aparecem na aba Alterações.
  const askGit = Boolean(gate && !gate.allowed && !gate.declined && !gate.summary.blocked)
  const askProject = !projectOk

  const submodules = gate?.summary.submodules ?? []
  if (!askProject && !askGit) return { settingSources: loadProject && projectOk ? ['project'] : [], gitAllowed: Boolean(gate?.allowed) || !gate, submodules }

  const both = askProject && askGit
  const response = await showDialog({
    type: 'warning',
    title: askGit ? `Abrir "${basename(root)}" com segurança?` : 'Confiar neste workspace?',
    message: both
      ? `"${basename(root)}" quer carregar configurações e tem ajustes do git que executam programas sem passar pela aprovação do DevDeck.`
      : askGit
        ? 'Este repositório tem configurações do git que podem executar programas quando o DevDeck lê o status ou o diff.'
        : `"${basename(root)}" quer carregar configurações que executam comandos sem passar pela aprovação do DevDeck.`,
    detail: [
      askProject && summary ? describeSummary(summary) : '',
      askGit && gate ? describeGitRisk(gate.summary) : '',
      askGit ? GIT_FOOTER : 'Só confie em repositórios que você conhece. Se esses arquivos mudarem, o DevDeck pergunta de novo.'
    ]
      .filter(Boolean)
      .join('\n'),
    buttons: both ? ['Abrir sem carregar nada', 'Confiar e carregar tudo'] : askGit ? ['Abrir sem git', 'Confiar e usar git'] : ['Não carregar', 'Confiar e carregar'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  const ok = response === 1
  if (askGit && gate) recordGitDecision(cwd, gate.summary, ok)
  // Com overflow a confiança vale só desta vez: não dá para saber se o conteúdo muda depois.
  if (ok && askProject && summary && !summary.overflow) trustWorkspace(root, summary.hash)
  const projectLoaded = loadProject && (projectOk || ok)
  return { settingSources: projectLoaded ? ['project'] : [], gitAllowed: !gate || gate.allowed || (askGit && ok), submodules }
}
