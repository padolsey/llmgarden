# llmgarden

Embedding-space visualization of LLMs. Each model answers the same battery of
prompts; each response is embedded with `text-embedding-3-small`; each model's
fingerprint is the concatenation of its per-prompt embeddings, L2-normalized. A
UMAP projects those fingerprints to 2D so you can see which models cluster.

The hypothesis the plot tests: models from the same family (e.g. Gemini variants,
Claude variants, Llama fine-tunes) should cluster together under cosine similarity,
even though each was trained by a different team.

## Stack

- SvelteKit 5 (runes) + Tailwind 4 + TypeScript + pnpm
- OpenRouter for model generation
- OpenAI `text-embedding-3-small` (1536d) for response embedding
- `umap-js` for 2D projection
- Railway (Docker) for deployment

## Repo layout

```
src/lib/
  providers/        openrouter.ts, openai-embeddings.ts
  runner/           concurrency pool, retry, per-key semaphore, env loader
  data/             models.ts (curated ~28), prompts.ts (~30)
  viz/              similarity.ts, project.ts (UMAP), palette.ts
  server/           load-projection.ts
src/routes/         +layout.svelte, +page.server.ts, +page.svelte
scripts/            run.ts (harness), project.ts, status.ts, list-models.ts
data/               generations/, embeddings/, projection.json  (all committed)
```

## Running the harness

```bash
pnpm install
cp .env.example .env       # fill in OPENROUTER_API_KEY, OPENAI_API_KEY
pnpm harness               # ~870 pairs; skip-if-exists; ~5-15 min, ~$3-8
pnpm status                # coverage grid
pnpm harness --retry-failed
pnpm project               # writes data/projection.json
pnpm dev                   # http://localhost:3700
```

### Harness flags

```
--concurrency=N           global parallel workers (default 8)
--per-model=N             per-model in-flight cap (default 3)
--retry-failed            retry pairs whose gen JSON has an `error` field
--only-model=id           limit to one model
--only-prompt=id          limit to one prompt
--gen-timeout-ms=N        default 90000
--embed-timeout-ms=N      default 30000
```

Results are stored per-pair in `data/generations/<slug>/<prompt-id>.json` and
`data/embeddings/<slug>/<prompt-id>.json`. To add new models or prompts, edit
`src/lib/data/{models,prompts}.ts` and re-run `pnpm harness` — already-completed
pairs are skipped.

## Deploying to Railway

The committed `data/projection.json` is all the runtime needs — the container
doesn't call any API, so no keys are required in Railway.

```bash
npm install -g @railway/cli
railway login
railway init                  # create project
railway up                    # build + deploy via Dockerfile
```

## Adding more models or prompts

1. Edit `src/lib/data/models.ts` or `src/lib/data/prompts.ts`.
2. `pnpm harness` — the new work-items are filled in; existing ones are skipped.
3. `pnpm project` — rebuilds the 2D projection from all current embeddings.
4. Commit `data/`.
