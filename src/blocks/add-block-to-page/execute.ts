import { isErrored } from "@attio/fetchable";
import type { BlockObjectRequest } from "@notionhq/client";
import { Workflows } from "attio/server";
import { Config } from "../../lib/config";
import { notion } from "../../notion/client";
import {
  buildBlock,
  formatMissingCapabilities,
  markdownToBlocks,
} from "../../notion/helpers";
import { NOTION_CAPABILITY_LABELS } from "../../notion/types";
import block from "./block";

export default Workflows.defineWorkflowBlockExecute(
  block,
  async ({ config }) => {
    const parsed = Config.addBlockToPage.zod.safeParse(config);
    if (!parsed.success) {
      // A schema mismatch is a programmer error: log the detail, but keep the
      // workspace-facing message generic rather than leaking internals.
      console.error(
        "[add-block-to-page] invalid block configuration",
        parsed.error.issues,
      );
      return {
        type: "error",
        errorMessage: "The block is misconfigured and can't run.",
      };
    }

    const { page_id, rich_content, block_type, content, add_to_position } =
      parsed.data;

    // Note: This code is here to cover a migration. We moved from having a single block to rich
    // text content that applies many blocks.
    const markdown = rich_content?.toMarkdown() ?? "";
    let blocks: Array<BlockObjectRequest>;
    if (markdown.trim().length > 0) {
      blocks = markdownToBlocks(markdown);
    } else {
      blocks = [buildBlock(block_type ?? "paragraph", content ?? "")];
    }

    const result = await notion.addBlocksToPage({
      pageId: page_id,
      blocks,
      position: add_to_position,
    });

    if (isErrored(result)) {
      switch (result.error.code) {
        case "NOT_FOUND":
          return {
            type: "error",
            errorMessage: "Notion page not found.",
          };
        case "UNAUTHORIZED":
          return {
            type: "error",
            errorMessage: "Not authorized to add block to Notion page.",
          };
        case "FORBIDDEN": {
          if (result.error.missing_capabilities.length === 0) {
            return {
              type: "error",
              errorMessage:
                "Missing required capabilities to add block to Notion page.",
            };
          } else if (result.error.missing_capabilities.length === 1) {
            return {
              type: "error",
              errorMessage: `Missing required capability to add block to Notion page: ${NOTION_CAPABILITY_LABELS[result.error.missing_capabilities[0]]}.`,
            };
          } else {
            const missingCapabilitiesStr = formatMissingCapabilities(
              result.error.missing_capabilities,
            );

            return {
              type: "error",
              errorMessage: `Missing required capabilities to add block to Notion page: ${missingCapabilitiesStr}.`,
            };
          }
        }
        case "RATE_LIMITED":
          return {
            type: "error",
            errorMessage: "Rate limit exceeded.",
            retryable: true,
          };
        case "CONFLICT":
          return {
            type: "error",
            errorMessage:
              "Conflict occurred while adding block to Notion page.",
          };
        case "INVALID_REQUEST":
          return {
            type: "error",
            errorMessage: "Invalid request to Notion API.",
          };
        case "NOTION_API_ERROR":
        case "UNEXPECTED_ERROR":
          return {
            type: "error",
            errorMessage:
              "We received an unexpected error from Notion when adding the block to the page.",
          };
        default: {
          // Enforce all cases are covered but return an error message just in case something
          // goes wrong at runtime
          const _exhaustive: never = result.error;
          console.error("[add-block-to-page] unexpected error", _exhaustive);
          return { type: "error", errorMessage: "Unexpected error." };
        }
      }
    }

    return {
      type: "outcome",
      id: "added",
      data: { block_id: result.value.id, page_id },
    };
  },
);
