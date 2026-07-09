import { Workflows } from "attio";
import { Config } from "../../lib/config";

export default Workflows.defineWorkflowBlock({
  type: "step",
  id: "create-database-page",
  title: "Create page in database",
  description:
    "Creates a new page in a Notion database, setting its properties",
  configSchema: Config.createDatabasePage.workflows,
});
