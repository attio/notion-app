import { Workflows } from "attio";
import { Config } from "../../lib/config";

export default Workflows.defineWorkflowBlock({
  type: "step",
  id: "add-block-to-page",
  title: "Add content to page",
  description: "Adds rich text content to a Notion page",
  configSchema: Config.addBlockToPage.workflows,
});
