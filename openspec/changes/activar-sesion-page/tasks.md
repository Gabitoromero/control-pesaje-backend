# Tasks: activar-sesion-page

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Not needed |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Complete Component | PR 1 | Independent |

## Phase 1: Core Implementation

- [ ] 1.1 Create `frontend/src/features/tablet/pages/ActivarSesionPage.tsx` fetching `lineaId` and `lineaNombre` from `useLocation` state.
- [ ] 1.2 Implement state: `step` ('legajo' | 'pin'), `legajo` (string), `pin` (string), `error` (string | null).
- [ ] 1.3 Add custom numeric keypad mapping digits 0-9 and `⌫` to the current active field (legajo or pin).
- [ ] 1.4 Render the display viewer using the exact classes `.bg-slate-800.border.border-slate-700.rounded-2xl`.
- [ ] 1.5 Implement "Continuar" button (disabled if no legajo) to switch to PIN step.
- [ ] 1.6 Implement "Activar sesión" button (disabled if PIN < 4 digits) to trigger the `activar-sesion` API.
- [ ] 1.7 Add API call logic: fetch or axios `POST /api/auth/activar-sesion` using `{ lineaId, legajo, pin }`.
- [ ] 1.8 Handle successful response by navigating to `/tablet` with state `{ lineaId, legajo }`.
- [ ] 1.9 Handle error response by setting error text to "PIN o legajo incorrecto".

## Phase 2: Testing / Verification

- [ ] 2.1 Run tests `npm run test ActivarSesionPage` to ensure all existing cases pass.
- [ ] 2.2 Manually review that DOM element names match test criteria (e.g. "⌫", "Continuar", "Activar sesión").
