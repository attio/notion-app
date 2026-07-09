import { notion } from "../notion/client";

export default async function listUsers() {
  return await notion.listUsers();
}
