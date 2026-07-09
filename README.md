# Notion

Attio app integrating with [Notion](https://notion.so) — create and update Notion pages and database entries directly from Attio workflows.

## What it does

- **Workflow blocks** — automate Notion from Attio workflows: create pages, create database entries with properties, and append rich-text content to existing pages

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm run dev
```

## Commands

| Command                 | Description              |
| ----------------------- | ------------------------ |
| `pnpm run dev`          | Start dev server         |
| `pnpm run build`        | Build + type-check       |
| `pnpm run lint`         | Run ESLint               |
| `pnpm run lint:fix`     | Run ESLint with auto-fix |
| `pnpm run format`       | Format with Prettier     |
| `pnpm run format:check` | Check formatting         |
| `pnpm run test`         | Run tests                |
| `pnpm run knip`         | Check for dead code      |

## Structure

| Path | Description |
| --- | --- |
| `src/app.ts` | App entry point |
| `src/app.settings.ts` | Workspace-level settings schema |
| `src/blocks/` | Workflow block definitions (create-page, create-database-page, add-block-to-page) |
| `src/notion/` | Notion API client, types, error handling, and helpers |
| `src/server-functions/` | Server-side functions for searching/fetching Notion data |
| `src/lib/` | Shared config schemas, constants, and option definitions |

See [AGENTS.md](./AGENTS.md) for full coding guidelines and SDK usage notes.
