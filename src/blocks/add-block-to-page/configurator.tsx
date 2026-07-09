import { Workflows } from "attio/client";
import { ADD_TO_OPTIONS, providePageOptions } from "../../lib/options";
import block from "./block";

export default Workflows.defineConfigurator(block, ({ configSchema }) => {
  const { ComboboxInput, RichTextInput, Outcome } =
    Workflows.useConfigurator(configSchema);
  return (
    <>
      <ComboboxInput
        name="page_id"
        label="Page"
        help="Search for a Notion page, or insert a page ID from an earlier step."
        placeholder="Search Notion pages…"
        searchPlaceholder="Search Notion pages…"
        options={providePageOptions}
      />
      <RichTextInput
        name="rich_content"
        label="Content"
        placeholder="Write text, headings, lists…"
        help="Rich text to add to the page. Supports headings, lists, quotes and inline formatting."
        // Underline has no markdown representation, which is the only format the value
        // exposes, so it would be lost on the way to Notion.
        disableUnderline
      />
      <ComboboxInput
        name="add_to_position"
        label="Position"
        help="Whether the content is prepended to the start or appended to the end of the page."
        disableSearch
        options={ADD_TO_OPTIONS}
      />
      <Outcome
        id="added"
        schema={{
          block_id: Workflows.OutcomeSchema.string(),
          page_id: Workflows.OutcomeSchema.string(),
        }}
      />
    </>
  );
});
