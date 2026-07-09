import { isComplete, isErrored } from "@attio/fetchable";
import type { PageObjectResponse } from "@notionhq/client";
import { describe, expect, it } from "vitest";
import {
  buildBlock,
  formatMissingCapabilities,
  getPageTitle,
  markdownToBlocks,
  markdownToRichTextItems,
} from "./helpers";

describe("buildBlock", () => {
  it("wraps content in the requested block type", () => {
    expect(buildBlock("heading_1", "Hello")).toEqual({
      heading_1: { rich_text: [{ type: "text", text: { content: "Hello" } }] },
    });
  });

  it("splits content longer than the 2000-char limit into ordered rich-text chunks", () => {
    // Distinguishable regions so we verify the slice boundaries and ordering, not just lengths.
    const content = "a".repeat(2000) + "b".repeat(2000) + "c".repeat(500);

    expect(buildBlock("quote", content)).toEqual({
      quote: {
        rich_text: [
          { type: "text", text: { content: "a".repeat(2000) } },
          { type: "text", text: { content: "b".repeat(2000) } },
          { type: "text", text: { content: "c".repeat(500) } },
        ],
      },
    });
  });
});

describe(markdownToRichTextItems, () => {
  it("returns a single unformatted item for plain text", () => {
    expect(markdownToRichTextItems("Hello world")).toEqual([
      { type: "text", text: { content: "Hello world" } },
    ]);
  });

  it("parses bold with ** and __", () => {
    expect(markdownToRichTextItems("**bold**")).toEqual([
      { type: "text", text: { content: "bold" }, annotations: { bold: true } },
    ]);
    expect(markdownToRichTextItems("__bold__")).toEqual([
      { type: "text", text: { content: "bold" }, annotations: { bold: true } },
    ]);
  });

  it("parses italic with * and _", () => {
    expect(markdownToRichTextItems("*italic*")).toEqual([
      {
        type: "text",
        text: { content: "italic" },
        annotations: { italic: true },
      },
    ]);
    expect(markdownToRichTextItems("_italic_")).toEqual([
      {
        type: "text",
        text: { content: "italic" },
        annotations: { italic: true },
      },
    ]);
  });

  it("parses strikethrough", () => {
    expect(markdownToRichTextItems("~~gone~~")).toEqual([
      {
        type: "text",
        text: { content: "gone" },
        annotations: { strikethrough: true },
      },
    ]);
  });

  it("parses code spans verbatim without nested formatting", () => {
    expect(markdownToRichTextItems("`**not bold**`")).toEqual([
      {
        type: "text",
        text: { content: "**not bold**" },
        annotations: { code: true },
      },
    ]);
  });

  it("parses links into a text item carrying the href", () => {
    expect(markdownToRichTextItems("[Attio](https://attio.com)")).toEqual([
      {
        type: "text",
        text: { content: "Attio", link: { url: "https://attio.com" } },
      },
    ]);
  });

  it("composes bold and italic on the same run", () => {
    expect(markdownToRichTextItems("***both***")).toEqual([
      {
        type: "text",
        text: { content: "both" },
        annotations: { bold: true, italic: true },
      },
    ]);
  });

  it("splits a mixed line into ordered items", () => {
    expect(
      markdownToRichTextItems("Hi **there** and [x](https://x.com)"),
    ).toEqual([
      { type: "text", text: { content: "Hi " } },
      { type: "text", text: { content: "there" }, annotations: { bold: true } },
      { type: "text", text: { content: " and " } },
      { type: "text", text: { content: "x", link: { url: "https://x.com" } } },
    ]);
  });

  it("treats escaped delimiters as literal characters", () => {
    expect(markdownToRichTextItems("\\*not italic\\*")).toEqual([
      { type: "text", text: { content: "*not italic*" } },
    ]);
  });

  it("chunks a long formatted run while preserving annotations", () => {
    const items = markdownToRichTextItems(`**${"a".repeat(2500)}**`);

    expect(items).toEqual([
      {
        type: "text",
        text: { content: "a".repeat(2000) },
        annotations: { bold: true },
      },
      {
        type: "text",
        text: { content: "a".repeat(500) },
        annotations: { bold: true },
      },
    ]);
  });

  it("falls back to plain text on an unterminated delimiter without throwing", () => {
    expect(() => markdownToRichTextItems("**bold")).not.toThrow();
    expect(markdownToRichTextItems("**bold")).toEqual([
      { type: "text", text: { content: "**bold" } },
    ]);
  });
});

