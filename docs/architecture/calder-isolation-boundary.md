# Calder isolation boundary

## Writes (allowed)

| Path                 | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `~/.calder/`         | App state, runtime session files                                    |
| `<project>/.calder/` | Project context, governance, workflows, tasks, reviews, checkpoints |
| Electron `userData`  | Browser vault / session storage                                     |
| Temp `calder-*`      | Screenshots, bridge files                                           |

## Writes (forbidden)

Calder does **not** write:

- `~/.claude/`
- `~/.codex/`
- `~/.gemini/`
- `~/.cursor/`

## Reads of CLI toolchain configs

Calder does **not** read provider MCP / skills / agents / commands configs for display.

Those live in each CLI’s own home directory. When a CLI session runs inside Calder, the CLI loads its own config. Calder’s ops rail no longer mirrors that list.

## Conscious exceptions

- **Provider Update Center** — with user consent, installs/updates system CLI binaries (npm/brew/curl).
- **Mobile dependency doctor** — with user consent, installs system mobile tooling.

## Binary discovery

Provider health checks (`provider:checkBinary`) clear the binary path cache and re-probe the filesystem, so an external CLI reinstall does not require restarting Calder.

## Runtime hooks

`~/.calder/runtime/` is watched for status/events. Calder does not inject hooks into external CLIs. If the user configures CLI hooks to write there, Calder can display them.
