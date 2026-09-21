# MCP Client (TypeScript)

An LLM-powered [Model Context Protocol](https://modelcontextprotocol.io/) chatbot client. It launches any stdio MCP server, lists its tools, and runs an interactive chat loop where Claude can call those tools.

Based on the official [Build an MCP client](https://modelcontextprotocol.io/docs/develop/build-client) TypeScript quickstart, updated for `@modelcontextprotocol/client` **v2** and correct Anthropic `tool_use` / `tool_result` message shaping.

## Stack

- Node.js 20+
- `@modelcontextprotocol/client` (v2)
- `@anthropic-ai/sdk`
- `dotenv`
- TypeScript (`type: "module"`)

## Model

Default Claude model id: **`claude-sonnet-4-5-20250929`**

This is a stable dated Sonnet id accepted by the current Anthropic TypeScript SDK (see SDK examples). The quickstart alias `claude-opus-5` is also typed by the SDK; change `MODEL` in `index.ts` if you prefer Opus or another id.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run build
```

`.env` is gitignored. Never commit your API key.

## Run

```bash
# Against a built Node MCP server
node build/index.js /path/to/server/dist/index.js

# Or via npm script
npm start -- /path/to/server/dist/index.js
```

### Against [chat-agent-mcp](https://github.com/patrickdavidryan6-sys/chat-agent-mcp)

**Built JS (recommended):**

```bash
# In chat-agent-mcp: npm install && npm run build
node build/index.js /path/to/chat-agent-mcp/dist/index.js
```

**TypeScript source via `npx tsx` (no prior server build):**

```bash
node build/index.js /path/to/chat-agent-mcp/src/index.ts
```

### Other servers

| Extension | Launcher |
|-----------|----------|
| `.js` | `node` (this process's Node binary) |
| `.py` | `python3` (or `python` on Windows) |
| `.ts` | `npx -y tsx` |

You can mix and match with **any** MCP stdio server — weather demos, filesystem servers, custom agents, etc. Pass the path to the server entry script as the sole argument.

## Missing API key behavior

If `ANTHROPIC_API_KEY` is unset, the client still:

1. Connects to the MCP server
2. Lists and prints available tools
3. Prints a clear message about setting the key
4. Exits with code **0**

It does **not** throw before listing tools.

## Chat loop

With a valid API key:

1. Connect → list tools → map to Anthropic `{ name, description, input_schema }`
2. Enter queries at the `Query:` prompt
3. Claude may emit `tool_use` blocks; the client calls MCP `callTool` and returns `tool_result` blocks (with `tool_use_id`) until Claude replies with text only
4. Type `quit` to exit

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm start -- <server>` | Run the built client |

## License

MIT
