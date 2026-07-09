import {
  type AsyncResult,
  bind,
  complete,
  errored,
  isErrored,
} from "@attio/fetchable";
import {
  type BlockObjectRequest,
  type BlockObjectResponse,
  type CreatePageParameters,
  type DataSourceObjectResponse,
  isFullDataSource,
  isFullPage,
  type PageObjectResponse,
  type PartialBlockObjectResponse,
  type PartialPageObjectResponse,
  type PartialUserObjectResponse,
  type UserObjectResponse,
} from "@notionhq/client";
import type { NotionAPIError } from "./error";
import type { NotionCapability } from "./types";
import { wrapNotion } from "./wrap-notion";

/** Notion caps `append block children` at 100 blocks per request. */
const APPEND_BATCH_SIZE = 100;

/** The property values map accepted when creating a Notion page. */
export type NotionPageProperties = NonNullable<
  CreatePageParameters["properties"]
>;

/** The parent under which a new Notion page is created. */
export type NotionCreatePageParent =
  | { page_id: string }
  | { data_source_id: string };

export const notion = {
  /**
   * @see https://developers.notion.com/reference/post-search
   */
  async searchPages(
    query: string,
  ): AsyncResult<Array<PageObjectResponse>, NotionAPIError> {
    return bind(
      await wrapNotion(
        async (n, startCursor) =>
          n.search({
            query,
            filter: { property: "object", value: "page" },
            start_cursor: startCursor,
          }),
        { paginate: true, requiredCapabilities: ["content.read"] },
      ),
      (res) => {
        // Filter above should have already covered this but double check response type to make types happy
        const filtered = res.filter(
          (item): item is PageObjectResponse | PartialPageObjectResponse =>
            item.object === "page",
        );

        // We then need to check that the user has enabled the relevant capabilities on their
        // personal access token. If the user has partial access, they'll receive a partial
        // page. We need to alert them to this so they can update their token's capabilities.
        if (filtered.some((page) => !isFullPage(page))) {
          console.warn(
            "[Notion] page search partial pages - token missing capabilities",
          );

          const missingCapabilities: Array<NotionCapability> = ["content.read"];

          return errored({
            code: "FORBIDDEN" as const,
            missing_capabilities: missingCapabilities,
          });
        }

        // Safe to assert: we checked with isFullPage above
        return complete(filtered as Array<PageObjectResponse>);
      },
    );
  },

  /**
   * @see https://developers.notion.com/reference/post-search
   */
  async searchDataSources(
    query: string,
  ): AsyncResult<Array<DataSourceObjectResponse>, NotionAPIError> {
    return bind(
      await wrapNotion(
        async (n, startCursor) =>
          n.search({
            query,
            filter: { property: "object", value: "data_source" },
            start_cursor: startCursor,
          }),
        { paginate: true, requiredCapabilities: ["content.read"] },
      ),
      (res) => {
        const filtered = res.filter((item) => item.object === "data_source");

        // Partial data sources mean the token is missing capabilities. Surface this so
        // the user can update their token rather than silently showing unusable options.
        if (!filtered.every(isFullDataSource)) {
          console.warn(
            "[Notion] data source search partial results - token missing capabilities",
          );

          const missingCapabilities: Array<NotionCapability> = ["content.read"];

          return errored({
            code: "FORBIDDEN" as const,
            missing_capabilities: missingCapabilities,
          });
        }

        return complete(filtered);
      },
    );
  },

  /**
   * @see https://developers.notion.com/reference/retrieve-a-data-source
   */
  async getDataSource(
    dataSourceId: string,
  ): AsyncResult<DataSourceObjectResponse, NotionAPIError> {
    return bind(
      await wrapNotion(
        async (n) => n.dataSources.retrieve({ data_source_id: dataSourceId }),
        {
          paginate: false,
          requiredCapabilities: ["content.read"],
        },
      ),
      (dataSource) => {
        // A partial data source means the token is missing capabilities. We need the full
        // object (title, full property configs) to configure and run blocks against it.
        if (!isFullDataSource(dataSource)) {
          console.warn(
            "[Notion] partial data source response - token missing capabilities",
          );

          const missingCapabilities: Array<NotionCapability> = ["content.read"];

          return errored({
            code: "FORBIDDEN" as const,
            missing_capabilities: missingCapabilities,
          });
        }

        return complete(dataSource);
      },
    );
  },

  /**
   * Pages created under a data source parent become rows of the database that data source
   * belongs to; pages created under a page parent become child pages.
   *
   * @see https://developers.notion.com/reference/post-page
   */
  async createPage({
    parent,
    properties,
  }: {
    parent: NotionCreatePageParent;
    properties: NotionPageProperties;
  }): AsyncResult<PageObjectResponse, NotionAPIError> {
    return bind(
      await wrapNotion(async (n) => n.pages.create({ parent, properties }), {
        paginate: false,
        requiredCapabilities: ["content.insert"],
      }),
      (page) => {
        // A partial page response means the token can insert but not read content. We
        // need the full page to expose its URL to downstream workflow steps.
        if (!isFullPage(page)) {
          console.warn(
            "[Notion] partial page returned from create - token missing capabilities",
          );

          const missingCapabilities: Array<NotionCapability> = ["content.read"];

          return errored({
            code: "FORBIDDEN" as const,
            missing_capabilities: missingCapabilities,
          });
        }

        return complete(page);
      },
    );
  },

  /**
   * @see https://developers.notion.com/reference/get-users
   */
  async listUsers(): AsyncResult<Array<UserObjectResponse>, NotionAPIError> {
    return wrapNotion(
      async (n, startCursor) => n.users.list({ start_cursor: startCursor }),
      {
        paginate: true,
        requiredCapabilities: ["user.read"],
      },
    );
  },

  /**
   * @see https://developers.notion.com/reference/get-user
   */
  async getUser(
    userId: string,
  ): AsyncResult<
    UserObjectResponse | PartialUserObjectResponse,
    NotionAPIError
  > {
    return wrapNotion(async (n) => n.users.retrieve({ user_id: userId }), {
      paginate: false,
      requiredCapabilities: ["user.read"],
    });
  },

  /**
   * @see https://developers.notion.com/reference/retrieve-a-page
   */
  async getPage(
    pageId: string,
  ): AsyncResult<
    PageObjectResponse | PartialPageObjectResponse,
    NotionAPIError
  > {
    return wrapNotion(async (n) => n.pages.retrieve({ page_id: pageId }), {
      paginate: false,
      requiredCapabilities: ["content.read"],
    });
  },

  /**
   * Append one or more blocks to a page, returning the first created block.
   *
   * Notion limits a single request to {@link APPEND_BATCH_SIZE} blocks, so larger inputs are
   * split into batches. To keep the blocks in order across batches, the first batch is inserted
   * at the requested position and each subsequent batch is anchored after the previous batch's
   * last block.
   *
   * @see https://developers.notion.com/reference/patch-block-children
   */
  async addBlocksToPage({
    pageId,
    blocks,
    position,
  }: {
    pageId: string;
    blocks: Array<BlockObjectRequest>;
    position: "start" | "end";
  }): AsyncResult<
    PartialBlockObjectResponse | BlockObjectResponse,
    NotionAPIError
  > {
    if (blocks.length === 0) {
      console.error("[Notion] addBlocksToPage called with no blocks");

      return errored({ code: "UNEXPECTED_ERROR" as const });
    }

    let firstBlock:
      | PartialBlockObjectResponse
      | BlockObjectResponse
      | undefined;
    let afterBlockId = "";

    for (let offset = 0; offset < blocks.length; offset += APPEND_BATCH_SIZE) {
      const batch = blocks.slice(offset, offset + APPEND_BATCH_SIZE);

      const result = await wrapNotion(
        async (n) =>
          n.blocks.children.append({
            block_id: pageId,
            children: batch,
            position:
              offset === 0
                ? { type: position }
                : { type: "after_block", after_block: { id: afterBlockId } },
          }),
        { paginate: false, requiredCapabilities: ["content.insert"] },
      );

      if (isErrored(result)) {
        return result;
      }

      // If block creation was successful, we should get at least one block back
      if (result.value.results.length === 0) {
        console.error(
          "[Notion] no blocks returned in append block children response",
        );

        return errored({ code: "UNEXPECTED_ERROR" as const });
      }

      firstBlock ??= result.value.results[0];
      afterBlockId = result.value.results[result.value.results.length - 1].id;
    }

    // firstBlock is always set: blocks is non-empty and each batch returns at least one block.
    return complete(
      firstBlock as PartialBlockObjectResponse | BlockObjectResponse,
    );
  },
};
