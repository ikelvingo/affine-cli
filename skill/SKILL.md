---
name: affine-cli
description: Command-line tool for managing Affine documents, tags, folders, collections, files, databases, comments, journals and workspaces. Supports both cloud (app.affine.pro) and self-hosted deployments.
homepage: https://github.com/ikelvingo/affine-cli
tags: [affine, document-management, cli, markdown, notes, wiki, database, collaboration, self-hosted]
metadata:
  openclaw:
    requires:
      bins: [affine-cli]
    envVars:
      - name: AFFINE_COOKIE
        required: false
        description: 会话 Cookie（AFFiNE 0.27+）。通常由 `affine-cli auth login` 写入 ~/.affine-cli/affine-cli.env，无需手动设置。
      - name: AFFINE_BASE_URL
        required: false
        description: Affine 服务器地址，默认 https://app.affine.pro
      - name: AFFINE_WORKSPACE_ID
        required: false
        description: 默认工作区 ID
      - name: AFFINE_EMAIL
        required: false
        description: 非交互自动登录邮箱（与 AFFINE_PASSWORD 配对）
      - name: AFFINE_PASSWORD
        required: false
        description: 非交互自动登录密码
      - name: AFFINE_CLIENT_VERSION
        required: false
        description: 客户端版本头，默认 0.26.0（AFFiNE 0.27+ 服务端要求客户端版本不低于 0.26，低于该值会返回 403 UNSUPPORTED_CLIENT_VERSION）
    note: The CLI resolves auth itself from env > local .env > ~/.affine-cli/affine-cli.env. Run `affine-cli auth login` once to save a session cookie (AFFiNE 0.27+ no longer supports API tokens).
---

# Affine CLI

Command-line tool for managing Affine documents and workspaces. Works with both cloud and self-hosted Affine instances.

## Installation Check (do this first)

Installing this skill does **not** install `affine-cli` — it is a separate Node binary. Before any Affine operation, confirm it is available, and only install it if it is missing.

> **Never install from the npm registry.** The npm package `affine-cli` is the upstream project, which cannot authenticate against AFFiNE 0.27+ (it still depends on the removed Personal Access Token), so it fails with 403 / auth errors. Install from this fork's source instead.

1. Check availability:

```bash
# macOS / Linux
command -v affine-cli

# Windows (PowerShell)
Get-Command affine-cli -ErrorAction SilentlyContinue
```

If this succeeds, **stop here** and skip to the Authentication step — do not reinstall.

2. If missing, install it from this fork's source (Node.js >= 22.19 required):

```bash
git clone https://github.com/ikelvingo/affine-cli.git
cd affine-cli
npm ci
npm run build
npm link          # puts `affine-cli` on PATH
```

3. Verify:

```bash
affine-cli --version
```

Notes:
- **Container images**: this fork's Dockerfile builds the CLI, links it onto `PATH` (`ENTRYPOINT ["affine-cli"]`) and symlinks the skill to `/root/.agents/skills/affine-cli`. In that case step 1 already succeeds — never install anything inside the image.
- **OpenClaw**: this skill declares `metadata.openclaw.requires.bins: [affine-cli]` as a gate, so it will **not appear** until `affine-cli` exists on `PATH`. There is deliberately **no** `install` spec, so the platform will not pull the package from npm — install the binary from source first, then reload skills.
- **Sandboxed agents**: the binary and credentials must exist **inside** the sandbox (e.g. via `setupCommand` or a custom image); host `PATH` and `~/.affine-cli/affine-cli.env` are not shared.
- **Generic skills agents** (Claude Code / opencode / etc.): install the binary from source as above, then run the Authentication step.

## When to Use

- Managing documents, tags, folders, collections
- Working with databases, comments, journals
- Batch operations on Affine workspace
- Automating document workflows

## Quick Start

```bash
# 1. Login with email/password (saves a session cookie)
affine-cli auth login

# 2. Check status
affine-cli auth status

# 3. List workspaces
affine-cli workspace list

# 4. List documents
affine-cli doc list
```

**Self-hosted:**
```bash
affine-cli auth login --url https://your-affine.example.com
```

## Command Overview

