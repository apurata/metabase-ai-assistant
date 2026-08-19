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

**Upstream is dormant** (`enessari/metabase-ai-assistant`: last push Feb 2026; open PRs including [#15](https://github.com/enessari/metabase-ai-assistant/pull/15) have no maintainer review). **Do not** open new PRs there (and do not ping existing ones) until the maintainer comments, reviews, or merges again **and** the human explicitly OK’s a contribution.

## Workflow

```text
upstream ──► main (sync only)
                │
                └── feature/foo
                        │
                        └── merge local → apurata + push  ← only path while upstream is dormant
```

1. **Daily Cursor MCP:** `git checkout apurata && git pull`.
2. **New work:** `git checkout main && git pull` → `git checkout -b feature/…` (or `fix/…`).
3. **Ship internally:** **merge locally into `apurata`** and push. **Do not** open GitHub PRs on this fork (no PR history; a GitHub PR would be #1).
4. **Upstream:** paused — see dormancy note above. When it is allowed again: same feature branch, human OK first; after accept, sync `main` and keep `apurata` current.
5. **Sync main:** periodically fetch/merge or rebase `main` onto upstream `main` (no Apurata-only commits).

## Historical note

`fix/read-only-enforcement-and-card-query` was the first Apurata delta (read-only enforcement, `dataset_query` on `mb_card_get`, docs). Those commits are on **`apurata`**. Prefer new work via the flow above; keep the old `fix/…` branch only as history unless someone still points at it.

## Cursor / ops pointer

- Clone path (Apurata monorepo): **`apurata/metabase-ai-assistant/`** (inner git repo; see monorepo `download_repos.sh`).
- Runbook: `docs/metabase/metabase_mcp_cursor.md` in the [apurata monorepo](https://github.com/apurata/apurata) (or local root).
