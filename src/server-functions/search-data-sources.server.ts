import { notion } from "../notion/client";

export default async function searchDataSources(query: string) {
  return await notion.searchDataSources(query);
}
