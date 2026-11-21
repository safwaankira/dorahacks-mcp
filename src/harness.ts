import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DoraHacksClient, type FetchLike } from "./client.js";
import { createServer } from "./server.js";

/** Connect an MCP client to the server in-process (used by tests and the smoke script). */
export async function connect(fetchImpl?: FetchLike) {
  const server = createServer(new DoraHacksClient(fetchImpl));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "harness", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? "";
    return { isError: Boolean(r.isError), text, data: r.isError ? null : JSON.parse(text) };
  };
  return { client, call };
}
