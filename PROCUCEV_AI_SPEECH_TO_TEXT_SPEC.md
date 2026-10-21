# Procucev AI Tech Hiring Assignment — Implementation Specification

## 1. Project Overview

Build a full-stack web application called **Real-Time Speech to Text** for the Procucev AI Tech Hiring Assignment.

The application lets a user speak into their microphone and see transcription text appear while they speak. It must support multilingual speech, including mixed-language speech such as Hindi + English, to the extent supported by the selected speech recognition provider. Users can save transcripts to a relational database and manage transcription history through CRUD operations.

This is a hiring assignment, and partial completion is acceptable. Prioritize a reliable, demonstrable MVP, clean architecture, readable code, security, and accurate documentation over unnecessary features.

### Required deliverables
1. Public or recruiter-accessible GitHub repository.
2. Deployed frontend and backend application.
3. Relational database persistence.
4. Real-time or incremental transcription, with limitations clearly documented.
5. Transcription history with create, read, update, and delete functionality.
6. A README with setup, architecture, environment variables, testing, and deployment instructions.

---

## 2. Important Implementation Principles

- Inspect the current working directory before creating or modifying files.
- If a project already exists, inspect its structure and preserve useful existing work.
- If the directory is empty, scaffold the project using the structure in this specification.
- Implement in small phases. Do not attempt to generate the entire application in one unverified step.
- After each phase, run the relevant checks and fix errors before continuing.
- Do not claim a feature works unless it has been tested or clearly mark it as unverified.
- Never invent successful test results, API access, deployment URLs, or credentials.
- Do not expose permanent AI provider API keys in browser code or commit secrets to Git.
- Do not use Zod.
- Prefer simple, maintainable JavaScript over unnecessary abstractions.
- Use parameterized SQL queries for all database operations.
- Clearly distinguish final transcription text from temporary/interim text.
- Do not save duplicate records automatically due to repeated stop/save events.
- Be transparent about provider limitations, language support, pricing, quotas, and availability.

---

## 3. Technology Stack

### Frontend
- React
- Vite
- JavaScript (not TypeScript unless the existing project already uses it)
- Tailwind CSS
- shadcn/ui where it is practical
- React Router if multiple pages/routes are needed
- Fetch API or a small centralized API client

### Backend
- Node.js
- Express.js
- JavaScript ES modules
- `pg` package for PostgreSQL
- `dotenv` for local environment variables
- CORS configured for the deployed frontend origin
- A maintained validation approach without Zod (manual validation or another lightweight existing dependency)

### Database
- PostgreSQL
- Hosted PostgreSQL for production (for example, Neon or another suitable provider)
- SQL schema/migration file committed to the repository

### Speech recognition
**Preferred first implementation:** Google Gemini Live API, if current official documentation confirms a supported model and SDK/API flow that provides the required audio input and transcription output.

- Read the latest official Gemini Live API and transcription documentation before coding the integration.
- Verify the currently supported model name, SDK, authentication method, audio format, message protocol, and transcription event types.
- Do not assume that a model name or SDK method from an old example still works.
- Never put a permanent Gemini API key in Vite frontend environment variables.
- If browser-to-provider streaming is supported and required for latency, use only the provider's documented short-lived credential/ephemeral-token pattern. Otherwise proxy audio through the backend, keeping security and latency trade-offs in mind.
- If a provider integration cannot be completed because credentials or quota are unavailable, build and test the rest of the app and document the blocker. Do not fake live AI transcription.
- A browser speech-recognition API may be used as an explicitly labelled fallback/demo mode, but do not represent it as a self-hosted open-source service.
- Optional alternative: an open-source Whisper-based service such as faster-whisper/WhisperLive. This requires a separate streaming/chunking implementation and additional deployment resources. Do not claim standard Whisper inference is inherently real-time.

---

## 4. Functional Requirements

### 4.1 Live transcription page

Create a page that includes:

