# Proposal: Tolerated Out-of-Range Samples Count Toward Stage Progress

## Intent
Change the stage-completion predicate so that a `Muestra` registered as `fuera_de_rango` (out of range) counts toward `RutaPasadaEtapa.cantidadMuestrasRequeridas`, on equal footing with `ok`. Previously only `ok` samples counted, which forced operators to keep re-measuring a stage indefinitely whenever every sample landed outside tolerance, even though the system already persists out-of-range samples for traceability and never blocks their registration.

This change **supersedes** the `Sequential Stage Progression` requirement defined in `openspec/changes/muestra-pasada-logic/specs/muestra-pasada-domain/spec.md` (already applied and verified). That change is not edited directly; this delta documents the new, narrower rule that replaces it going forward.

## Scope

### In Scope
- Backend: `MuestraService.registrarMuestra` preceding-stage-completion check now counts `estadoValidacion IN (ok, fuera_de_rango)` instead of only `ok`.
- Frontend: `stageProgress.ts` (`deriveStageProgress`, `deriveEtapasConEstado`) applies the same widened predicate via `ESTADOS_QUE_AVANZAN = ['ok', 'fuera_de_rango']`.
- Frontend: stage counter UI label simplified from `"N / M muestras OK"` to `"N / M"`, since the count no longer exclusively reflects `ok` samples.
- `BUSINESS_RULES.md` RN-14 updated to describe the new predicate.

### Out of Scope
- No change to the `MuestraEstadoValidacion` enum or its values.
- No change to UI colors in any component.
- No change to the 20%-tolerance blocking filter (`frontend/src/features/tablet/utils/tolerance.ts`).
- No change to Excel export or "% conforme" dashboard statistics.
- No database migration — the enum and schema are unchanged.
- No minimum requirement of at least one `ok` sample; the final predicate is strictly `count(ok + fuera_de_rango) >= cantidadMuestrasRequeridas`.

## Capabilities

### Modified Capabilities
- `muestra-pasada-domain`: `Sequential Stage Progression` requirement narrowed/widened as described below.

## Approach
1. Backend gate predicate (`muestra.service.ts`): change the `em.count` filter from `estadoValidacion: OK` to `estadoValidacion: { $in: [OK, FUERA_DE_RANGO] }`.
2. Frontend gate predicate (`stageProgress.ts`): rename `countOkMuestras` → `countMuestrasParaAvance`, replace the strict `=== 'ok'` check with membership in `ESTADOS_QUE_AVANZAN`.
3. Frontend counter text (`StageProgressPanel.tsx`): drop the `" muestras OK"` suffix, keep the `N / M` fraction; colors and CSS classes are untouched.
4. Update `BUSINESS_RULES.md` RN-14 prose to reflect the new predicate.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/services/muestra.service.ts` | Modified | Preceding-stage completion count now includes `fuera_de_rango`. |
| `backend/BUSINESS_RULES.md` | Modified | RN-14 prose updated. |
| `frontend/src/features/tablet/utils/stageProgress.ts` | Modified | Gate predicate widened; `countOkMuestras` renamed to `countMuestrasParaAvance`. |
| `frontend/src/features/tablet/components/StageProgressPanel.tsx` | Modified | Counter text simplified to `N / M` (no color/class changes). |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing tests encoding the old "fuera_de_rango never advances" behavior break | High (expected) | Located and updated `usePasadaState.test.ts` (`etapaActiva`/`etapasConEstado` cases) and the `TabletWorkspace.test.tsx` ordering test's fixture during apply, alongside the tasks explicitly listed in the change checklist. |
| Operators may over-trust a fully out-of-range stage as "done" | Low | Out-of-range samples remain visibly flagged (`fuera_de_rango` badge/color unchanged); only the advance gate changed, not the visual state or the 20%-tolerance block. |

## Rollback Plan
- Revert the predicate changes in `muestra.service.ts` and `stageProgress.ts` back to `estadoValidacion === 'ok'` / `OK` only.
- Revert the counter text and `BUSINESS_RULES.md` RN-14 prose.
- No data migration is required since no persisted data changed shape.

## Dependencies
- Supersedes (does not modify) `openspec/changes/muestra-pasada-logic` (already applied/verified).

## Success Criteria
- [x] A stage whose samples are 100% `fuera_de_rango` (meeting the required count) allows registration to advance to the next stage.
- [x] A stage mixing `ok` and `fuera_de_rango` samples (meeting the required count) allows advancing.
- [x] `descartado` samples still do NOT count toward the quota.
- [x] No change to `MuestraEstadoValidacion` enum, colors, the 20% tolerance block, Excel export, or dashboard statistics.
