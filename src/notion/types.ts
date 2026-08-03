/**
 * Permitted Notion text block types.
 *
 * Note: This is a subset of all block types available in Notion. We limit these intentionally to
 * only the text block types that make sense to add from a workflow block.
 */
export type NotionTextBlockType =
  "heading_1" | "heading_2" | "heading_3" | "heading_4" | "paragraph" | "quote";

/** @see https://developers.notion.com/reference/capabilities */
const _NOTION_CAPABILITIES = [
  "content.read",
  "content.update",
  "content.insert",

  "comments.read",
  "comments.insert",

  "user.read",
] as const;

export type NotionCapability = (typeof _NOTION_CAPABILITIES)[number];

export const NOTION_CAPABILITY_LABELS: Record<NotionCapability, string> = {
  "content.read": "Read content",
  "content.update": "Update content",
  "content.insert": "Insert content",
  "comments.read": "Read comments",
  "comments.insert": "Insert comments",
  "user.read": "Read user information",
};
