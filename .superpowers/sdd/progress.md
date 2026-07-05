# Progresso — Plano 1 (Fase 0+1: Persistência do Kaua)

Branch: `feat/kaua-cerebro` · Base: `7784f3d` (docs)
Plano: `docs/superpowers/plans/2026-07-05-kaua-fase1-persistencia.md`

- Task 0 (harness): coberto pelo baseline verde (50 testes); smoke /dev/inbound ao vivo = runtime (Pietro, precisa OPENAI_API_KEY).
- Grupo A = Task 1 (mappers puros) + Task 2 (contrato in-memory): COMPLETO (commits 0d72400..42b78d2, review limpo — spec ✅ qualidade aprovada)
- Grupo B = Tasks 3-8 (6 repos Prisma + seedPilot): COMPLETO (commits 6cb4cc9..1bd1934, review spec ✅ qualidade aprovada; typecheck c/ prisma generate real)
  - Minors p/ triar no review final: (1) Service.getById/EmissionIntent.getById sem tenant-scope (herdado da porta, sem caller); (2) seedPilot findFirst→create não-atômico (ok single-instance); (3) seedPilot não atualiza displayName ao reusar "Padrão" (cosmético)
- Grupo C = Task 9 (wire main.ts): COMPLETO (commit 57d69bb, review spec ✅ qualidade aprovada; teste Prisma skipped sem DATABASE_URL)
- Review final do branch (Fable 5): COMPLETO — "pronto pra merge com ressalvas"; invariantes duras confirmadas (ato fiscal intocado, multi-tenant consistente, sem migração). Fixes aplicados no commit b53df2a: (IMPORTANT) contrato Prisma auto-seed+cleanup (senão quebrava por FK e sujava o banco); seedPilot displayName no reuse; findFirst determinístico.
- BACKLOG (gates p/ fases futuras): getById sem tenant → NÃO expor via HTTP na Fase 6 sem adicionar integrationId à porta; corrida de inbound (contatos/conversas duplicados) → NÃO ligar Evolution real de forma intensa antes da Fase 5 (buffer+lock); resolve por construção lá; getHistory empate de ms (cosmético); seedPilot clobber de preço → nota p/ Fase 6.
- Estado: branch feat/kaua-cerebro, HEAD b53df2a. Sandbox verde (typecheck + 53 testes).
- Validação DB real: ✅ COMPLETA (05/07, via container node:20 no VPS — IP liberado). Contrato Prisma passou contra a megusDB real (round-trip+IDOR+FK+TLS+cleanup). seedPilot reescrito (commit f5da193) mira co-piloto/int-piloto por upsert-by-id; APLICADO no Azure → int-piloto migrou pro número novo 5512997843384; read-back OK (Integration+JOIN Company=Clínica Sorriso, AgentConfig Kaua, 5 serviços). Piloto pronto pro chip. Método: git archive→/opt/megus-validate→docker run node:20 c/ DATABASE_URL do .env; scratch limpo depois.
- Gates dados p/ Fase 6: company-piloto vazio (recriado pelo seed do test-user); test-user@company-piloto ≠ piloto@co-piloto (painel precisa user em co-piloto).
- FASE 1 = FEITA E VALIDADA EM PROD. HEAD f5da193.

## PLANO 2 (Fase 2/3/4 — cerebro) — branch feat/kaua-cerebro
- Grupo 1 = Tasks 1-3 (contrato AgentContext + PromptComposer + ContextAssembler + AgentBrain + SM.context): COMPLETO (typecheck+typecheck:test limpos, 60 passed|1 skipped/61, regressao identity/emission/happyPath verde; ver .superpowers/sdd/p2-grupo1-report.md — 1 ajuste fora do escopo literal: rename request_identity->intent_emit em handleChatting, obrigatorio p/ compilar o contrato da Task 1)
- Grupo 2 = Task 4 (advance dispatcher + handleChatting + midia->gate B + invariante fiscal): PENDENTE
- Grupo 3 = Task 5 (regressao dos portoes verde + diff dos gates limpo): PENDENTE
