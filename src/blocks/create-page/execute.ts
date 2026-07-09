import { isErrored } from "@attio/fetchable";
import { Workflows } from "attio/server";
import { Config } from "../../lib/config";
import { notion } from "../../notion/client";
import {
  buildRichTextItems,
  formatMissingCapabilities,
} from "../../notion/helpers";
import { NOTION_CAPABILITY_LABELS } from "../../notion/types";
import block from "./block";

export default Workflows.defineWorkflowBlockExecute(
  block,
  async ({ config }) => {
    const parsed = Config.createPage.zod.safeParse(config);
    if (!parsed.success) {
      // A schema mismatch is a programmer error: log the detail, but keep the
      // workspace-facing message generic rather than leaking internals.
      console.error(
        "[create-page] invalid block configuration",
        parsed.error.issues,
      );
      return {
        type: "error",
        errorMessage: "The block is misconfigured and can't run.",
      };
    }

    const { parent_page_id, title } = parsed.data;

    const result = await notion.createPage({
      parent: { page_id: parent_page_id },
      // Pages with a page parent only accept the title property, which is always named "title".
      properties: { title: { title: buildRichTextItems(title) } },
    });

    if (isErrored(result)) {
      switch (result.error.code) {
        case "NOT_FOUND":
          return {
            type: "error",
            errorMessage: "Notion parent page not found.",
          };
        case "UNAUTHORIZED":
          return {
            type: "error",
            errorMessage: "Not authorized to create the Notion page.",
          };
        case "FORBIDDEN": {
          if (result.error.missing_capabilities.length === 0) {
            return {
              type: "error",
              errorMessage:
                "Missing required capabilities to create the Notion page.",
            };
          } else if (result.error.missing_capabilities.length === 1) {
            return {
              type: "error",
              errorMessage: `Missing required capability to create the Notion page: ${NOTION_CAPABILITY_LABELS[result.error.missing_capabilities[0]]}.`,
            };
          } else {
            const missingCapabilitiesStr = formatMissingCapabilities(
              result.error.missing_capabilities,
            );

            return {
              type: "error",
              errorMessage: `Missing required capabilities to create the Notion page: ${missingCapabilitiesStr}.`,
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
            errorMessage: "Conflict occurred while creating the Notion page.",
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
              "We received an unexpected error from Notion when creating the page.",
          };
        default: {
          // Enforce all cases are covered but return an error message just in case something
          // goes wrong at runtime
          const _exhaustive: never = result.error;
          console.error("[create-page] unexpected error", _exhaustive);
          return { type: "error", errorMessage: "Unexpected error." };
        }
      }
    }

    return {
      type: "outcome",
      id: "created",
      data: {
        page_id: result.value.id,
        page_url: result.value.url,
        title: title,
      },
    };
  },
);
