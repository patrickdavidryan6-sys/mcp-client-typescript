#!/usr/bin/env node
/**
 * TypeScript MCP chatbot client (official quickstart + SDK v2).
 *
 * Launches any stdio MCP server (.js / .py / .ts), lists its tools, and runs an
 * interactive chat loop where Claude can call those tools.
 *
 * Based on: https://modelcontextprotocol.io/docs/develop/build-client
 */
import { Anthropic, AuthenticationError } from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ContentBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

/**
 * Current Claude model id accepted by @anthropic-ai/sdk.
 * Tutorial alias `claude-opus-5` is also typed, but this dated Sonnet id is
 * the stable default used in SDK examples.
 */
const MODEL = "claude-sonnet-4-5-20250929";

/** Clear setup help when Anthropic rejects auth (401 / AuthenticationError). */
function printAuthHelp(): void {
  console.log(`
Authentication failed (no usable Anthropic credentials).

Set up credentials one of these ways:

  Preferred:  ant auth login
              ant auth status   # see which credential source / profile is active

  Or:         export ANTHROPIC_API_KEY=sk-ant-...
              (or add it to a .env file — see .env.example)

  Or:         export ANTHROPIC_AUTH_TOKEN=...

If a stale pasted ANTHROPIC_API_KEY is set, it overrides ant auth login
profiles — unset it first:
  unset ANTHROPIC_API_KEY
`);
}

function isAuthFailure(error: unknown): boolean {
  if (error instanceof AuthenticationError) {
    return true;
  }
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 401
  ) {
    return true;
  }
  return false;
}

class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    // Anthropic client is created lazily with default credential resolution
    // (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or ant auth login profile).
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  private getAnthropic(): Anthropic {
    if (!this.anthropic) {
      // Default — resolves credentials from the environment:
      // ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
      this.anthropic = new Anthropic();
    }
    return this.anthropic;
  }

  /**
   * Resolve the command used to launch the MCP server subprocess.
   * Supports .js (node), .py (python3/python), and .ts (npx tsx).
   */
  private resolveServerCommand(serverScriptPath: string): {
    command: string;
    args: string[];
  } {
    const isJs = serverScriptPath.endsWith(".js");
    const isPy = serverScriptPath.endsWith(".py");
    const isTs = serverScriptPath.endsWith(".ts");

    if (!isJs && !isPy && !isTs) {
      throw new Error(
        "Server script must be a .js, .py, or .ts file"
      );
    }

    if (isPy) {
      const command =
        process.platform === "win32" ? "python" : "python3";
      return { command, args: [serverScriptPath] };
    }

    if (isTs) {
      // Drive TypeScript MCP servers (e.g. chat-agent-mcp/src/index.ts)
      // without a prior build step.
      return {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["-y", "tsx", serverScriptPath],
      };
    }

    return { command: process.execPath, args: [serverScriptPath] };
  }

  async connectToServer(serverScriptPath: string) {
    try {
      const { command, args } = this.resolveServerCommand(serverScriptPath);

      this.transport = new StdioClientTransport({
        command,
        args,
      });
      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description ?? "",
          input_schema: tool.inputSchema as Tool.InputSchema,
        };
      });
      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  /**
   * Serialize MCP CallToolResult content into a string for Anthropic tool_result.
   */
  private formatToolResultContent(result: {
    content?: unknown;
    isError?: boolean;
  }): string {
    const content = result.content;
    if (content == null) {
      return "";
    }
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (
            block &&
            typeof block === "object" &&
            "type" in block &&
            (block as { type: string }).type === "text" &&
            "text" in block
          ) {
            return String((block as { text: unknown }).text);
          }
          return JSON.stringify(block);
        })
        .join("\n");
    }
    return JSON.stringify(content);
  }

  /**
   * Send a query to Claude with available MCP tools. On tool_use, call MCP
   * tools and feed results back with the correct Anthropic tool_use /
   * tool_result message shape until Claude returns text-only.
   */
  async processQuery(query: string): Promise<string> {
    const anthropic = this.getAnthropic();
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    const finalText: string[] = [];

    // Loop until Claude stops requesting tools (correct multi-turn tool use).
    // Cap iterations to avoid runaway loops.
    const maxRounds = 20;
    for (let round = 0; round < maxRounds; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1000,
        messages,
        tools: this.tools,
      });

      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          finalText.push(
            `[Calling tool ${content.name} with args ${JSON.stringify(content.input)}]`
          );
        }
      }

      if (toolUseBlocks.length === 0) {
        break;
      }

      // Assistant turn must include the tool_use blocks (with ids).
      messages.push({
        role: "assistant",
        content: response.content as ContentBlockParam[],
      });

      const toolResults: ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;

        const toolName = block.name;
        const toolArgs = block.input as
          | { [x: string]: unknown }
          | undefined;

        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: this.formatToolResultContent(result),
          is_error: Boolean(result.isError),
        });
      }

      // User turn with tool_result blocks matching each tool_use_id.
      messages.push({
        role: "user",
        content: toolResults,
      });
    }

    return finalText.join("\n");
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        if (!message.trim()) {
          continue;
        }
        try {
          const response = await this.processQuery(message);
          console.log("\n" + response);
        } catch (e) {
          if (isAuthFailure(e)) {
            printAuthHelp();
          } else {
            console.log("\nError:", e instanceof Error ? e.message : e);
          }
        }
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log(
      "Usage: node build/index.js <path_to_server_script>\n" +
        "  Supports .js (node), .py (python3), .ts (npx tsx)"
    );
    process.exit(1);
  }

  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2]);
    // Always enter chat after connect — SDK may resolve credentials via
    // ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
    // Auth failures are handled inside chatLoop on first Anthropic call.
    await mcpClient.chatLoop();
  } catch (e) {
    console.error("Error:", e);
    await mcpClient.cleanup();
    process.exit(1);
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
