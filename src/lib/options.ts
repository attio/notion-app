import { isErrored } from "@attio/fetchable";
import {
  type DataSourceObjectResponse,
  isFullPage,
  isFullUser,
  type PageObjectResponse,
  type UserObjectResponse,
} from "@notionhq/client";
import type {
  PlainComboboxOption,
  PlainComboboxOptionsProvider,
} from "attio/client";
import { showToast } from "attio/client";
import { format } from "date-fns";
import type { NotionAPIError } from "../notion/error";
import { formatMissingCapabilities, getPageTitle } from "../notion/helpers";
import { NOTION_CAPABILITY_LABELS } from "../notion/types";
import getDataSource from "../server-functions/get-data-source.server";
import getPage from "../server-functions/get-page.server";
import getUser from "../server-functions/get-user.server";
import listUsers from "../server-functions/list-users.server";
import searchDataSources from "../server-functions/search-data-sources.server";
import searchPagesForCombobox from "../server-functions/search-pages.server";
import { ADD_TO_LABELS, ADD_TO_POSITIONS } from "./config";
import {
  NOTION_CAPABILITIES_URL,
  NOTION_INSTALLED_APP_PAGE,
} from "./constants";

/*
 * This file contains options and option providers used in workflow block configurators.
 */

// Unfortunately, there isn't a good way to show errors on the combobox itself.
// We work around this by showing errors in a toast.
function showSearchErrorToast(error: NotionAPIError, subject: string) {
  let title: string;
  let text: string | undefined;
  let link:
    | {
        label: string;
        url: string;
      }
    | undefined;

  switch (error.code) {
    case "FORBIDDEN":
      title = "Missing capabilities";

      if (error.missing_capabilities.length === 1) {
        text = `Your token is missing the '${NOTION_CAPABILITY_LABELS[error.missing_capabilities[0]]}' capability.`;
      } else if (error.missing_capabilities.length > 1) {
        text = `Your token is missing the following capabilities: ${formatMissingCapabilities(error.missing_capabilities)}.`;
      } else {
        text = "Please configure relevant capabilities for your token.";
      }

      link = {
        label: "Manage capabilities",
        url: NOTION_CAPABILITIES_URL,
      };
      break;
    case "UNAUTHORIZED":
      title = "Invalid access token";
      text =
        "Your access token is invalid. Please reconnect Notion and try again.";
      link = {
        label: "Reconnect",
        url: NOTION_INSTALLED_APP_PAGE,
      };
      break;
    case "RATE_LIMITED":
      title = "Rate limit exceeded";
      text =
        "Too many requests received. Please pause and try again in a few seconds.";
      break;
    case "NOTION_API_ERROR":
    case "NOT_FOUND":
    case "INVALID_REQUEST":
    case "CONFLICT":
    case "UNEXPECTED_ERROR":
      title = `An unexpected error ocurred when getting ${subject} from Notion`;
      break;
    default: {
      const _exhaustive: never = error;
      console.error("[options] unexpected error", _exhaustive);
      title = `An unexpected error ocurred when getting ${subject} from Notion`;
      break;
    }
  }

  showToast({
    title,
    text,
    action: link && {
      label: link.label,
      onClick: () => {
        window.open(link.url, "_blank");
      },
    },
    durationMs: 10_000,
    variant: "error",
  });
}

function safeFormatPageTitle(page: PageObjectResponse): {
  label: string;
  description?: string;
} {
  const titleResult = getPageTitle(page);

  if (isErrored(titleResult)) {
    return {
      label: "New page",
      description: format(new Date(page.created_time), "MMM d, yyyy"),
    };
  }

  return {
    label: titleResult.value,
  };
}

export const providePageOptions: PlainComboboxOptionsProvider = {
  search: async (query) => {
    // Note: passing an empty string here returns all results
    const pageResult = await searchPagesForCombobox(query);

    if (isErrored(pageResult)) {
      showSearchErrorToast(pageResult.error, "pages");

      return [];
    }

    return pageResult.value.map((p) => {
      return {
        value: p.id,
        ...safeFormatPageTitle(p),
      };
    });
  },
  getOption: async (value) => {
    const pageResult = await getPage(value);

    if (isErrored(pageResult)) {
      showSearchErrorToast(pageResult.error, "pages");

      return undefined;
    }

    if (!isFullPage(pageResult.value)) {
      return {
        value: pageResult.value.id,
        label: pageResult.value.id,
      };
    }

    return {
      value: pageResult.value.id,
      ...safeFormatPageTitle(pageResult.value),
    };
  },
};

function formatDataSourceTitle(dataSource: DataSourceObjectResponse): string {
  const title = dataSource.title.map((t) => t.plain_text).join("");

  return title.length > 0 ? title : "Untitled database";
}

export const provideDataSourceOptions: PlainComboboxOptionsProvider = {
  search: async (query) => {
    // Note: passing an empty string here returns all results
    const result = await searchDataSources(query);

    if (isErrored(result)) {
      showSearchErrorToast(result.error, "databases");

      return [];
    }

    return result.value.map((dataSource) => ({
      value: dataSource.id,
      label: formatDataSourceTitle(dataSource),
    }));
  },
  getOption: async (value) => {
    const result = await getDataSource(value);

    if (isErrored(result)) {
      showSearchErrorToast(result.error, "databases");

      return undefined;
    }

    return {
      value: result.value.id,
      label: formatDataSourceTitle(result.value),
    };
  },
};

function formatUserOption(user: UserObjectResponse): {
  value: string;
  label: string;
} {
  return {
    value: user.id,
    label: user.name ?? user.id,
  };
}

/** Offers the workspace's human users for Notion "people" properties. */
export const provideUserOptions: PlainComboboxOptionsProvider = {
  search: async (query) => {
    const result = await listUsers();

    if (isErrored(result)) {
      showSearchErrorToast(result.error, "users");

      return [];
    }

    // The Notion API has no server-side user search, so filter the full list here.
    const lowerQuery = query.trim().toLowerCase();

    return result.value
      .filter((user) => user.type === "person")
      .filter(
        (user) =>
          lowerQuery.length === 0 ||
          (user.name ?? "").toLowerCase().includes(lowerQuery),
      )
      .map(formatUserOption);
  },
  getOption: async (value) => {
    const result = await getUser(value);

    if (isErrored(result)) {
      showSearchErrorToast(result.error, "users");

      return undefined;
    }

    if (!isFullUser(result.value)) {
      return {
        value: result.value.id,
        label: result.value.id,
      };
    }

    return formatUserOption(result.value);
  },
};

export const ADD_TO_OPTIONS: Array<PlainComboboxOption> = ADD_TO_POSITIONS.map(
  (value) => ({
    value,
    label: ADD_TO_LABELS[value],
  }),
);
