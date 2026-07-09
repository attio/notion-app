import { notion } from "../notion/client";

export default async function getUser(userId: string) {
  return await notion.getUser(userId);
}
