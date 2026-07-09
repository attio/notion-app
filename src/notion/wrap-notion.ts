import { type AsyncResult, complete, errored } from "@attio/fetchable";
import {
  APIErrorCode,
  APIResponseError,
  Client as NotionClient,
} from "@notionhq/client";
import { getWorkspaceConnection } from "attio/server";
import type { NotionAPIError } from "./error";
import type { NotionCapability } from "./types";

/**
 * Builds a Notion client authenticated with the workspace connection token.
 *
 * Note: It is very important that you do not wrap this in a try/catch. The App SDk relies upon
 * custom AttioError classes to power missing connection errors for the user. Please get the
 * client outside of a try/catch, then proceed with any other API code and handle with try/catch
 * and resutls as normal.
 *
 * DO NOT export this function/use outside this file.
 *
 * @throws {AttioError}
 */
function notion(): NotionClient {
  const connection = getWorkspaceConnection();

  return new NotionClient({
    auth: connection.value,
    retry: {
      maxRetries: 3,
      maxRetryDelayMs: 8_000, // 3 x 8s = 24s total (under 30s timeout)
    },
  });
}

/**
 * Pagination interface shared by every paginated Notion endpoint response.
 *
 * @see https://developers.notion.com/reference/intro#pagination
 */
interface NotionPaginatedList<Item> {
  results: Item[];
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * Maximum wall-clock time {@link wrapNotion} will spend paginating before returning whatever it has
 * gathered so far.
 *
 * App SDK server executions have a hard 30s timeout. Unbounded/large responses could cause paginated
 * calls to take longer than this, resulting in errors. We implement a time-based limit to avoid this
 * scenario.
 *
 * We are deliberately conservative: 10s leaves ~20s of headroom for other API calls/work and also
 * ensure the user experience is snappier.
 */
const PAGINATION_TIME_LIMIT_MS = 10_000;

export async function wrapNotion<R>(
  callNotionAPI: (n: NotionClient) => Promise<R>,
  options?: { paginate?: false; requiredCapabilities?: NotionCapability[] },
): AsyncResult<R, NotionAPIError>;
export async function wrapNotion<Item>(
  callNotionAPI: (
    n: NotionClient,
    startCursor: string | undefined,
  ) => Promise<NotionPaginatedList<Item>>,
  options: { paginate: true; requiredCapabilities?: NotionCapability[] },
): AsyncResult<Item[], NotionAPIError>;
export async function wrapNotion(
  callNotionAPI: (
    n: NotionClient,
    startCursor: string | undefined,
  ) => Promise<unknown>,
  options: {
    paginate?: boolean;
    requiredCapabilities?: NotionCapability[];
  } = {},
): AsyncResult<unknown, NotionAPIError> {
  // This will throw if the connection is missing. Keep this outside of the try/catch.
  const n = notion();

  try {
    if (!options.paginate) {
      return complete(await callNotionAPI(n, undefined));
    }

    const results: unknown[] = [];
    let startCursor: string | undefined;
    let hasMore = true;
    let requestCount = 0;

    const startedAt = Date.now();

    while (hasMore) {
      // Safe to assert: `paginate: true` overload ensures this is a NotionPaginatedList
      const page = (await callNotionAPI(
        n,
        startCursor,
      )) as NotionPaginatedList<unknown>;
      results.push(...page.results);
      requestCount++;
      hasMore = page.has_more && page.next_cursor !== null;
      startCursor = page.next_cursor ?? undefined;

      // Stop once we've spent our time budget, returning whatever we've gathered. Only
      // relevant when more pages remain — a natural finish needs no warning.
      const elapsedMs = Date.now() - startedAt;
      if (hasMore && elapsedMs > PAGINATION_TIME_LIMIT_MS) {
        console.warn(
          `[Notion] pagination time budget of ${PAGINATION_TIME_LIMIT_MS}ms exceeded after ` +
            `${requestCount} request(s) (${elapsedMs}ms elapsed, ${results.length} results); ` +
            `returning partial results`,
        );
        break;
      }
    }

    return complete(results);
  } catch (error) {
    if (error instanceof APIResponseError) {
      switch (error.code) {
        case APIErrorCode.ObjectNotFound:
          return errored({ code: "NOT_FOUND" });
        case APIErrorCode.RateLimited:
          console.warn("[Notion] rate limit exceeded");
          return errored({ code: "RATE_LIMITED" });
        case APIErrorCode.ConflictError:
          return errored({ code: "CONFLICT" });
        case APIErrorCode.GatewayTimeout:
        case APIErrorCode.InternalServerError:
        case APIErrorCode.ServiceUnavailable:
          console.error("[Notion] unexpected error calling Notion API", error);
          return errored({ code: "NOTION_API_ERROR" });
        case APIErrorCode.InvalidJSON:
        case APIErrorCode.InvalidRequest:
        case APIErrorCode.ValidationError:
          console.error("[Notion] invalid request to Notion API", error);
          return errored({ code: "INVALID_REQUEST" });
        case APIErrorCode.Unauthorized:
          // 401 - e.g. invalid access token
          console.warn(
            `[Notion] unauthorized access error when calling Notion API (${error.status})`,
            error.code,
          );
          return errored({ code: "UNAUTHORIZED" });
        case APIErrorCode.RestrictedResource:
          // 403 - e.g. missing capabilities on access token
          // Notion's API doesn't tell us which capabilities are missing, so we surface
          // the ones the caller declared as required for this endpoint (if any).
          console.warn(
            `[Notion] missing capabilities when calling Notion API`,
            error.code,
          );

          return errored({
            code: "FORBIDDEN",
            missing_capabilities: options.requiredCapabilities ?? [],
          });
        case APIErrorCode.InvalidRequestURL:
          console.error(
            "[Notion] invalid request URL when calling Notion API",
            error,
          );
          return errored({ code: "UNEXPECTED_ERROR" });
      }
    }

    console.error("[Notion] unexpected error calling Notion API", error);

    return errored({ code: "UNEXPECTED_ERROR" });
  }
}
