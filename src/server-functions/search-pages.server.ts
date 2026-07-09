import { notion } from "../notion/client";

export default async function searchPages(query: string) {
  return await notion.searchPages(query);
}
