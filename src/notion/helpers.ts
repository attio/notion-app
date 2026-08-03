import { complete, errored, type Result } from "@attio/fetchable";
import type { BlockObjectRequest, PageObjectResponse } from "@notionhq/client";
import {
  NOTION_CAPABILITY_LABELS,
  type NotionCapability,
  type NotionTextBlockType,
} from "./types";

/**
 * Notion's request-side rich text item type isn't re-exported from the package root, so derive it
 * from a block that carries a `rich_text` array.
 */
type RichTextItemRequest = NonNullable<
  Extract<BlockObjectRequest, { paragraph: unknown }>["paragraph"]
>["rich_text"][number];

/**
 * @see https://developers.notion.com/reference/request-limits#limits-for-property-values
 */
const TEXT_CHUNK_MAX_LENGTH = 2000;

/**
 * Split plain text content into Notion rich-text items.
 * Notion caps the size of a single rich-text item so split into chunks if we exceed the limit.
 */
export function buildRichTextItems(
  content: string,
): Array<{ type: "text"; text: { content: string } }> {
  const textItems: Array<{ type: "text"; text: { content: string } }> = [];

  for (
    let offset = 0;
    offset < content.length;
    offset += TEXT_CHUNK_MAX_LENGTH
  ) {
    textItems.push({
      type: "text",
      text: { content: content.slice(offset, offset + TEXT_CHUNK_MAX_LENGTH) },
    });
  }

  return textItems;
}

/**
 * The block types we can produce from a workflow block. A superset of {@link NotionTextBlockType}:
 * the legacy single-block path uses the text types, while the rich-text path additionally emits
 * list items parsed from markdown.
 */
type SupportedBlockType =
  NotionTextBlockType | "bulleted_list_item" | "numbered_list_item";

/** Wrap a pre-built rich-text array in the requested block type. */
function wrapRichText(
  blockType: SupportedBlockType,
  items: Array<RichTextItemRequest>,
): BlockObjectRequest {
  switch (blockType) {
    case "heading_1":
      return { heading_1: { rich_text: items } };
    case "heading_2":
      return { heading_2: { rich_text: items } };
    case "heading_3":
      return { heading_3: { rich_text: items } };
    case "heading_4":
      return { heading_4: { rich_text: items } };
    case "paragraph":
      return { paragraph: { rich_text: items } };
    case "quote":
      return { quote: { rich_text: items } };
    case "bulleted_list_item":
      return { bulleted_list_item: { rich_text: items } };
    case "numbered_list_item":
      return { numbered_list_item: { rich_text: items } };
  }
}

/**
 * Convert plain text content into a Notion block object we can send over the API.
 *
 * This is the legacy plain-text path: content carries no formatting and is emitted as a single
 * block of the given type. New configurations use the rich-text path via {@link markdownToBlocks}.
 */
export function buildBlock(
  blockType: NotionTextBlockType,
  content: string,
): BlockObjectRequest {
  return wrapRichText(blockType, buildRichTextItems(content));
}

/**
 * The inline marks we recognise when parsing markdown. Notion also supports underline, but
 * markdown (the only serialization the Attio rich-text value exposes) has no way to represent it,
 * so the configurator disables underline and we never see it here.
 */
type InlineMarks = { bold: boolean; italic: boolean; strikethrough: boolean };

/** A run of text sharing the same formatting, produced by {@link parseInline}. */
type InlineSegment = {
  text: string;
  marks: InlineMarks;
  code?: boolean;
  link?: string;
};

/** Match a `[label](url)` link starting at `start` (which must point at `[`). */
function matchLink(
  md: string,
  start: number,
): { label: string; url: string; end: number } | undefined {
  const close = md.indexOf("]", start + 1);
  if (close === -1 || md[close + 1] !== "(") {
    return undefined;
  }

  const paren = md.indexOf(")", close + 2);
  if (paren === -1) {
    return undefined;
  }

  return {
    label: md.slice(start + 1, close),
    url: md.slice(close + 2, paren),
    end: paren + 1,
  };
}

