# Design: activar-sesion-page

## Technical Approach

Implement a two-step state machine within `ActivarSesionPage.tsx` using React's `useState` hook to capture the `legajo` and `PIN` successively via a custom numeric keypad. The UI will exactly mirror the classes expected by `ActivarSesionPage.test.tsx`, leveraging Tailwind CSS for styling and `react-router-dom` for navigation. The submission will integrate with the existing `activar-sesion` API.

## Architecture Decisions

### Decision: State Management Strategy

**Choice**: Local component state using `useState`.
**Alternatives considered**: Context API, Zustand.
**Rationale**: The state (legajo, PIN, current step, error message) is strictly localized to this single page. Exposing it globally is unnecessary overhead.

### Decision: Keypad Implementation

**Choice**: Inline rendering of keypad buttons within the page component, mapping an array of digits.
**Alternatives considered**: Extracting a standalone `<NumericKeypad />` component.
**Rationale**: Since the test directly interacts with the buttons by role and specific name in the context of this page, keeping them inline ensures strict compliance with the test DOM structure without over-engineering a component not yet needed elsewhere.

## Data Flow

    User (Keypad) ──→ Component State (Legajo -> PIN)
         │
         └─────────→ POST /api/auth/activar-sesion ──→ (Success) Navigate to /tablet
                                                   ──→ (Error) Show Error Message

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/features/tablet/pages/ActivarSesionPage.tsx` | Modify | Implement the two-step activation UI, custom keypad, and API integration. |

## Interfaces / Contracts

**Component State:**
```tsx
type Step = 'legajo' | 'pin';

// State managed via useState hooks:
// const [step, setStep] = useState<Step>('legajo');
// const [legajo, setLegajo] = useState('');
// const [pin, setPin] = useState('');
// const [error, setError] = useState<string | null>(null);
```

**Location State Contract (Input):**
```tsx
interface LocationState {
  lineaId: number;
  lineaNombre?: string;
}
```

**API Integration:**
Uses the fetch API or existing axios instance to `POST /api/auth/activar-sesion` with `{ lineaId, legajo, pin }`.

**Navigation Contract (Output):**
```typescript
navigate('/tablet', { state: { lineaId: number, legajo: string } })
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | ActivarSesionPage interactions | Pass `ActivarSesionPage.test.tsx` 100%. Ensures correct DOM roles (button "1", "Continuar", "Activar sesión") and exact class `.bg-slate-800.border.border-slate-700.rounded-2xl` for the display viewer. |

## Migration / Rollout

No migration required.

## Open Questions

- None
