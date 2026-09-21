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

## Authentication

The client uses the Anthropic TypeScript SDK's **default credential resolution** (`new Anthropic()` with no explicit `apiKey`):

1. `ANTHROPIC_API_KEY` (env or `.env` via dotenv)
2. `ANTHROPIC_AUTH_TOKEN`
3. An active [`ant auth login`](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication) profile

**Preferred (local / no pasted key):**

```bash
ant auth login
ant auth status   # diagnose which credential source / profile is active
```

**Optional alternatives:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export ANTHROPIC_AUTH_TOKEN=...
# or copy .env.example → .env and set ANTHROPIC_API_KEY there
```

**Warnings:**

- Do **not** paste API keys into the chat prompt — use env, `.env`, or `ant auth login`.
- A stale exported `ANTHROPIC_API_KEY` **overrides** `ant auth` profiles. Unset it (`unset ANTHROPIC_API_KEY`) before relying on a profile. An empty `ANTHROPIC_API_KEY=""` still wins over profiles.

If the first Claude call fails with 401 / `AuthenticationError`, the client prints these setup steps again.

## Setup

```bash
npm install
# Optional: only if you are not using `ant auth login`
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-... if needed
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

## Auth failure behavior

After connecting and listing tools, the client **always** enters the chat loop (it does not exit just because `ANTHROPIC_API_KEY` is unset — the SDK may still have a token or `ant auth` profile).

On the first Anthropic auth failure (401 / `AuthenticationError`), it prints clear instructions for `ant auth login`, env keys, `.env`, and `ant auth status`.

## Chat loop

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