/**
 * Parse a single line of inline markdown into formatted segments. Handles `**bold**`/`__bold__`,
 * `*italic*`/`_italic_`, `~~strikethrough~~`, `` `code` ``, `[label](url)` and backslash escapes.
 *
 * Returns `undefined` when the markdown is malformed (e.g. an unclosed delimiter), signalling the
 * caller to fall back to treating the input as plain text rather than emitting something wrong.
 */
function parseInline(md: string): Array<InlineSegment> | undefined {
  const segments: Array<InlineSegment> = [];
  const marks: InlineMarks = {
    bold: false,
    italic: false,
    strikethrough: false,
  };
  let buf = "";

  const flush = () => {
    if (buf.length > 0) {
      segments.push({ text: buf, marks: { ...marks } });
      buf = "";
    }
  };

  let i = 0;
  while (i < md.length) {
    const c = md[i];

    // Backslash escape: the next character is literal.
    if (c === "\\" && i + 1 < md.length) {
      buf += md[i + 1];
      i += 2;
      continue;
    }

    // Code span: content between backticks is verbatim, no nested parsing.
    if (c === "`") {
      const end = md.indexOf("`", i + 1);
      if (end === -1) {
        buf += c;
        i += 1;
        continue;
      }
      flush();
      segments.push({
        text: md.slice(i + 1, end),
        marks: { ...marks },
        code: true,
      });
      i = end + 1;
      continue;
    }

    // Link: emit a segment carrying the surrounding marks plus the href.
    if (c === "[") {
      const link = matchLink(md, i);
      if (link !== undefined) {
        flush();
        segments.push({
          text: link.label,
          marks: { ...marks },
          link: link.url,
        });
        i = link.end;
        continue;
      }
      buf += c;
      i += 1;
      continue;
    }

    const two = md.slice(i, i + 2);
    if (two === "**" || two === "__") {
      flush();
      marks.bold = !marks.bold;
      i += 2;
      continue;
    }
    if (two === "~~") {
      flush();
      marks.strikethrough = !marks.strikethrough;
      i += 2;
      continue;
    }
    if (c === "*" || c === "_") {
      flush();
      marks.italic = !marks.italic;
      i += 1;
      continue;
    }

    buf += c;
    i += 1;
  }

  flush();

  // An unclosed delimiter means we mis-parsed: bail so the caller can fall back to plain text.
  if (marks.bold || marks.italic || marks.strikethrough) {
    return undefined;
  }

  return segments;
}

/** Build a Notion annotations object, or `undefined` when the segment has no formatting. */
function buildAnnotations(
  segment: InlineSegment,
): RichTextItemRequest["annotations"] | undefined {
  const annotations: NonNullable<RichTextItemRequest["annotations"]> = {};

  if (segment.marks.bold) annotations.bold = true;
  if (segment.marks.italic) annotations.italic = true;
  if (segment.marks.strikethrough) annotations.strikethrough = true;
  if (segment.code) annotations.code = true;

  return Object.keys(annotations).length > 0 ? annotations : undefined;
}

/**
 * Convert a line of inline markdown into Notion rich-text items, preserving bold/italic/
 * strikethrough/code annotations and links. Falls back to unformatted text if the markdown can't
 * be parsed. Still respects the per-item length cap that {@link buildRichTextItems} enforces.
 */
export function markdownToRichTextItems(
  markdown: string,
): Array<RichTextItemRequest> {
  let segments: Array<InlineSegment> | undefined;
  try {
    segments = parseInline(markdown);
  } catch (error) {
    console.error("[Notion] failed to parse inline markdown", error);
    segments = undefined;
  }

  if (segments === undefined) {
    return buildRichTextItems(markdown);
  }

  const items: Array<RichTextItemRequest> = [];
  for (const segment of segments) {
    const annotations = buildAnnotations(segment);

    for (
      let offset = 0;
      offset < segment.text.length;
      offset += TEXT_CHUNK_MAX_LENGTH
    ) {
      const content = segment.text.slice(
        offset,
        offset + TEXT_CHUNK_MAX_LENGTH,
      );
      const text =
        segment.link !== undefined
          ? { content, link: { url: segment.link } }
          : { content };

      items.push(
        annotations !== undefined
          ? { type: "text", text, annotations }
          : { type: "text", text },
      );
    }
  }

  return items;
}