- Start Recording button.
- Stop Recording button.
- Current recording state: idle, connecting, recording, stopping, saving, error.
- Microphone permission/error feedback.
- Live transcript display.
- Clear transcript action, with confirmation if text would be lost.
- Transcript title input (default: `Untitled transcription`).
- Language indicator if the provider returns language metadata; otherwise display `Auto-detect` or `Not available` rather than inventing a detected language.
- Recording duration, if available.
- Save Transcript button.
- Visible errors and retry guidance.
- A link/button to view transcription history.

#### Recording behavior
1. Ask for microphone access only after the user explicitly clicks Start Recording.
2. Handle denied permission, missing microphone, unsupported browser APIs, connection failure, and interrupted connections.
3. Start the provider's supported live audio session.
4. Capture audio using the officially supported browser audio approach and the provider's required audio format.
5. Send audio continuously or in appropriately small chunks according to official provider guidance.
6. Render interim and/or final transcription updates as they arrive.
7. Prevent duplicate audio loops and clean up all audio tracks, audio contexts, sockets, and provider sessions when stopping or unmounting.
8. On Stop, stop sending audio and finalize the session according to provider documentation.
9. Preserve the resulting transcript in the UI until the user saves or clears it.
10. Saving should happen only when the user explicitly clicks Save (unless an explicitly documented autosave design is implemented; explicit Save is preferred for the MVP).

Do not request microphone permission on page load.

### 4.2 Transcription history dashboard

Create a history page showing saved transcripts.

Each row/card should show:
- Title
- Transcript preview
- Language metadata, if available
- Duration, if available
- Created timestamp
- Updated timestamp where useful
- View/Edit action
- Delete action

Required behavior:
- Load records from the backend.
- Show loading, empty, and error states.
- Search/filter by title and transcript text. This can be client-side for a small dataset or implemented in the backend.
- Open a record in a detail/edit view.
- Edit title and content.
- Save edits to the backend.
- Delete a record after asking for confirmation.
- Refresh the list after create/update/delete.
- Handle a record that no longer exists (404).
- Never show a successful save/delete message before the server confirms success.

Pagination is optional for the MVP.

### 4.3 Transcript CRUD
The user must be able to:
- Create/save a transcription.
- List all saved transcriptions.
- Read one transcription.
- Update title and transcript text.
- Delete a transcription.

Do not add authentication unless time allows or the existing project already has it. If the app is deployed without authentication, document that it is a public demo and do not store sensitive speech content. Avoid pretending that records are private in a single-user unauthenticated deployment.

---

## 5. Database Design

Create `server/sql/schema.sql`.