describe(markdownToBlocks, () => {
  it("returns an empty array for blank input", () => {
    expect(markdownToBlocks("")).toEqual([]);
    expect(markdownToBlocks("   \n  ")).toEqual([]);
  });

  it("maps heading levels to the matching block type", () => {
    expect(markdownToBlocks("# One\n## Two\n### Three")).toEqual([
      {
        heading_1: { rich_text: [{ type: "text", text: { content: "One" } }] },
      },
      {
        heading_2: { rich_text: [{ type: "text", text: { content: "Two" } }] },
      },
      {
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Three" } }],
        },
      },
    ]);
  });

  it("emits one bulleted list item per line", () => {
    expect(markdownToBlocks("- first\n- second")).toEqual([
      {
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "first" } }],
        },
      },
      {
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "second" } }],
        },
      },
    ]);
  });

  it("emits numbered list items", () => {
    expect(markdownToBlocks("1. first\n2. second")).toEqual([
      {
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: "first" } }],
        },
      },
      {
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: "second" } }],
        },
      },
    ]);
  });

  it("joins consecutive quote lines into a single quote block", () => {
    expect(markdownToBlocks("> line one\n> line two")).toEqual([
      {
        quote: {
          rich_text: [
            { type: "text", text: { content: "line one\nline two" } },
          ],
        },
      },
    ]);
  });

  it("separates paragraphs on blank lines", () => {
    expect(markdownToBlocks("first para\n\nsecond para")).toEqual([
      {
        paragraph: {
          rich_text: [{ type: "text", text: { content: "first para" } }],
        },
      },
      {
        paragraph: {
          rich_text: [{ type: "text", text: { content: "second para" } }],
        },
      },
    ]);
  });

  it("preserves inline formatting inside a block", () => {
    expect(markdownToBlocks("# A **bold** title")).toEqual([
      {
        heading_1: {
          rich_text: [
            { type: "text", text: { content: "A " } },
            {
              type: "text",
              text: { content: "bold" },
              annotations: { bold: true },
            },
            { type: "text", text: { content: " title" } },
          ],
        },
      },
    ]);
  });

  it("converts a mixed document into ordered blocks of the right types", () => {
    const blocks = markdownToBlocks(
      "# Title\n\nA paragraph.\n\n- a\n- b\n\n> quote",
    );

    expect(blocks.map((b) => Object.keys(b)[0])).toEqual([
      "heading_1",
      "paragraph",
      "bulleted_list_item",
      "bulleted_list_item",
      "quote",
    ]);
  });
});

describe("getPageTitle", () => {
  function pageWithTitle(
    title: Array<{ plain_text: string }>,
  ): PageObjectResponse {
    return {
      properties: { Name: { type: "title", title } },
    } as unknown as PageObjectResponse;
  }

  it("returns the plain text of the title property", () => {
    const result = getPageTitle(pageWithTitle([{ plain_text: "My page" }]));

    expect(isComplete(result)).toBe(true);
    if (isComplete(result)) {
      expect(result.value).toBe("My page");
    }
  });

  it("returns an UNTITLED error when the title has no text", () => {
    const result = getPageTitle(pageWithTitle([]));

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error.code).toBe("UNTITLED");
    }
  });

  it("throws when the page has no title property", () => {
    const page = {
      properties: { Status: { type: "status" } },
    } as unknown as PageObjectResponse;

    expect(() => getPageTitle(page)).toThrow(
      "Expected page to have a title property",
    );
  });
});

describe("formatMissingCapabilities", () => {
  it("formats a single capability as a quoted label", () => {
    expect(formatMissingCapabilities(["content.read"])).toBe("'Read content'");
  });

  it("joins multiple capabilities with a comma-separated list of quoted labels", () => {
    expect(formatMissingCapabilities(["content.read", "comments.insert"])).toBe(
      "'Read content', 'Insert comments'",
    );
  });
});
