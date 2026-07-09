/*
 * This file contains configuration for workflow blocks.
 */

import { Workflows } from "attio";
import z from "zod";

const BLOCK_TYPES = [
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "paragraph",
  "quote",
] as const;

/** Where the new block is inserted relative to the page's existing children. */
export const ADD_TO_POSITIONS = ["start", "end"] as const;

/** Human-readable labels for the insert position. */
export const ADD_TO_LABELS: Record<(typeof ADD_TO_POSITIONS)[number], string> =
  {
    start: "Start of page",
    end: "End of page",
  };

export const Config = {
  addBlockToPage: {
    workflows: Workflows.ConfigSchema.struct({
      page_id: Workflows.ConfigSchema.string(),
      // Rich text added to the page; parsed into one or more Notion blocks.
      rich_content: Workflows.ConfigSchema.richText().optional(),
      add_to_position: Workflows.ConfigSchema.stringEnum([...ADD_TO_POSITIONS]),
      // Legacy fields: blocks configured before rich text shipped carry a single block type
      // plus plain content. Kept optional so existing configurations keep running unchanged.
      block_type: Workflows.ConfigSchema.stringEnum([
        ...BLOCK_TYPES,
      ]).optional(),
      content: Workflows.ConfigSchema.string().optional(),
    }),
    zod: z.object({
      page_id: z.string().min(1),
      // A rich text value is a class instance (not plain JSON), so validate by duck-typing
      // the method we actually consume rather than its shape.
      rich_content: z
        .custom<Workflows.RichTextValue>(
          (value) =>
            typeof (value as { toMarkdown?: unknown })?.toMarkdown ===
            "function",
        )
        .optional(),
      add_to_position: z.enum(ADD_TO_POSITIONS),
      block_type: z.enum(BLOCK_TYPES).optional(),
      content: z.string().optional(),
    }),
  },

  createDatabasePage: {
    workflows: Workflows.ConfigSchema.struct({
      data_source_id: Workflows.ConfigSchema.string(),
      title: Workflows.ConfigSchema.string(),
      // Note: Multi-valued properties (multi_select, people) take one value per element
      properties: Workflows.ConfigSchema.array(
        Workflows.ConfigSchema.struct({
          /** The ID of the property we're writing to */
          property_id: Workflows.ConfigSchema.string(),

          // Sparse value properties - only set one of these per element
          text_value: Workflows.ConfigSchema.string().optional(),
          number_value: Workflows.ConfigSchema.number().optional(),
          boolean_value: Workflows.ConfigSchema.boolean().optional(),
          date_value: Workflows.ConfigSchema.date().optional(),
          email_value: Workflows.ConfigSchema.emailAddress().optional(),
          phone_value: Workflows.ConfigSchema.phoneNumber().optional(),
          option_value: Workflows.ConfigSchema.string().optional(),
          user_value: Workflows.ConfigSchema.string().optional(), // i.e. Notion user
        }),
      ),
    }),
    zod: z.object({
      data_source_id: z.string().min(1),
      title: z.string(),
      properties: z.array(
        z.object({
          property_id: z.string().min(1),
          text_value: z.string().optional(),
          number_value: z.number().optional(),
          boolean_value: z.boolean().optional(),
          date_value: z.object({ value: z.string() }).optional(),
          email_value: z.object({ original: z.string() }).optional(),
          phone_value: z.object({ original: z.string() }).optional(),
          option_value: z.string().optional(),
          user_value: z.string().optional(),
        }),
      ),
    }),
  },

  createPage: {
    workflows: Workflows.ConfigSchema.struct({
      parent_page_id: Workflows.ConfigSchema.string(),
      title: Workflows.ConfigSchema.string(),
    }),
    zod: z.object({
      parent_page_id: z.string().min(1),
      title: z.string(),
    }),
  },
};
