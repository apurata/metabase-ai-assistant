# Branching strategy (Apurata fork)

Repo: [apurata/metabase-ai-assistant](https://github.com/apurata/metabase-ai-assistant)  
Upstream package: [metabase-ai-assistant on npm](https://www.npmjs.com/package/metabase-ai-assistant) (track via `main`).

## Branches

| Branch | Role |
|---|---|
| **`main`** | Mirror of **upstream**. Keep in sync. No Apurata-only commits here. |
| **`apurata`** | **Internal use branch** for Cursor / Apurata. All local improvements live here. Clones and MCP wrappers should track this branch. |
| **`feature/*`**, **`fix/*`** | Short-lived work. Always branch from **`main`**, open a PR to **upstream**, then **merge into `apurata`** for internal use. |

Do **not** open PRs to upstream from `apurata` tip (it accumulates Apurata-only history). Cherry-pick or re-branch from `main` when contributing back.

## Workflow

```text
upstream ──► main (sync only)
                │
                ├── feature/foo ──► PR upstream ──► merge into main when accepted
                │                        └── also merge (or cherry-pick) into apurata
                │
                └── (existing Apurata commits stay on apurata)
```

1. **Daily Cursor MCP:** `git checkout apurata && git pull`.
2. **Contribute upstream:** `git checkout main && git pull` → `git checkout -b feature/…` → PR to upstream.
3. **Use the same change internally:** merge that branch (or the upstream merge commit) into **`apurata`**.
4. **Sync main:** periodically fetch/merge or rebase `main` onto upstream `main` (no Apurata-only commits).

## Historical note

`fix/read-only-enforcement-and-card-query` was the first Apurata delta (read-only enforcement, `dataset_query` on `mb_card_get`, docs). Those commits are on **`apurata`**. Prefer new work via the flow above; keep the old `fix/…` branch only as history unless someone still points at it.

## Cursor / ops pointer

Apurata monorepo runbook: `docs/metabase/metabase_mcp_cursor.md` in [apurata/apurata](https://github.com/apurata/apurata) (or local monorepo path).
