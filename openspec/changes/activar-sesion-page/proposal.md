# Proposal: Activar Sesion Page

## Intent
Rebuild the frontend `ActivarSesionPage.tsx` for Layer 2 Session Activation, implementing a custom 2-step keypad (legajo and PIN) that flawlessly matches existing styling and passes the strict DOM node requirements of the current test suite.

## Scope
### In Scope
- Custom keypad component
- API integration with POST `/api/auth/activar-sesion`
- Local state management (Legajo step -> PIN step)
- Full compliance with `ActivarSesionPage.test.tsx`

### Out of Scope
- Backend modifications (already complete)
- Modifying the existing test file

## Capabilities
### New Capabilities
- `frontend-auth`: Layer 2 Auth (Legajo + PIN) custom keypad UI.

### Modified Capabilities
- None

## Approach
Implement a React component driven strictly by the DOM and CSS class requirements of `ActivarSesionPage.test.tsx`.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/features/tablet/pages/ActivarSesionPage.tsx` | New | Main UI component |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Test suite DOM requirements are strict | High | Closely inspect the test file to ensure exactly the same classes and roles are used |

## Rollback Plan
Delete the component and revert any route additions.

## Success Criteria
- [ ] `npm run test ActivarSesionPage` passes 100%.
