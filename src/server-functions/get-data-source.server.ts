import { notion } from "../notion/client";

export default async function getDataSource(dataSourceId: string) {
  return await notion.getDataSource(dataSourceId);
}
