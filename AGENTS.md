# AGENTS.md

This file provides guidance to AI agents who are working on the code in this repository.

## Context

### What the app does

This app integrates Attio with [Notion](https://notion.so), letting users automate Notion page creation and content management directly from Attio workflows. Users can create standalone pages, create database entries with structured properties, and append rich-text blocks to existing pages.

### App SDK entry points in use

| Entry point | Description |
| --- | --- |
| Workflow block: `create-page` | Creates a new child page inside an existing Notion page |
| Workflow block: `create-database-page` | Creates a new page in a Notion database with configurable properties |
| Workflow block: `add-block-to-page` | Appends rich-text content (blocks) to an existing Notion page |

### Source folder structure

| Path | Description |
| --- | --- |
| `src/app.ts` | App entry point — registers the app (record actions, widgets, etc.) |
| `src/app.settings.ts` | Workspace-level settings schema |
| `src/blocks/` | Workflow block definitions (one subdirectory per block) |
| `src/blocks/<name>/block.ts` | Block definition and schema |
| `src/blocks/<name>/execute.ts` | Server-side execution logic |
| `src/blocks/<name>/configurator.tsx` | Client-side configuration UI |
| `src/notion/` | Notion API client, types, error handling, and helpers |
| `src/server-functions/` | Server-side functions for searching/fetching Notion data |
| `src/lib/` | Shared config schemas, constants, and option definitions |

### External service

**Notion** — REST API via the official `@notionhq/client` SDK. Authentication uses OAuth (user connection). API docs: https://developers.notion.com/reference

---

## Environment

Code for the app may run either in a client-side or server-side context.

### Client-side code

Client-side code runs in the browser. However, it runs inside a safe sandbox, using a custom JS runtime. This means that:

- You MUST NOT render HTML tags directly e.g. `<div>Hello</div>`. Instead, you MUST only use components provided by the App SDK.
- You MUST NOT use custom styles or CSS. Only use the pre-styled components provided by the App SDK.
- You MUST NOT try to read the DOM directly.
- Some browser APIs may not be available.
- `fetch` calls are not allowed. You MUST NOT call `fetch` directly and should instead use `fetch` via server-side functions.

Files which render React components MUST use the `.tsx` extension.

### Server-side code

Server-side code runs in files ending in:

- `.server.ts`
- `.webhook.ts`
- `.event.ts`

Workflow block files will also run in the server (excluding configurators).

Code that any of the above files import will also run in a server-side environment.

Server-side code DOES NOT run in Node.js but instead in a custom JS runtime. While many Node.js APIs are supported, some are not and you may need to factor this into your decision to use certain packages.

## Using the Attio App SDK

Attio provides three packages to help you build apps:

1. `attio/client` - for client-side imports
2. `attio/server` - for server-side imports
3. `attio` - for shared/environment-agnostic imports

IMPORTANT: Before importing from these packages, you MUST always check one of the following to confirm that your import is correct:

1. Existing examples in the codebase
2. TypeScript type definitions and JSDoc strings for the package
3. The Attio SDK documentation

If you are unsure about an import, always check explicitly and do not guess.

## Coding guidelines

- You SHOULD use Zod to validate data from public APIs.
- You SHOULD only include properties in Zod schemas that we explicitly need.
- You SHOULD use try/catch around calls to `.json()`.
- You SHOULD use console.error to capture information about unexpected errors.
- You MUST NOT log sensitive information such as email addresses or passwords.
- You MUST handle API errors gracefully. Do not throw an error within a React component, but instead return a clear fallback UI.
- When `getUserConnection()` / `getWorkspaceConnection()` is called, you MUST NOT wrap it in a try/catch. These functions throw special errors that power the connection dialogs in the UI.
- You SHOULD prefer named arguments over positional arguments when using 3 or more arguments.
- You MUST NOT use `any` when typing your code. Type errors MUST be fixed properly as usage of `any` is a likely source of bugs.
- You SHOULD order functions/values within code so that all values are defined before being used. Default export should go at the bottom of a file.

### App-specific guidelines

- Notion API responses MUST be validated with the schemas in `src/notion/` before use.
- Use `src/notion/error.ts` for consistent error handling across Notion API calls.
- Data source property mapping lives in `src/notion/data-source-properties.ts` — extend it when adding support for new Notion property types.
- Block configurators search for Notion pages/databases via the server functions in `src/server-functions/` — do not call the Notion client directly from configurators.

### Testing

- Where appropriate, use Vitest to run tests.
- Aim to implement unit testing where it helps increase confidence in the correctness of code.
- Do not test React components using react testing library or similar.
- When passing functions/classes to describe, pass the value directly, do not specify a name in quotes e.g. `describe(myFn, () => {/* ... */})`, not `describe("myFn", () => {/* ... */})`.

## Validation

- You MUST validate all your changes using the commands provided in package.json.
- Run and fix lint rules: `pnpm run lint:fix`
- Validate unused code: `pnpm run knip`
- Run tests: `pnpm run test`
- Validate the build: `pnpm run build`
