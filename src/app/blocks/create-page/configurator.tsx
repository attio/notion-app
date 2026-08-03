import { Workflows } from "attio/client";
import { providePageOptions } from "../../../lib/options";
import block from "./block";

export default Workflows.defineConfigurator(block, () => {
  const { ComboboxInput, TextInput, Outcome } =
    Workflows.useConfigurator(block);
  return (
    <>
      <ComboboxInput
        name="parent_page_id"
        label="Parent page"
        help="Search for a Notion page, or insert a page ID from an earlier step. The new page is created inside it."
        placeholder="Search Notion pages…"
        searchPlaceholder="Search Notion pages…"
        options={providePageOptions}
      />
      <TextInput
        name="title"
        label="Title"
        placeholder="Title for the new page"
        help="The title of the new page."
      />
      <Outcome
        id="created"
        schema={{
          page_id: Workflows.OutcomeSchema.string(),
          page_url: Workflows.OutcomeSchema.string(),
          title: Workflows.OutcomeSchema.string(),
        }}
      />
    </>
  );
});
