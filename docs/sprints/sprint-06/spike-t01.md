# Sprint 06 — resultado do spike T01 (2026-11-24)

Capturado com `CLAUDE_CONFIG_DIR` vazio e chave falsa contra servidor local (sem tocar a conta real). Fixtures em `tests/fixtures/agent-errors/`.

| Cenário | `init.apiKeySource` | `assistant.error` | `result.api_error_status` | Texto do SDK |
|---|---|---|---|---|
| chave recusada | `ANTHROPIC_API_KEY` | `authentication_failed` | 401 | "Invalid API key · Fix external API key" |
| sem credencial | `none` | `authentication_failed` | `null` | "Not logged in · Please run /login" |
| limite (429) | `ANTHROPIC_API_KEY` | `rate_limit` | 429 | "API Error: Request rejected (429) · …" |
| sobrecarga (529) | `ANTHROPIC_API_KEY` | **`server_error`** | 529 | "API Error: 529 Overloaded. …" |
| créditos | `ANTHROPIC_API_KEY` | `billing_error` | 400 | "Credit balance is too low" |
| sem rede | `ANTHROPIC_API_KEY` | `server_error` | `null` | "API Error: Connection refused … (ECONNREFUSED)" |
| OAuth expirada | `none` (OAuth válido também vem `none`) | — | — | não capturável: sessão do usuário estava válida em 2026-11-24 (rodou com autorização; turno normal). Texto conhecido da Sprint 05: "OAuth session expired and could not be refreshed" |

- O enum tipado existe e cobre os casos da H06.7 → **H06.7 continua Should**.
- `apiKeySource: 'none'` vale tanto para "sem credencial" quanto para login OAuth. Logo `auth_missing` × `auth_expired` só se separam pelo texto ("Not logged in" × "OAuth … expired"); sem casar nenhum dos dois, `authentication_failed` sem chave vira `auth_expired` com o texto genérico "Sua sessão do Claude não é válida" (falha segura: as duas ações servem). A fixture `oauth-expired.json` é sintética, com o texto da Sprint 05, e anotada como tal; a prova real fica no roteiro manual (T26).
- 529 chega como `server_error`, não `overloaded`: o classificador usa o status 529. Sem rede = `server_error` + status `null` + `ECONNREFUSED`/`ENOTFOUND` no texto.
- Em todos os casos o `result` vem com `subtype: 'success'` + `is_error: true` **e** a iteração da query lança "Claude Code returned an error result: …". É a origem do erro triplicado (T18).
- O corpo do 401 levava `sk-ant-…` e `Bearer …` falsos e eles não apareceram em nenhuma mensagem: o SDK reescreve o texto. O `redactPatterns` continua obrigatório (stderr, OAuth e rethrow).

Emendas a anexar no fim da sprint (T36, T42, T16): ADR-014 (tema claro e camada `views`), ADR-015 (`redactPatterns`), ADR-010 (job `db`).
