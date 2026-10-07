# Branching strategy (Apurata fork)

Repo: [apurata/metabase-ai-assistant](https://github.com/apurata/metabase-ai-assistant)  
Upstream package: [metabase-ai-assistant on npm](https://www.npmjs.com/package/metabase-ai-assistant) (track via `main`).

## Branches

| Branch | Role |
|---|---|
| **`main`** | Mirror of **upstream**. Keep in sync. No Apurata-only commits here. |
| **`apurata`** | **Internal use branch** for Cursor / Apurata. All local improvements live here. Clones and MCP wrappers should track this branch. |
| **`feature/*`**, **`fix/*`** | Short-lived work. Always branch from **`main`**. |

Do **not** open PRs to upstream from `apurata` tip (it accumulates Apurata-only history). Cherry-pick or re-branch from `main` when contributing back.

**Upstream contribution:** still pause new PRs to `enessari/metabase-ai-assistant` (and do not ping [#15](https://github.com/enessari/metabase-ai-assistant/pull/15)) unless the human explicitly OK’s a contribution. Upstream has shipped through **v5.3.0**; keep `main` in sync via merge (not rebase).

## Workflow

```text
upstream ──► main (sync only)
                │
                └── feature/foo
                        │
                        └── merge local → apurata + push
                              keep origin/feature/foo  (later upstream PR)
```

1. **Daily Cursor MCP:** `git checkout apurata && git pull`.
2. **New work:** `git checkout main && git pull` → `git checkout -b feature/…` (or `fix/…`).
3. **Ship internally (default):** merge locally into `apurata`, push `apurata`, **delete the local** `feature/*`/`fix/*` branch, **leave the remote** branch (so it can become a PR to the original later). GitHub PRs on this fork are allowed, not the usual path.
4. **Upstream PRs:** paused unless the human OK’s — see contribution note above. When allowed: same remote feature branch; after accept, sync `main` and keep `apurata` current.
5. **Sync main:** periodically `git fetch upstream` and **merge** (prefer `--ff-only` when possible; otherwise a merge commit) into `main` — never rewrite remote history / no rebase of published tips. Then merge `main` (or `upstream/main`) into `apurata` via a short-lived `chore/sync-upstream-*` branch.

## Upstream sync — definition of done

Automation or human sync may resolve conflicts aggressively; **tests** are the safety net (not prompt-only policy).

1. Tag **before** merge: `apurata-pre-sync-YYYY-MM-DD` on current `apurata`.
2. Merge upstream into `chore/sync-upstream-*` → resolve → merge into `apurata`.
3. Green: `npm test` (includes `tests/apurata/`) **and** `npm run test:apurata` **and** `node scripts/smoke_write_guards.mjs`.
4. Tag **after**: `apurata-synced-upstream-vX.Y.Z` (or date) on the new `apurata` tip.
5. Push `main`, `apurata`, and the `chore/…` branch (no rebase / no force-push).

Rollback: `git checkout apurata && git reset --hard apurata-pre-sync-YYYY-MM-DD` (or the last `apurata-synced-*`), then restart Cursor MCP.

Apurata contract tests live in **`tests/apurata/`** (write allowlist, native Mongo update, tabs, field coercion, Cursor structuredContent).

## Last upstream sync

- **Upstream tip:** `v5.3.0` (`009ae02`, Metabase v0.50–v0.61+ compat, deps security, dbt/semantic tools).
- **Apurata branch:** keep write allowlist, native Mongo card writes, dashboard tabs, field casts, Cursor structuredContent fixes on top of that tip.


## Historical note

`fix/read-only-enforcement-and-card-query` was the first Apurata delta (read-only enforcement, `dataset_query` on `mb_card_get`, docs). Those commits are on **`apurata`**. Prefer new work via the flow above; keep the old `fix/…` branch only as history unless someone still points at it.

## Cursor / ops pointer

- Clone path (Apurata monorepo): **`apurata/metabase-ai-assistant/`** (inner git repo; see monorepo `download_repos.sh`).
- Runbook: `docs/metabase/metabase_mcp_cursor.md` in the [apurata monorepo](https://github.com/apurata/apurata) (or local root).
