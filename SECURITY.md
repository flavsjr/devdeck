# Security Policy

**English** · [Português](#política-de-segurança)

DevDeck runs an AI agent that edits files and executes commands on your machine, stores provider tokens and talks to a public backend. Security reports are taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| Latest `0.x` release / `main` | ✅ |
| Older versions | ❌ |

## Reporting a vulnerability

- **Do not open a public issue.**
- Use GitHub's private reporting: **Security → Report a vulnerability** on this repository.
- Include affected version or commit, steps to reproduce, impact, and a proof of concept if you have one. Never include real tokens or personal data.
- You should get a first answer within 7 days. Fixes are released as soon as possible and credited in the [CHANGELOG](CHANGELOG.md) unless you prefer otherwise.

## Scope

In scope: the Electron main/preload/renderer code, IPC validation, workspace trust and edit confinement, secret storage, the Supabase migrations (RLS, grants, triggers) and the CI workflows in this repository.

Out of scope: vulnerabilities in third-party services (Anthropic, GitHub, GitLab, Bitbucket, Supabase, Spotify) — report those to the vendor.

---

## Política de segurança

O DevDeck roda um agente de IA que edita arquivos e executa comandos na sua máquina, guarda tokens de provedores e fala com um backend público. Relatos de segurança são levados a sério.

- **Não abra issue pública.**
- Use o reporte privado do GitHub: **Security → Report a vulnerability** neste repositório.
- Informe versão ou commit, passos para reproduzir, impacto e prova de conceito, se tiver. Nunca inclua tokens reais ou dados pessoais.
- Primeira resposta em até 7 dias. Correções saem o quanto antes e são creditadas no [CHANGELOG](CHANGELOG.md), salvo se você preferir anonimato.
- Escopo: código Electron (main, preload, renderer), validação de IPC, confiança no workspace e confinamento de edições, armazenamento de segredos, migrations do Supabase e workflows de CI deste repositório. Falhas em serviços de terceiros devem ser reportadas ao fornecedor.