Suggested table:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS transcriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL DEFAULT 'Untitled transcription',
    content TEXT NOT NULL,
    language VARCHAR(100),
    duration_seconds INTEGER CHECK (
        duration_seconds IS NULL OR duration_seconds >= 0
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at
    ON transcriptions (created_at DESC);
```

Notes:
- If the chosen hosted database does not allow `pgcrypto`, generate UUIDs in Node.js using the built-in `crypto.randomUUID()` and adjust the schema accordingly.
- Update `updated_at` in the application when a record is edited, or use a database trigger if implemented consistently.
- Keep SQL initialization reproducible and document how to run it.
- Do not save raw audio unless specifically required; this assignment requires transcript history, not audio storage.

---

## 6. REST API Specification

Base path: `/api`

### Health
`GET /api/health`
- Returns a small status payload, such as `{ "status": "ok" }`.
- Optionally check database connectivity separately, without leaking connection details.

### Create
`POST /api/transcriptions`

Example request:
```json
{
  "title": "Daily meeting",
  "content": "Aaj we need to finish the project",
  "language": "Hindi + English",
  "duration_seconds": 42
}
```

Expected behavior:
- Validate title and content.
- Trim title and content appropriately.
- Permit an empty language/duration as null.
- Validate duration is a non-negative integer if provided.
- Insert using parameterized SQL.
- Return the inserted row with HTTP `201`.

### List
`GET /api/transcriptions`
- Return rows ordered newest first.
- Optional query parameter `search` may filter title/content.
- Use parameterized SQL even for search.
- Return a predictable JSON shape.

### Read one
`GET /api/transcriptions/:id`
- Validate UUID format.
- Return the record or `404`.

### Update
`PUT /api/transcriptions/:id`
- Validate UUID.
- Validate title and content.
- Update `updated_at`.
- Return updated row or `404`.

### Delete
`DELETE /api/transcriptions/:id`
- Validate UUID.
- Return `204` on successful deletion, or a consistent JSON response if the chosen client pattern requires it.
- Return `404` if no row was deleted.

### Error response conventions
Use a consistent shape such as:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A valid title and transcript content are required."
  }
}
```

Do not return SQL statements, stack traces, environment variables, or secrets to the client. Log useful diagnostic information on the server without logging API keys or sensitive transcript content.

---

## 7. Suggested Repository Structure

```text
realtime-speech-to-text/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AppLayout.jsx
│   │   │   ├── AudioRecorder.jsx
│   │   │   ├── LiveTranscript.jsx
│   │   │   ├── TranscriptForm.jsx
│   │   │   ├── HistoryTable.jsx
│   │   │   ├── ConfirmDialog.jsx
│   │   │   └── LoadingState.jsx
│   │   ├── pages/
│   │   │   ├── Transcribe.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── TranscriptDetail.jsx
│   │   ├── services/
│   │   │   └── transcriptionApi.js
│   │   ├── hooks/
│   │   │   └── useLiveTranscription.js
│   │   ├── lib/
│   │   │   └── utils.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   └── package.json
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js
│   │   ├── controllers/
│   │   │   └── transcription.controller.js
│   │   ├── db/
│   │   │   └── pool.js
│   │   ├── middleware/
│   │   │   ├── errorHandler.js
│   │   │   └── notFound.js
│   │   ├── routes/
│   │   │   └── transcription.routes.js
│   │   ├── services/
│   │   │   └── speech.service.js
│   │   ├── app.js
│   │   └── server.js
│   ├── sql/
│   │   └── schema.sql
│   ├── tests/
│   │   └── transcriptions.test.js
│   ├── .env.example
│   └── package.json
├── .gitignore
├── README.md
└── package.json (optional root scripts)
```

This is a suggested structure, not a reason to create empty files. Create files only when they are needed.

---

## 8. UI / UX Requirements

Build a clean, professional, responsive SaaS interface suitable for a technical hiring review.

### General style
- Minimal, polished, consistent spacing and typography.
- Light theme is sufficient; dark mode is optional.
- Use a restrained palette and clear visual hierarchy.
- Accessible labels, keyboard focus states, and adequate contrast.
- Responsive layout for desktop and mobile.
- Use reusable components and avoid a giant single component.

### Navigation
- App name: `VoxNote` (working name; make it easy to change).
- Navigation: `Transcribe`, `History`.
- Simple header with a clear current-page title.
- Do not add fake user profiles, fake analytics, or fabricated statistics.

### Transcribe page
- A clear microphone/recording card.
- Large, readable transcript text area.
- Status badge/indicator for connecting, recording, and errors.
- Recording timer, if reliable.
- Title field and Save button.
- Explain microphone access briefly before or near the Start button.
- Disable actions that are invalid for the current state.

### History page
- Search input.
- Table on desktop and usable cards/list on narrow screens.
- Useful empty state explaining how to create the first transcript.
- Clear Edit and Delete actions.
- Confirmation dialog for destructive actions.
- Toast or inline feedback only after confirmed API responses.

Do not spend excessive time on decorative animation. Functional behavior and reliability matter more.

---

## 9. Security and Reliability

- Keep `.env` files out of Git.
- Commit `.env.example` with placeholder values only.
- Never expose `GEMINI_API_KEY`, `DATABASE_URL`, or other server secrets in frontend bundles.
- Validate all incoming request data.
- Use parameterized SQL.
- Configure CORS to permit only the required frontend origin(s) in production.
- Add sensible request-size limits.
- Do not persist raw audio by default.
- Do not log provider secrets or full transcript content unnecessarily.
- Clean up microphone tracks and audio resources on stop/error/unmount.
- Handle reconnects and provider errors without creating duplicate sessions.
- Make save operations idempotent at the UI level by disabling the Save button while a request is pending.
- If there is no authentication, clearly document the demo's access/privacy limitations.
- Do not implement authentication in a rushed or insecure way merely to add a feature.

---

## 10. Testing Requirements

### Backend tests
Use Node's built-in test runner or an existing test framework. Add tests for:
- Health endpoint.
- Create a valid transcript.
- Reject invalid/missing content.
- List transcripts.
- Read an existing record.
- Return 404 for an unknown record.
- Update title/content.
- Delete a record.
- Validate malformed UUIDs.
- Database errors produce safe error responses.

Use a test database or mock the database layer; never run destructive tests against production data.

### Manual frontend test checklist
- [ ] App loads on desktop and mobile viewport sizes.
- [ ] User is asked for microphone permission only after clicking Start.
- [ ] Permission denial is handled clearly.
- [ ] Start and Stop work without duplicate audio sessions.
- [ ] Transcript text updates as provider events arrive.
- [ ] Multilingual speech is tested if provider credentials are available.
- [ ] Stop recording releases the microphone.
- [ ] Save creates exactly one database record.
- [ ] History displays saved records after page reload.
- [ ] Search works.
- [ ] Editing persists after reload.
- [ ] Deleting removes the record after confirmation.
- [ ] Network/server errors are displayed without crashing the app.
- [ ] Secrets do not appear in browser source or Git history.
- [ ] CORS works for the deployed frontend.

If live provider tests cannot be performed, state exactly why and test the remaining CRUD flow. Do not label simulated text as genuine AI transcription.

---

## 11. Environment Variables

Create `.env.example` files. Do not put actual credentials in them.

### `server/.env.example`
```dotenv
NODE_ENV=development
PORT=8000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
GEMINI_API_KEY=replace_with_your_key
```

Configure TLS/SSL for the production database according to the hosting provider's instructions. Do not blindly hardcode SSL behavior that breaks local development; make it configurable if necessary.

### `client/.env.example`
```dotenv
VITE_API_URL=http://localhost:8000/api
```

Only public configuration belongs in `VITE_*` variables. Never put provider API keys or database credentials in the client environment.

---

## 12. Local Development Commands

Use the currently supported Node.js LTS release when practical. Confirm installed versions before installing dependencies.

Suggested setup:
1. Create the client with Vite.
2. Initialize the server package.
3. Install only required dependencies.
4. Create a local PostgreSQL database.
5. Apply `server/sql/schema.sql`.
6. Copy `.env.example` to `.env` and fill in local credentials.
7. Start the backend and frontend in separate terminals.
8. Test `/api/health` and the CRUD endpoints before adding AI streaming.

Possible scripts:

### Server
- `npm run dev` — start the API in development mode.
- `npm start` — start the production API.
- `npm test` — run backend tests.

### Client
- `npm run dev` — start Vite.
- `npm run build` — create the production build.
- `npm run preview` — preview the build locally.

Provide exact commands in README based on the actual package scripts that were created. Do not document commands that do not exist.

---

## 13. Deployment Plan

Deploy frontend, backend, and database separately unless a suitable combined platform is chosen.

### Database
- Create a hosted PostgreSQL instance.
- Run the SQL schema.
- Configure a restricted database credential.
- Copy the provider's connection string into the backend hosting environment.

### Backend
- Deploy the Express service to a platform such as Render or another suitable host.
- Set `DATABASE_URL`, `GEMINI_API_KEY`, `CLIENT_URL`, `NODE_ENV`, and `PORT` according to platform requirements.
- Use the platform-provided port if required.
- Verify `GET /api/health`.
- Verify CRUD endpoints against the deployed database.
- Check provider support for persistent connections, WebSockets, and streaming timeouts before choosing a hosting plan.

### Frontend
- Deploy the Vite app to Vercel or another suitable static hosting platform.
- Set `VITE_API_URL` to the deployed backend's API base URL.
- Redeploy after changing build-time environment variables.
- Verify the frontend can call the API from the deployed origin.

### Important deployment caveats
- Browser microphone capture generally requires HTTPS, except for localhost.
- Confirm the hosting provider supports the chosen live audio connection and connection duration.
- Free-tier services can sleep, impose quotas, or have expiring database storage. Review current provider terms and do not promise permanent availability.
- Do not invent deployment links. Add them to README only after a real deployment has succeeded.

---

## 14. README Requirements

The finished repository README must include:
1. Project title and short overview.
2. Features and current implementation status.
3. Screenshots or a short demo GIF only if actually created.
4. Technology stack.
5. Architecture overview and data flow.
6. Prerequisites.
7. Local installation steps.
8. PostgreSQL setup/schema instructions.
9. Environment variable reference.
10. Commands for client, server, build, and tests.
11. API endpoint table with example requests.
12. Speech provider configuration and limitations.
13. Deployment steps.
14. Security/privacy notes.
15. Known limitations and future improvements.
16. Actual deployed URLs, once verified.

Do not include API keys, private connection strings, or other secrets in README.

---

## 15. Suggested Implementation Phases

### Phase 1 — Inspect and plan
- Inspect the repository and installed tools.
- Summarize the plan, assumptions, dependencies, and any blockers.
- Do not overwrite existing code without understanding it.

### Phase 2 — Scaffold and database/API
- Set up client/server structure.
- Implement PostgreSQL connection.
- Create schema.
- Implement CRUD and health endpoints.
- Add validation, error handling, and tests.
- Run tests and fix errors.

### Phase 3 — UI and CRUD integration
- Build the main layout, transcription page, history page, and edit/delete flows.
- Connect the frontend to the backend.
- Verify create/read/update/delete manually.

### Phase 4 — Real-time speech integration
- Read current official provider documentation.
- Implement a small isolated speech service/hook.
- Verify audio format and event protocol.
- Show actual streaming results in the UI.
- Handle errors, cleanup, and stop behavior.
- Save the final transcript through the existing CRUD API.

### Phase 5 — Polish and quality
- Improve loading/empty/error states.
- Test responsive design.
- Run tests and production build.
- Check secret handling and CORS.
- Review code for dead files and duplicated logic.

### Phase 6 — Documentation and deployment
- Write the complete README.
- Deploy database, API, and frontend.
- Verify the live health endpoint and CRUD behavior.
- Test microphone access on the HTTPS deployment.
- Record the actual deployment URLs and known limitations.

At the end of each phase, report:
- Files created/changed.
- Features completed.
- Commands run and actual results.
- Issues remaining.
- The next recommended step.

---

## 16. Acceptance Criteria

The MVP is ready to submit when:
- [ ] The frontend runs locally.
- [ ] The backend runs locally.
- [ ] PostgreSQL stores transcript records.
- [ ] All five transcription CRUD endpoints work.
- [ ] The history page can list, edit, and delete records.
- [ ] The app can capture microphone input with permission.
- [ ] Actual incremental transcription works with the chosen provider, or the limitation/blocker is explicitly disclosed.
- [ ] The app handles expected failures and releases microphone resources.
- [ ] No secrets are committed or exposed to the browser.
- [ ] The README accurately explains setup, features, tests, and limitations.
- [ ] A production build succeeds.
- [ ] The deployed frontend and backend have been tested.
- [ ] The GitHub repository contains the finished source and documentation.

---

## 17. Final Instructions to the Coding Agent

Start by inspecting the current directory and report what is already present. Then proceed phase by phase.

Do not stop after writing a plan unless there is a genuine blocker or a decision that requires my input. Make reasonable implementation choices, document them, and continue.

Do not attempt to deploy without the required account access and credentials. If access is unavailable, finish the code and give precise deployment instructions instead.

Do not fake transcripts, mock successful API calls in the production UI, claim unsupported multilingual performance, or claim the application is deployed without verification.

Prioritize a working, honest MVP that a recruiter can clone, run, understand, and test.