| Module | Commands |
|--------|----------|
| **auth** | login, logout, status |
| **workspace** | list |
| **doc** | list, all, info, create, delete, copy, update, search, replace, append, publish, unpublish |
| **tags** | list, create, add, remove, delete, info |
| **folder** | all, list, create, delete, update, clear, add, move, remove |
| **collection** | list, info, create, update, delete, add, remove |
| **file** | upload, delete, clean |
| **database** | list, columns, query, create, insert, update, delete, remove |
| **comment** | list, create, update, delete, resolve |
| **journal** | list, create, info, append, update |

## Common Examples

### Daily Journal

```bash
# Create today's journal
affine-cli journal create

# Append to today's journal
affine-cli journal append --content "# Morning\n- Reviewed tasks\n- Team standup"

# Append to specific date
affine-cli journal append --date 2025-04-10 --content "# Notes\nMeeting with team"

# View journal
affine-cli journal info --date 2025-04-10

# List recent journals
affine-cli journal list --count 7
```

### Documents

```bash
# Find a document by title
affine-cli doc search -q "meeting notes"

# Create from file (README.md, etc.)
affine-cli doc create -t "Q2 Planning" -c "@planning.md"

# Create with tags
affine-cli doc create -t "Project Alpha" -c "# Project\nDetails" --tags "work,important" --icon "📁"

# View document content
affine-cli doc info -i DOC_ID --content markdown

# Add content to document
affine-cli doc append -i DOC_ID --content "\n\n## Update\nNew content here"

# Search with tag filter
affine-cli doc search -q "budget" --tag finance
```

### Tags

```bash
# Create tag
affine-cli tags create --name "review"

# Add tag to document
affine-cli tags add -d DOC_ID --tag review

# List all tags
affine-cli tags list

# Find documents with tag
affine-cli tags info --tag review
```

### Folders

```bash
# Create folder
affine-cli folder create --name "Projects"

# List root folders
affine-cli folder all

# List folder contents
affine-cli folder list --id FOLDER_ID

# Move document to folder
affine-cli folder move --id FOLDER_ID -d DOC_ID
```

### Databases

```bash
# List databases in a doc
affine-cli database list --doc DOC_ID

# Query data (filters)
affine-cli database query --doc DOC_ID --id DB_ID -q '[{"column":"Status","operator":"eq","value":"Done"}]'

# Insert new row
affine-cli database insert --doc DOC_ID --id DB_ID --content '[{"Task":"Review PR","Status":"Todo"}]'

# Update rows
affine-cli database update --doc DOC_ID --id DB_ID --values '{"Status":"Done"}' -q '[{"column":"Task","operator":"contains","value":"Review"}]'
```

## Configuration

**Priority**: env vars > local .env > global config

**Files:**
- Global: `~/.affine-cli/affine-cli.env`
- Local: `<project>/.env`

**Environment variables:**
- `AFFINE_COOKIE` - Session cookie, saved by `affine-cli auth login` (AFFiNE 0.27+)
- `AFFINE_BASE_URL` - Server URL (default: https://app.affine.pro)
- `AFFINE_WORKSPACE_ID` - Default workspace
- `AFFINE_EMAIL` / `AFFINE_PASSWORD` - Optional non-interactive auto-login

**Output format:** every command prints **JSON by default**, so parse stdout as JSON. Add the global `--text` flag (`affine-cli --text doc list`, or `affine-cli doc list --text`) for human-readable text.

## Reference Files

- [commands/basics.md](commands/basics.md) - Auth, workspace, documents
- [commands/tags-folders.md](commands/tags-folders.md) - Tags and folders
- [commands/collections.md](commands/collections.md) - Collections
- [commands/files.md](commands/files.md) - File attachments
- [commands/databases.md](commands/databases.md) - Database operations
- [commands/comments.md](commands/comments.md) - Comments
- [commands/journals.md](commands/journals.md) - Journals

## Support

- GitHub: https://github.com/ikelvingo/affine-cli
- Issues: https://github.com/ikelvingo/affine-cli/issues
- Upstream project this fork is based on: https://github.com/woodcoal/affine-cli
- AFFiNE docs: https://deepwiki.com/toeverything/AFFiNE