/** Strip a `1. `/`12. ` style numbered-list marker, returning the item text if matched. */
function matchOrderedListItem(line: string): string | undefined {
  const match = line.match(/^\d+\.\s+(.*)$/);
  return match?.[1];
}

/**
 * Convert markdown (as produced by the Attio rich-text editor) into an ordered list of Notion
 * blocks: headings, paragraphs, bulleted/numbered list items and quotes, each with inline
 * formatting. On any parse failure we degrade to plain paragraphs so we never emit a malformed
 * payload. Returns an empty array for blank input.
 */
export function markdownToBlocks(markdown: string): Array<BlockObjectRequest> {
  try {
    const blocks: Array<BlockObjectRequest> = [];
    const paragraphLines: Array<string> = [];
    const quoteLines: Array<string> = [];

    const flushParagraph = () => {
      if (paragraphLines.length > 0) {
        blocks.push(
          wrapRichText(
            "paragraph",
            markdownToRichTextItems(paragraphLines.join("\n")),
          ),
        );
        paragraphLines.length = 0;
      }
    };
    const flushQuote = () => {
      if (quoteLines.length > 0) {
        blocks.push(
          wrapRichText("quote", markdownToRichTextItems(quoteLines.join("\n"))),
        );
        quoteLines.length = 0;
      }
    };
    const flushAll = () => {
      flushParagraph();
      flushQuote();
    };

    for (const line of markdown.split("\n")) {
      if (line.trim().length === 0) {
        flushAll();
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading !== null) {
        flushAll();
        const level = heading[1].length as 1 | 2 | 3;
        blocks.push(
          wrapRichText(`heading_${level}`, markdownToRichTextItems(heading[2])),
        );
        continue;
      }

      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet !== null) {
        flushAll();
        blocks.push(
          wrapRichText(
            "bulleted_list_item",
            markdownToRichTextItems(bullet[1]),
          ),
        );
        continue;
      }

      const ordered = matchOrderedListItem(line);
      if (ordered !== undefined) {
        flushAll();
        blocks.push(
          wrapRichText("numbered_list_item", markdownToRichTextItems(ordered)),
        );
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote !== null) {
        flushParagraph();
        quoteLines.push(quote[1]);
        continue;
      }

      // Plain text: accumulate into the current paragraph.
      flushQuote();
      paragraphLines.push(line);
    }

    flushAll();
    return blocks;
  } catch (error) {
    console.error("[Notion] failed to convert markdown to blocks", error);
    return markdown
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .map((paragraph) =>
        wrapRichText("paragraph", buildRichTextItems(paragraph)),
      );
  }
}

export function getPageTitle(
  page: PageObjectResponse,
): Result<string, { code: "UNTITLED" }> {
  // Notion expresses the title on a page as a regular property.
  // Regular pages name this 'title' but database pages can have any name.
  // We therefore need to check for the type to find the title.
  // Assume there is exactly one title property per page.

  const titleProperty = Object.values(page.properties).find(
    (p) => p.type === "title",
  );

  if (titleProperty === undefined) {
    console.error("[Notion] expected page to have a title property");

    throw new Error("Expected page to have a title property");
  }

  if (titleProperty.title.length === 0) {
    return errored({ code: "UNTITLED" });
  }

  return complete(titleProperty.title[0].plain_text);
}

/**
 * Format a list of Notion capabilities into a quoted, comma-separated list of
 * human-readable labels, e.g. `'Read content', 'Insert content'`.
 */
export function formatMissingCapabilities(
  capabilities: ReadonlyArray<NotionCapability>,
): string {
  return capabilities.map((c) => `'${NOTION_CAPABILITY_LABELS[c]}'`).join(", ");
}
