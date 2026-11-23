import { describe, expect, it } from 'vitest'
import * as v from '../../../src/main/lib/validation'

describe('ids', () => {
  it('UUID aceito; caminhos forjados recusados', () => {
    expect(v.uuid.safeParse('3f2b8c1e-9a4d-4e2f-8b1a-2c3d4e5f6a7b').success).toBe(true)
    for (const bad of ['..\\settings', '../settings', 'settings', '', 'C:\\Windows\\x']) {
      expect(v.uuid.safeParse(bad).success).toBe(false)
    }
  })
  it("newOrUuid aceita '' para criação", () => {
    expect(v.newOrUuid.safeParse('').success).toBe(true)
    expect(v.newOrUuid.safeParse('../x').success).toBe(false)
  })
})

describe('settingsPatch', () => {
  it('aceita chaves conhecidas com tipos certos', () => {
    expect(v.settingsPatch.safeParse({ model: 'claude-opus-5-5', effort: 'high', dailyBudgetUsd: 10 }).success).toBe(true)
    expect(v.settingsPatch.safeParse({ spotifyUrl: '' }).success).toBe(true)
    expect(v.settingsPatch.safeParse({ spotifyUrl: 'https://open.spotify.com/playlist/abc' }).success).toBe(true)
  })
  it('recusa chave desconhecida (ex.: apiKeyEnc, lastWorkspace)', () => {
    expect(v.settingsPatch.safeParse({ apiKeyEnc: 'x' }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ lastWorkspace: 'C:\\' }).success).toBe(false)
  })
  it('recusa tipo errado', () => {
    expect(v.settingsPatch.safeParse({ dailyBudgetUsd: '10' }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ dailyBudgetUsd: -1 }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ effort: 'turbo' }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ model: 'gpt-4' }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ spotifyUrl: 'https://evil.example' }).success).toBe(false)
  })
})

describe('agendaEvent', () => {
  const base = { id: '', title: 'Daily', start: '2026-11-23T09:30', durationMin: 15, recurrence: { kind: 'weekdays' }, remindMin: 5, kind: 'daily' }
  it('aceita evento válido', () => {
    expect(v.agendaEvent.safeParse(base).success).toBe(true)
  })
  it('recusa início vazio, link http e id forjado', () => {
    expect(v.agendaEvent.safeParse({ ...base, start: '' }).success).toBe(false)
    expect(v.agendaEvent.safeParse({ ...base, link: 'http://x' }).success).toBe(false)
    expect(v.agendaEvent.safeParse({ ...base, id: '../agenda' }).success).toBe(false)
    expect(v.agendaEvent.safeParse({ ...base, recurrence: { kind: 'weekly', days: [9] } }).success).toBe(false)
  })
})

describe('mcpInput', () => {
  it('recusa nome com caminho e campos extras', () => {
    expect(v.mcpInput.safeParse({ name: 'ok_1', enabled: true, type: 'stdio', command: 'npx' }).success).toBe(true)
    expect(v.mcpInput.safeParse({ name: '../x', enabled: true, type: 'stdio' }).success).toBe(false)
    expect(v.mcpInput.safeParse({ name: 'x', enabled: true, type: 'stdio', extra: 1 }).success).toBe(false)
  })
  it('aceita null (manter segredo) em env e headers, mas não outros tipos', () => {
    expect(v.mcpInput.safeParse({ name: 'x', enabled: true, type: 'stdio', command: 'npx', env: { TOKEN: null } }).success).toBe(true)
    expect(v.mcpInput.safeParse({ name: 'x', enabled: true, type: 'http', url: 'https://a', headers: { Authorization: null } }).success).toBe(true)
    expect(v.mcpInput.safeParse({ name: 'x', enabled: true, type: 'stdio', env: { TOKEN: 1 } }).success).toBe(false)
  })
})

describe('icsFeedInput', () => {
  const base = { id: '', name: 'Trabalho', url: 'https://cal.example.com/secret.ics', enabled: true, remindMin: 10 }
  it('aceita link https/webcal ou vazio (manter)', () => {
    expect(v.icsFeedInput.safeParse(base).success).toBe(true)
    expect(v.icsFeedInput.safeParse({ ...base, url: 'webcal://cal.example.com/x' }).success).toBe(true)
    expect(v.icsFeedInput.safeParse({ ...base, url: '' }).success).toBe(true)
  })
  it('recusa http, lastSync/error/count vindos do renderer', () => {
    expect(v.icsFeedInput.safeParse({ ...base, url: 'http://cal.example.com/x' }).success).toBe(false)
    expect(v.icsFeedInput.safeParse({ ...base, lastSync: 1 }).success).toBe(false)
    expect(v.icsFeedInput.safeParse({ ...base, error: 'x' }).success).toBe(false)
    expect(v.icsFeedInput.safeParse({ ...base, count: 3 }).success).toBe(false)
  })
})

describe('approvalDecision e communityStats', () => {
  it('formatos válidos', () => {
    expect(v.approvalDecision.safeParse({ approve: true, alwaysForSession: true }).success).toBe(true)
    expect(v.approvalDecision.safeParse({ approve: false, feedback: 'ajuste' }).success).toBe(true)
    expect(v.approvalDecision.safeParse({ approve: 'yes' }).success).toBe(false)
    expect(v.communityStats.safeParse({ articles: 1, snippets: 2, likesReceived: 3 }).success).toBe(true)
    expect(v.communityStats.safeParse({ articles: -1, snippets: 0, likesReceived: 0 }).success).toBe(false)
  })
})
