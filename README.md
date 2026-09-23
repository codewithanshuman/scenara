# Scenara

Scenara is a production-oriented **Visual Reality Intelligence** workspace. It compiles images, video, audio, structured AI observations, temporal comparisons, reviewer decisions, and derived scenarios into one traceable evidence graph.

This is not a static product mock. The UI is backed by a persistent API, durable jobs, immutable provenance events, optimistic review locking, configurable evidence policies, cross-modal search, entity linking, change materialization, and a Cloudinary adapter with a deterministic local mode.

## What makes it different

Most media-analysis tools stop at tags or a chatbot response. Scenara treats a physical scene as a versioned evidence system:

1. Original media is fingerprinted before analysis.
2. Structured observations bind to exact regions, frames, or transcript segments.
3. Observations are linked to persistent entities across capture dates.
4. The temporal engine explains appearances, disappearances, movement, and condition changes.
5. Confidence policies decide whether a result is accepted, reviewed, or suppressed.
6. Human decisions use optimistic version locking and enter an immutable audit chain.
7. Simulations branch from an original and remain visibly separated from evidence.

The repository includes an executable urban evidence catalog with **86 concepts and 688 policy variants**. Each variant defines positive cues, exclusions, required fields, confidence thresholds, temporal semantics, severity bands, reviewer questions, recommended actions, and provenance requirements. It is generated from the typed source in `tools/generate-knowledge-catalog.ts`, loaded at server startup, exposed through API endpoints, and evaluated by the policy engine.

## Product surfaces

- **Evidence canvas** — normalized visual anchors over preserved source media, zoom controls, media sequence, video transport, and a pixel-aligned before/after scrubber.
- **Relationship graph** — persisted scene, asset, entity, observation, change, transcript, and scenario nodes with typed edges and layer controls.
- **Temporal matrix** — entity-by-capture comparison with a materialized change ledger.
- **Provenance trace** — SHA-256 event chains, parent hashes, provider references, source-to-derived branches, and integrity reports.
- **Evidence inspector** — confidence, exact supporting sources, structured data, correction, verification, dismissal, deferral, and immutable review history.
- **Ask the graph** — natural-language and structured search across scenes, assets, entities, observations, changes, and transcript moments.
- **Ingest compiler** — multi-file batching, local hashing, signed Cloudinary upload, registration, analysis, entity linking, change rebuilding, and indexing.
- **Scenario Lab** — evidence-safe generative branches with explicit simulated origin and parent linkage.
- **Pipeline inspector** — durable job status, provider mode, storage operations, retries, and progress.

## Architecture

```text
React workbench
  ├─ canvas / graph / timeline / trace
  ├─ review, search, ingest, scenario, pipeline
  └─ typed API client + polling state machine
                  │
                  ▼
Node HTTP application service
  ├─ scene and media services
  ├─ Cloudinary upload / Analyze / Search adapter
  ├─ observation and review workflow
  ├─ entity-linking engine
  ├─ temporal comparison engine
  ├─ evidence graph materializer
  ├─ cross-modal search index
  ├─ confidence and review policy evaluator
  ├─ immutable provenance hash chain
  └─ durable background job queue
                  │
                  ▼
Atomic JSON persistence + generated knowledge catalog
```

The JSON store is intentionally dependency-light for judging and local execution. Transactions serialize through a write queue, clone their working snapshot, persist to a temporary file, and rename atomically. Its interface is isolated so PostgreSQL or SQLite can replace it without changing the application service.

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

The combined development command starts:

- Web workbench: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`

The repository starts in deterministic local-adapter mode, so every major workflow can be judged without credentials. Copy `.env.example` to `.env` and add Cloudinary credentials to enable signed uploads and live AI Vision analysis.

Useful commands:

```bash
pnpm check               # strict TypeScript validation
pnpm test                # engine, persistence, knowledge, and HTTP tests
pnpm build               # production web bundle
pnpm generate:knowledge  # rebuild the policy catalog deterministically
pnpm api                 # API only
pnpm dev:web             # Vite only
```

## Cloudinary production mode

Set the following values in `.env` or in the deployment environment:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
CLOUDINARY_UPLOAD_FOLDER=scenara
```

