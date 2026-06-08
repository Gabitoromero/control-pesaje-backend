# Delta for frontend-auth

## ADDED Requirements

### Requirement: Custom Keypad UI
The system MUST render a numeric keypad matching existing Tailwind classes.

#### Scenario: Keypad Display
- GIVEN the user is on the Activar Sesion page
- WHEN the component renders
- THEN the keypad display element MUST have the class `.bg-slate-800.border.border-slate-700.rounded-2xl`
- AND the keypad MUST have a backspace button `⌫`.

### Requirement: 2-Step Flow
The system MUST handle a 2-step flow: Legajo entry, then PIN entry.

#### Scenario: Legajo to PIN transition
- GIVEN the user is on the Legajo step
- WHEN the user inputs a legajo and clicks "Continuar"
- THEN the system MUST transition to the PIN entry step.

### Requirement: API Integration and Navigation
The system MUST call `POST /api/auth/activar-sesion` with `{ legajo, pin, lineaProduccionId }`.
The system MUST navigate to `/tablet` on success with `state: { lineaId, legajo }`.
The system MUST show an error on invalid credentials.

#### Scenario: Successful Login
- GIVEN the user is on the PIN step
- WHEN the user enters a valid PIN and clicks "Activar sesión"
- THEN the system MUST call the API
- AND the system MUST navigate to `/tablet` with the correct state.

#### Scenario: Failed Login
- GIVEN the user is on the PIN step
- WHEN the user enters an invalid PIN and clicks "Activar sesión"
- THEN the system MUST show an error message "PIN o legajo incorrecto".
