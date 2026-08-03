import { Workflows } from "attio";
import { Config } from "../../../lib/config";

export default Workflows.defineWorkflowBlock({
  type: "step",
  id: "create-page",
  title: "Create page",
  description: "Creates a new page inside an existing Notion page",
  configSchema: Config.createPage.workflows,
});