Secrets never enter the browser. The API signs a narrowly scoped upload payload containing the target folder, generated public ID, context, and optional eager transformations. The browser uploads directly to Cloudinary, then registers the returned asset identity and SHA-256 fingerprint with Scenara.

For analysis, the server sends a schema-constrained prompt to Cloudinary AI Vision, validates the returned JSON with Zod, persists the raw response and normalized observations, links entities, rebuilds temporal changes, and completes the durable job. When credentials are absent, the same pipeline runs with the local deterministic adapter and marks that fact in its warnings.

## Evidence safety model

- Originals are never overwritten by derived or generated assets.
- Every asset has an origin: `original`, `derived`, or `generated`.
- Every provenance event hashes its canonical payload and the previous event hash.
- Review mutations require the observation version the reviewer saw.
- Generated scenarios must start from a preserved original.
- Generated outputs are excluded from original-evidence counts and visibly labeled.
- Policy rules are advisory; they never claim legal compliance.
- High-consequence or contradictory findings are routed to human review.
- A finding must point to media evidence, not merely model prose.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Persistence, provider mode, counts, catalog status |
| `GET/POST` | `/api/scenes` | List or create scenes |
| `GET/PATCH` | `/api/scenes/:id` | Complete scene workspace or scene update |
| `GET` | `/api/scenes/:id/graph` | Full graph or bounded neighborhood |
| `POST` | `/api/assets` | Register uploaded or local evidence |
| `POST` | `/api/analyze` | Queue schema-constrained scene analysis |
| `POST` | `/api/observations/:id/review` | Version-locked reviewer decision |
| `POST` | `/api/search` | Cross-modal evidence search |
| `GET` | `/api/assets/:id/provenance` | Hash-chain verification |
| `POST` | `/api/uploads/signature` | Signed direct-upload parameters |
| `POST` | `/api/scenarios` | Create a traceable simulated branch |
| `GET` | `/api/jobs/:id` | Durable pipeline job status |
| `GET` | `/api/knowledge` | Catalog metadata |
| `GET` | `/api/knowledge/rules` | Query rule variants and facets |
| `GET` | `/api/knowledge/rules/:id` | Retrieve an exact policy |
| `POST` | `/api/knowledge/evaluate` | Execute confidence/review policy |

Every success and failure returns a request ID and timestamp. Errors use stable codes and identify whether retry is safe.

## Repository map

```text
shared/       Domain types, API contracts, knowledge types
server/       HTTP layer, application services, engines, integrations, jobs
src/          React workbench, state hooks, UI primitives, API client
knowledge/    Generated, runtime-used evidence policy catalog
tools/        Deterministic catalog generator
tests/        Engine, database, policy, graph, search, and HTTP coverage
public/       Matched scene captures and static product assets
data/         Local persistent database
```

## Testing strategy

The test suite verifies entity disambiguation, spatial and attribute matching, temporal change significance, movement detection, hash-chain tamper detection, graph referential integrity, semantic search, cursor pagination, transaction isolation, optimistic conflicts, concurrent writes, all 688 policy variants, HTTP error envelopes, and end-to-end knowledge evaluation.

The project must pass all three release gates:

```bash
pnpm check && pnpm test && pnpm build
```

## Design system

The interface uses matte layered surfaces, dense but legible control clusters, restrained cyan/violet/amber status colors, mono evidence metadata, progressive disclosure, and tool-like spatial layouts inspired by the supplied [Designeer components](https://designeer.xyz/components) and [Beautiful UI](https://www.beautifului.dev/) references. Icons are from Lucide. Motion is reserved for evidence selection and state transitions.

The two matched scene captures in `public/assets/` were created specifically for Scenara. The second is an edit of the first, keeping the physical scene aligned while removing the temporary barrier for a trustworthy comparison demonstration.

## Deployment notes

- Place the API behind TLS and a reverse proxy.
- Store the database on a durable volume or replace the store adapter.
- Restrict `SCENARA_PUBLIC_ORIGIN` to the deployed frontend.
- Deliver secrets through the host secret manager, never through Vite variables.
- Configure a Cloudinary notification URL before enabling asynchronous production callbacks.
- Back up both the database and original Cloudinary assets.
- Run the release gates before deployment and regenerate the catalog after changing any concept seed.

Scenara’s central invariant is simple: every claim must remain explainable through its media, structured observation, entity relationship, reviewer decision, and provenance history.
