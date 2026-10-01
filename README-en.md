# Affine CLI

[**【English】**](./README-en.md) | [**【中文】**](./README.md)

Affine CLI is a lightweight command-line tool for managing Affine documents, tags, folders, collections, files, comments, and databases. It provides a streamlined interface for interacting with the Affine (https://app.affine.pro) API through the command line.

## Features

- **Authentication**: Login with email/password and save a session cookie (AFFiNE 0.27+)
- **Workspace Management**: List and manage workspaces
- **Document Operations**: Create, read, update, delete, search, copy, and append content
- **Tag Management**: Create tags, add/remove tags from documents
- **Folder Management**: Organize documents in folders
- **Collection Management**: Create and manage favorite collections
- **File Management**: Upload and manage file attachments
- **Comment Management**: Add, update, delete, and resolve comments
- **Database Management**: Create data tables, manage columns and rows

## Installation

### Local Installation

```bash
# Clone the repository
git clone https://github.com/woodcoal/affine-cli.git
cd affine-cli

# Install dependencies
npm install

# Build the project
npm run build
```

### Global Installation (Recommended)

```bash
# Install globally from npm (if published)
npm install -g affine-cli

# After installation, you can use affine-cli command from any directory
```

> Requires Node.js **>= 22.19** (required by `undici@8`).

### Docker

The image is based on `node:24-alpine` and bundles production deps, the `affine-cli` binary, and the skill (at `/root/.agents/skills/affine-cli`).

```bash
# Build
docker build -t affine-cli:lite .

# Run (recommended: non-interactive email/password login via env)
docker run --rm \
  -e AFFINE_BASE_URL=https://affine.example.com \
  -e AFFINE_EMAIL=me@example.com \
  -e AFFINE_PASSWORD=secret \
  -e AFFINE_WORKSPACE_ID=your-workspace-id \
  affine-cli:lite doc list

# Or use a pre-obtained session cookie
docker run --rm \
  -e AFFINE_BASE_URL=https://affine.example.com \
  -e AFFINE_COOKIE='affine_session=...; affine_csrf_token=...' \
  affine-cli:lite auth status
```

Notes:
- The session cookie is written to `/root/.affine-cli/affine-cli.env` **inside the container** and is lost on restart; mount a volume to persist it: `-v affine-config:/root/.affine-cli`.
- For unattended use prefer `AFFINE_EMAIL` + `AFFINE_PASSWORD` (the cookie expires in ~7 days and will be refreshed by auto-login).
- The container must be able to reach your self-hosted AFFINE (use the service name on the same Docker network, or `host.docker.internal`).

## Configuration

Run the login command to sign in and save a session cookie:

```bash
affine-cli auth login --url https://your-affine.example.com
```

You can also create a `.env` file in your project directory or use global configuration:

```bash
# Global config: ~/.affine-cli/affine-cli.env
# Local config: .env in project directory

AFFINE_BASE_URL=https://app.affine.pro
AFFINE_COOKIE=affine_session=...
AFFINE_WORKSPACE_ID=your_workspace_id
```

> AFFiNE 0.27+ no longer supports Personal Access Tokens (`AFFINE_API_TOKEN`); use a session cookie instead.
> For unattended use, set `AFFINE_EMAIL` + `AFFINE_PASSWORD` and the CLI will log in automatically (storing the password is not recommended).

Configuration priority: Environment variables > Local `.env` > Global `~/.affine-cli/affine-cli.env`

## Usage

```bash
# Authentication
affine-cli auth login
affine-cli auth status
affine-cli auth logout

# Workspace
affine-cli workspace list

# Documents
affine-cli doc list --workspace <workspace-id>
affine-cli doc create -t "My Document" -c "./content.md"
affine-cli doc info --id <doc-id>
affine-cli doc delete --id <doc-id>
affine-cli doc search --query "keyword"

# Tags
affine-cli tags list
affine-cli tags create --tag "Important"
affine-cli tags add --id <doc-id> --tag "Important"
affine-cli tags remove --id <doc-id> --tag "Important"

# Folders
affine-cli folder all
affine-cli folder create --name "My Folder"
affine-cli folder list --id <folder-id>

# Collections
affine-cli collection list
affine-cli collection create --name "My Collection"

# Files
affine-cli file upload --file "./image.png"
affine-cli file list

# Comments
affine-cli comment list --doc-id <doc-id>
affine-cli comment create --doc-id <doc-id> --content "Great idea!"

# Databases
affine-cli database create --title "Tasks"
affine-cli database list --doc-id <doc-id>
affine-cli database columns --doc-id <doc-id> --db-id <db-id>
```

## Command Reference

### Auth Module (auth)

| Command    | Description                 | Parameters                                                                                                                          |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **login**  | Login with email/password and save a session cookie | `--url` Server URL <br>`--workspace` Workspace ID <br>`--local` Save to local <br>`--force` Force overwrite |
| **logout** | Logout                      | `--local` Delete local config                                                                                                       |
| **status** | Get login status            | `--json` JSON format output                                                                                                         |

### Workspace Module (workspace)

| Command  | Description        | Parameters                           |
| -------- | ------------------ | ------------------------------------ |
| **list** | Get all workspaces | `--format` Output format (text/json) |

### Document Module (doc)

| Command       | Description                                     | Parameters                                                                                                                                                           |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **list**      | List workspace documents (pagination supported) | `--count` Page size <br>`--skip` Offset <br>`--after` Cursor <br>`--workspace` Workspace ID                                                                          |
| **info**      | Get document details                            | `--id` Document ID <br>`--workspace` Workspace ID <br>`--content` Content mode (markdown/raw/hidden)                                                                 |
| **create**    | Create new document                             | `--title` Title <br>`--content` Content <br>`--file` Import from file <br>`--folder` Folder ID <br>`--tags` Tag list <br>`--workspace` Workspace ID                  |
| **search**    | Search documents                                | `--query` Keyword <br>`--workspace` Workspace ID <br>`--count` Result count <br>`--match-mode` Match mode <br>`--tag` Tag filter                                     |
| **delete**    | Delete document                                 | `--id` Document ID <br>`--workspace` Workspace ID                                                                                                                    |
| **copy**      | Copy document                                   | `--id` Source doc ID <br>`--title` New title <br>`--parent` Parent doc ID <br>`--folder` Target folder <br>`--workspace` Workspace ID                                |
| **update**    | Update document properties                      | `--id` Document ID <br>`--title` Title <br>`--parent` Parent doc <br>`--folder` Folder <br>`--workspace` Workspace ID                                                |
| **replace**   | Replace document content                        | `--id` Document ID <br>`--search` Search text <br>`--replace` Replace text <br>`--workspace` Workspace ID <br>`--match-all` Replace all <br>`--preview` Preview mode |
| **append**    | Append document content                         | `--id` Document ID <br>`--content` Content <br>`--file` Import from file <br>`--workspace` Workspace ID                                                              |
| **publish**   | Publish document                                | `--id` Document ID <br>`--workspace` Workspace ID                                                                                                                    |
| **unpublish** | Unpublish document                              | `--id` Document ID <br>`--workspace` Workspace ID                                                                                                                    |

### Tags Module (tags)

| Command    | Description              | Parameters                                                                      |
| ---------- | ------------------------ | ------------------------------------------------------------------------------- |
| **list**   | List all tags            | `--workspace` Workspace ID                                                      |
| **create** | Create tag               | `--tag` Tag name <br>`--color` Color <br>`--workspace` Workspace ID             |
| **add**    | Add tag to document      | `-d` Document ID <br>`--tag` Tag name <br>`--workspace` Workspace ID            |
| **remove** | Remove tag from document | `-d` Document ID <br>`--tag` Tag name <br>`--workspace` Workspace ID            |
| **delete** | Delete tag               | `--tag` Tag name <br>`--workspace` Workspace ID                                 |
| **info**   | Get documents with tag   | `--tag` Tag name <br>`--workspace` Workspace ID <br>`--ignore-case` Ignore case |

### Folder Module (folder)

| Command    | Description                 | Parameters                                                                                                              |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **all**    | All folders list            | `--workspace` Workspace ID                                                                                              |
| **list**   | Folder contents list        | `--id` Folder ID <br>`--folder` Folders only <br>`--workspace` Workspace ID                                             |
| **create** | Create folder               | `--name` Folder name <br>`--parent` Parent folder ID <br>`--index` Sort index <br>`--workspace` Workspace ID            |
| **delete** | Delete folder               | `--id` Folder ID <br>`--workspace` Workspace ID                                                                         |
| **update** | Update folder properties    | `--id` Folder ID <br>`--name` Name <br>`--parent` Parent folder <br>`--index` Sort index <br>`--workspace` Workspace ID |
| **clear**  | Clear empty folders         | `--workspace` Workspace ID                                                                                              |
| **add**    | Add document to folder      | `--id` Folder ID <br>`--doc` Document ID <br>`--index` Sort index <br>`--workspace` Workspace ID                        |
| **move**   | Move document to folder     | `--id` Target folder ID <br>`--doc` Document ID <br>`--workspace` Workspace ID                                          |
| **remove** | Remove document from folder | `--id` Folder ID <br>`--doc` Document ID <br>`--workspace` Workspace ID                                                 |

### Collection Module (collection)

| Command    | Description                     | Parameters                                                                  |
| ---------- | ------------------------------- | --------------------------------------------------------------------------- |
| **list**   | All collections list            | `--workspace` Workspace ID                                                  |
| **info**   | Collection documents list       | `--id` Collection ID <br>`--workspace` Workspace ID                         |
| **create** | Create collection               | `--name` Collection name <br>`--workspace` Workspace ID                     |
| **update** | Update collection name          | `--id` Collection ID <br>`--name` New name <br>`--workspace` Workspace ID   |
| **delete** | Delete collection               | `--id` Collection ID <br>`--workspace` Workspace ID                         |
| **add**    | Add document to collection      | `--id` Collection ID <br>`--doc` Document ID <br>`--workspace` Workspace ID |
| **remove** | Remove document from collection | `--id` Collection ID <br>`--doc` Document ID <br>`--workspace` Workspace ID |

### File Module (file)

| Command    | Description               | Parameters                                                                                                                                |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **upload** | Upload attachment         | `--file` File path <br>`--content` Base64 content <br>`--filename` Filename <br>`--content-type` MIME type <br>`--workspace` Workspace ID |
| **delete** | Delete attachment         | `--id` Attachment ID <br>`--permanently` Permanent delete <br>`--workspace` Workspace ID                                                  |
| **clean**  | Clean deleted attachments | `--workspace` Workspace ID                                                                                                                |

### Comment Module (comment)

| Command     | Description            | Parameters                                                                                                                                                                |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **list**    | List document comments | `--doc-id` Document ID <br>`--workspace` Workspace ID <br>`--first` Return count <br>`--offset` Offset <br>`--full` Full data                                             |
| **create**  | Create comment         | `--doc-id` Document ID <br>`--content` Comment content <br>`--workspace` Workspace ID <br>`--selection` Quoted text <br>`--doc-title` Doc title <br>`--doc-mode` Doc mode |
| **update**  | Update comment         | `--id` Comment ID <br>`--content` New content                                                                                                                             |
| **delete**  | Delete comment         | `--id` Comment ID <br>`--workspace` Workspace ID <br>`--doc-id` Document ID                                                                                               |
| **resolve** | Resolve/unresolve      | `--id` Comment ID <br>`--resolved` true/false                                                                                                                             |

### Database Module (database)

| Command     | Description                | Parameters                                                                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **list**    | List databases in document | `--doc` Document ID <br>`--workspace` Workspace ID                                                                                                                        |
| **columns** | Read column definitions    | `--doc` Document ID <br>`--id` Database ID <br>`--workspace` Workspace ID                                                                                                 |
| **query**   | Query data                 | `--doc` Document ID <br>`--id` Database ID <br>`--rows` Row IDs <br>`--columns` Column names <br>`--query` Filter <br>`--full` Full output <br>`--workspace` Workspace ID |
| **remove**  | Delete rows                | `--doc` Document ID <br>`--id` Database ID <br>`--row` Row ID <br>`--query` Filter <br>`--workspace` Workspace ID                                                         |
| **update**  | Update rows                | `--doc` Document ID <br>`--id` Database ID <br>`--values` Cell data <br>`--row` Row ID <br>`--query` Filter <br>`--workspace` Workspace ID                                |
| **create**  | Create database            | `--content` Data (JSON) <br>`--doc` Document ID <br>`--title` Title <br>`--view-mode` View mode <br>`--workspace` Workspace ID                                            |
| **delete**  | Delete database            | `--doc` Document ID <br>`--id` Database ID <br>`--workspace` Workspace ID                                                                                                 |
| **insert**  | Insert data                | `--doc` Document ID <br>`--id` Database ID <br>`--content` Data <br>`--workspace` Workspace ID                                                                            |

## Command Help

```bash
# Show main help
affine-cli help

# Show module help
affine-cli doc --help

# Show specific command help
affine-cli doc create --help
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── cli/                # CLI command modules
│   ├── auth.ts
│   ├── workspace.ts
│   ├── doc.ts
│   ├── tags.ts
│   ├── folder.ts
│   ├── collection.ts
│   ├── file.ts
│   ├── comments.ts
│   └── database.ts
├── core/               # Core business logic
│   ├── auth.ts
│   ├── workspace.ts
│   ├── docs.ts
│   ├── tags.ts
│   ├── folder.ts
│   ├── collection.ts
│   ├── file.ts
│   ├── comments.ts
│   ├── database.ts
│   └── constants.ts
└── utils/              # Utility functions
    ├── config.ts
    ├── auth.ts
    ├── authSession.ts
    ├── graphqlClient.ts
    ├── wsClient.ts
    ├── cliUtils.ts
    ├── docsUtil.ts
    ├── fileConverter.ts
    └── misc.ts
```

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **GraphQL Client**: undici
- **WebSocket**: socket.io-client
- **CRDT**: Yjs

## Acknowledgments

This project references the implementation of [dawncr0w/affine-mcp-server](https://github.com/dawncr0w/affine-mcp-server). We thank the original contributors for their foundational work.

## License

MIT © [The AFFiNE CLI Contributors](LICENSE) & [木炭 <woodcoal@qq.com>](https://github.com/woodcoal/affine-cli)

## Author

- **Author**: 木炭
- **Email**: woodcoal@qq.com
- **GitHub**: https://github.com/woodcoal/affine-cli
