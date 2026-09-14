# Calder Wiki — source (not published)

Markdown in this folder is the **source of truth** for the [GitHub Wiki](https://github.com/batu3384/calder/wiki). It is **not** copied to the wiki repo (`README.md` is excluded by sync).

## Publish

```bash
./scripts/sync-wiki.sh
```

Requirements:

- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated with repo + wiki write access
- `rsync` on PATH
- Wiki enabled on the repository (Settings → Features → Wikis)

## First-time setup

GitHub requires at least one wiki page before the wiki git remote accepts pushes:

1. Open https://github.com/batu3384/calder/wiki
2. Click **Create the first page** (or **New Page**) and save a stub **Home** page
3. Run `./scripts/sync-wiki.sh` — it overwrites Home with `wiki/Home.md`

After that, only the sync script is needed.

## What gets synced

| Included                                   | Excluded                |
| ------------------------------------------ | ----------------------- |
| `*.md` pages (`Home.md`, `_Sidebar.md`, …) | `README.md` (this file) |
|                                            | `.git`                  |

Sync uses `rsync --delete` — pages removed from `wiki/` are removed from the live wiki on the next push.
