import { notion } from "../notion/client";

export default async function getPageOption(pageId: string) {
  return await notion.getPage(pageId);
}
