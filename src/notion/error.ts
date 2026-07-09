import type { NotionCapability } from "./types";

export type NotionAPIError =
  | { code: "NOT_FOUND" }
  | { code: "CONFLICT" }
  | { code: "INVALID_REQUEST" }
  | { code: "NOTION_API_ERROR" } // 5XX errors from Notion
  | { code: "RATE_LIMITED" }
  | { code: "UNAUTHORIZED" }
  | { code: "FORBIDDEN"; missing_capabilities: NotionCapability[] }
  | { code: "UNEXPECTED_ERROR" };
