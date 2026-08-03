import { isErrored } from "@attio/fetchable";
import { Workflows } from "attio/server";
import { Config } from "../../../lib/config";
import { notion } from "../../../notion/client";
import { buildDatabasePageProperties } from "../../../notion/data-source-properties";
import { formatMissingCapabilities } from "../../../notion/helpers";
import { NOTION_CAPABILITY_LABELS } from "../../../notion/types";
import block from "./block";

export default Workflows.defineWorkflowBlockExecute(
  block,
  async ({ config }) => {
    const parsed = Config.createDatabasePage.zod.safeParse(config);
    if (!parsed.success) {
      // A schema mismatch is a programmer error: log the detail, but keep the
      // workspace-facing message generic rather than leaking internals.
      console.error(
        "[create-database-page] invalid block configuration",
        parsed.error.issues,
      );
      return {
        type: "error",
        errorMessage: "The block is misconfigured and can't run.",
      };
    }

    const { data_source_id, title, properties } = parsed.data;

    // Fetch the data source schema fresh so we map each configured property against its
    // current type, and fail clearly when the database changed since the block was configured.
    const dataSourceResult = await notion.getDataSource(data_source_id);

    if (isErrored(dataSourceResult)) {
      switch (dataSourceResult.error.code) {
        case "NOT_FOUND":
          return {
            type: "error",
            errorMessage:
              "Notion database not found. It may have been deleted or moved.",
          };
        case "UNAUTHORIZED":
          return {
            type: "error",
            errorMessage: "Not authorized to read the Notion database.",
          };
        case "FORBIDDEN": {
          if (dataSourceResult.error.missing_capabilities.length === 0) {
            return {
              type: "error",
              errorMessage:
                "Missing required capabilities to read the Notion database.",
            };
          } else if (dataSourceResult.error.missing_capabilities.length === 1) {
            return {
              type: "error",
              errorMessage: `Missing required capability to read the Notion database: ${NOTION_CAPABILITY_LABELS[dataSourceResult.error.missing_capabilities[0]]}.`,
            };
          } else {
            const missingCapabilitiesStr = formatMissingCapabilities(
              dataSourceResult.error.missing_capabilities,
            );

            return {
              type: "error",
              errorMessage: `Missing required capabilities to read the Notion database: ${missingCapabilitiesStr}.`,
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
              "Conflict occurred while reading the Notion database.",
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
              "We received an unexpected error from Notion when reading the database.",
            retryable: true,
          };
        default: {
          // Enforce all cases are covered but return an error message just in case something
          // goes wrong at runtime
          const _exhaustive: never = dataSourceResult.error;
          console.error("[create-database-page] unexpected error", _exhaustive);
          return { type: "error", errorMessage: "Unexpected error." };
        }
      }
    }

    const propertyValuesResult = buildDatabasePageProperties({
      propertyConfigs: dataSourceResult.value.properties,
      title,
      propertyInputs: properties,
    });

    if (isErrored(propertyValuesResult)) {
      const error = propertyValuesResult.error;

      switch (error.code) {
        case "TITLE_PROPERTY_NOT_FOUND":
          console.error(
            "[create-database-page] data source has no title property",
          );
          return {
            type: "error",
            errorMessage: "The Notion database has no title property.",
          };
        case "PROPERTY_NOT_FOUND":
          return {
            type: "error",
            errorMessage:
              "A configured property no longer exists in the Notion database. " +
              "Update this workflow step and try again.",
          };
        case "PROPERTY_TYPE_NOT_SUPPORTED":
          return {
            type: "error",
            errorMessage:
              `The property '${error.property_name}' has changed to a type this step ` +
              "can't set. Update this workflow step and try again.",
          };
        case "PROPERTY_VALUE_MISSING":
          return {
            type: "error",
            errorMessage:
              `The property '${error.property_name}' has no value configured, or the ` +
              "property's type has changed. Update this workflow step and try again.",
          };
        case "OPTION_NOT_FOUND":
          return {
            type: "error",
            errorMessage:
              `The configured option for '${error.property_name}' is no longer one of ` +
              "the property's options. Update this workflow step and try again.",
          };
        default: {
          // Enforce all cases are covered but return an error message just in case
          // something goes wrong at runtime
          const _exhaustive: never = error;
          console.error("[create-database-page] unexpected error", _exhaustive);
          return { type: "error", errorMessage: "Unexpected error." };
        }
      }
    }

    const result = await notion.createPage({
      parent: { data_source_id },
      properties: propertyValuesResult.value,
    });

    if (isErrored(result)) {
      switch (result.error.code) {
        case "NOT_FOUND":
          return {
            type: "error",
            errorMessage:
              "Notion database not found. It may have been deleted or moved.",
          };
        case "UNAUTHORIZED":
          return {
            type: "error",
            errorMessage:
              "Not authorized to create the page in the Notion database.",
          };
        case "FORBIDDEN": {
          if (result.error.missing_capabilities.length === 0) {
            return {
              type: "error",
              errorMessage:
                "Missing required capabilities to create the page in the Notion database.",
            };
          } else if (result.error.missing_capabilities.length === 1) {
            return {
              type: "error",
              errorMessage: `Missing required capability to create the page in the Notion database: ${NOTION_CAPABILITY_LABELS[result.error.missing_capabilities[0]]}.`,
            };
          } else {
            const missingCapabilitiesStr = formatMissingCapabilities(
              result.error.missing_capabilities,
            );

            return {
              type: "error",
              errorMessage: `Missing required capabilities to create the page in the Notion database: ${missingCapabilitiesStr}.`,
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
              "Conflict occurred while creating the page in the Notion database.",
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
          console.error("[create-database-page] unexpected error", _exhaustive);
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
