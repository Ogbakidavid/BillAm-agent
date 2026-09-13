# Strands Agent SDK: Tools Overview

## Introduction

Tools are the primary mechanism for extending agent capabilities, enabling them to perform actions beyond simple text generation. Tools allow agents to interact with external systems, access data, and manipulate their environment.

Strands Agents Tools is a community-driven project that provides a powerful set of tools for your agents to use. For more information, see **Strands Agents Tools**.

---

## Tool Security

All tools, whether custom, community-provided, or included in the Strands tools package, execute code on behalf of your agent with the permissions of the host process. Under the shared responsibility model, you should audit each tool's behavior (file access patterns, network calls, shell execution) and ensure it is appropriate for your deployment environment and threat model.

**Key Security Considerations**:

- Tools run with the full permissions of the host process
- File access is unrestricted unless explicitly sandboxed
- Network calls can reach any accessible endpoint
- Shell commands execute with host process privileges
- It is your responsibility to validate tool safety for your environment

See **Responsible AI** for more details on security and responsible tool usage.

---

## Adding Tools to Agents

Tools are passed to agents during initialization or at runtime, making them available for use throughout the agent's lifecycle. Once loaded, the agent can use these tools in response to user requests:

```typescript
const agent = new Agent({
  tools: [fileEditor],
})

// Agent will use the file_editor tool when appropriate
await agent.invoke('Show me the contents of a single file in this directory')
```

### Accessing Tools

In TypeScript, you can access the tools array directly:

```typescript
// Access all tools
console.log(agent.tools)
```

### Tool Loading Implications

When enabling automatic tool loading, any Python file placed in the `./tools/` directory will be executed by the agent. Under the shared responsibility model, **it is your responsibility to ensure that only safe, trusted code is written to the tool loading directory**, as the agent will automatically pick up and execute any tools found there.

---

## Using Tools

Tools can be invoked in two primary ways.

> **Note**: Agents have context about tool calls and their results as part of conversation history. See **Using State in Tools** for more information.

### Natural Language Invocation

The most common way agents use tools is through natural language requests. The agent determines when and how to invoke tools based on the user's input:

```typescript
const agent = new Agent({
  tools: [notebook],
})

// Agent decides when to use tools based on the request
await agent.invoke('Please read the default notebook')
```

The agent automatically:

1. Parses your request
2. Determines which tools are relevant
3. Invokes the appropriate tools
4. Incorporates results into its reasoning
5. Provides a response based on tool outputs

### Direct Method Calls

Tools can be invoked programmatically in addition to natural language invocation.

Every tool added to an agent is accessible as a method on `agent.tool`. Call `.invoke(input)` for the result, or `.stream(input)` to consume intermediate events:

```typescript
import { Agent } from '@strands-agents/sdk'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'

const agent = new Agent({
  tools: [notebook],
})

// Call a tool by name. Returns a ToolResultBlock with `status`
// ('success' | 'error') and `content` blocks.
const result = await agent.tool.notebook!.invoke({
  mode: 'read',
  name: 'default',
})
console.log(result.status, result.content)
```

#### Streaming Tool Results

Stream intermediate events; the generator returns the final result:

```typescript
for await (const event of agent.tool.notebook!.stream({
  mode: 'read',
  name: 'default',
})) {
  console.log('progress:', event)
}
```

#### Skipping History Recording

Skip recording the call in conversation history:

```typescript
await agent.tool.notebook!.invoke(
  { mode: 'read', name: 'default' },
  { recordDirectToolCall: false }
)
```

### Direct Call Details

- `agent.tool` (singular) is the direct-call accessor
- `agent.tools` (plural) is the array of registered tools
- The accessor resolves names by exact match first, then with underscores substituted for hyphens, then case-insensitively
  - `agent.tool.read_all` resolves to a tool registered as `read-all`
  - Calling a name that doesn't resolve throws `ToolNotFoundError`

### Recording Direct Calls

By default, direct calls are recorded in the agent's message history. Pass `{ recordDirectToolCall: false }` to skip recording.

**When to use `recordDirectToolCall: false`**:

- Required when calling tools during an active agent invocation (otherwise `ConcurrentInvocationError` is thrown)
- Useful for side-effect tools whose output should stay out of conversation context
- When you don't want the tool call affecting the agent's decision-making

---

## Tool Executors

When models return multiple tool requests, you can control whether they execute concurrently or sequentially. Both SDKs default to concurrent execution.

### Concurrent Execution (Default)

Tools run in parallel, maximizing throughput:

```typescript
import { Agent } from '@strands-agents/sdk'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'

// Concurrent execution (default)
const agent = new Agent({
  tools: [notebook, fileEditor],
})
await agent.invoke('List the notebooks and edit a file')
```

**Benefits**:
- Faster overall execution time
- Latency scales with slowest tool, not sum of all tools
- Ideal when tools are independent

### Sequential Execution

Tools run one at a time in the order specified:

```typescript
// Sequential execution for order-dependent tools
const sequentialAgent = new Agent({
  tools: [notebook, fileEditor],
  toolExecutor: 'sequential',
})
await sequentialAgent.invoke('Create a notebook entry, then edit a file based on it')
```

**When to use**:
- A later tool depends on output from an earlier tool
- Tool side effects must occur in a specific order
- Some tools have ordering constraints

For more details, see **Tool Executors** in the comprehensive guide.

---

## Building & Loading Tools

There are four primary ways to add tools to agents.

### 1. Custom Tools

Build your own tools using the Strands SDK's tool interfaces. Both Python and TypeScript support creating custom tools, though with different approaches.

#### Function-Based Tools

Use the `tool()` function to create tools with Zod schema validation or plain JSON Schema objects. These tools can then be passed directly to your agents.

```typescript
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

const weatherTool = tool({
  name: 'weather_forecast',
  description: 'Get weather forecast for a city',
  inputSchema: z.object({
    city: z.string().describe('The name of the city'),
    days: z.number().default(3).describe('Number of days for the forecast'),
  }),
  callback: (input) => {
    return `Weather forecast for ${input.city} for the next ${input.days} days...`
  },
})

const agent = new Agent({
  tools: [weatherTool],
})
```

**Benefits of function-based tools**:
- Type-safe with Zod schemas
- Simple and straightforward
- Easy to test in isolation
- Good for stateless operations

#### Module-Based Tools

Not supported in TypeScript.

For more details on building custom tools, see **Creating Custom Tools**.

### 2. Vended Tools

Pre-built tools are available in both Python and TypeScript to help you get started quickly.

**TypeScript vended tools** are included directly in the SDK. The **Community Tools Package** (`strands-agents-tools`) is Python-only.

```typescript
import { Agent } from '@strands-agents/sdk'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'
import { bash } from '@strands-agents/sdk/vended-tools/bash'
import { httpRequest } from '@strands-agents/sdk/vended-tools/http-request'

const agent = new Agent({
  tools: [notebook, fileEditor, bash, httpRequest],
})
```

**Available vended tools include**:

- **File Operations**: `fileEditor`, `file_read`, `file_write`
- **Shell & System**: `bash`, `shell`, `environment`
- **Web & Network**: `httpRequest`, `browser`
- **Code**: `python_repl`, `code_interpreter`
- **Data**: `notebook`
- **Utilities**: `sleep`, `stop`, `calculator`, `current_time`

See **Vended Tools** for the complete list and detailed documentation on each tool.

### 3. Model Context Protocol (MCP) Tools

The Model Context Protocol (MCP) provides a standardized way to expose and consume tools across different systems. This approach is ideal for creating reusable tool collections that can be shared across multiple agents or applications.

```typescript
import { Agent } from '@strands-agents/sdk'
import { McpClient } from '@strands-agents/sdk/mcp'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Create MCP client with stdio transport
const mcpClient = new McpClient({
  transport: new StdioClientTransport({
    command: 'uvx',
    args: ['awslabs.aws-documentation-mcp-server@latest'],
  }),
})

// Pass MCP client directly to agent
const agent = new Agent({
  tools: [mcpClient],
})

await agent.invoke('Calculate the square root of 144')
```

**MCP advantages**:
- Standardized tool interface
- Works across different systems and languages
- Easy to share and distribute
- Can be used with multiple agents
- Supports both local and remote tools

For more information on using MCP tools, see **MCP Tools**.

### 4. Agents as Tools

Agents can be passed directly in another agent's tools array — the SDK automatically converts them into tools. Use `.asTool()` when you need to customize the tool name, description, or context behavior.

```typescript
const researchAgent = new Agent({
  name: 'research_agent',
  description: 'A specialized research assistant.',
  systemPrompt: 'You are a specialized research assistant.',
  printer: false,
})

const orchestrator = new Agent({
  systemPrompt: 'You are an assistant that routes queries to specialized agents.',
  tools: [researchAgent],
})
```

**Benefits of agents as tools**:
- Reuse specialized agents in other contexts
- Build hierarchical agent systems
- Separate concerns across multiple agents
- Each agent can have its own model and configuration

For full details, see **Agents as Tools**.

---

## Tool Design Best Practices

### Effective Tool Descriptions

Language models rely heavily on tool descriptions to determine when and how to use them. Well-crafted descriptions significantly improve tool usage accuracy.

#### What Makes a Good Tool Description

A good tool description should:

1. **Clearly explain** the tool's purpose and functionality
2. **Specify when** the tool should be used
3. **Detail the parameters** it accepts and their formats
4. **Describe the expected** output format
5. **Note any limitations** or constraints
6. **Provide examples** when helpful

#### Example of a Well-Described Tool

```typescript
const searchDatabaseTool = tool({
  name: 'search_database',
  description: `Search the product database for items matching the query string.

Use this tool when you need to find detailed product information based on keywords,
product names, or categories. The search is case-insensitive and supports fuzzy
matching to handle typos and variations in search terms.

This tool connects to the enterprise product catalog database and performs a semantic
search across all product fields, providing comprehensive results with all available
product metadata.

Example response:
[
  {
    "id": "P12345",
    "name": "Ultra Comfort Running Shoes",
    "description": "Lightweight running shoes with...",
    "price": 89.99,
    "category": ["Footwear", "Athletic", "Running"]
  }
]

Notes:
- This tool only searches the product catalog and does not provide inventory or availability information
- Results are cached for 15 minutes to improve performance
- The search index updates every 6 hours, so very recent products may not appear
- For real-time inventory status, use a separate inventory check tool`,
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'The search string (product name, category, or keywords). Example: "red running shoes"'
      ),
    maxResults: z
      .number()
      .default(10)
      .describe('Maximum number of results to return (default: 10, range: 1-100)'),
  }),
  callback: async (input) => {
    // Implementation would go here
    return []
  },
})
```

### Key Description Elements

#### Purpose and Context

Start with a one-sentence summary, then expand on when to use the tool:

```typescript
description: `Fetch real-time weather data for a specified location.

Use this tool when you need current weather information, forecasts, or conditions.
Do NOT use for historical weather data (use weather_history tool instead).`
```

#### Parameter Details

Document each parameter in the schema description:

```typescript
inputSchema: z.object({
  city: z
    .string()
    .describe('City name (e.g., "San Francisco"). Can be abbreviated (e.g., "SF").'),
  units: z
    .enum(['celsius', 'fahrenheit'])
    .default('celsius')
    .describe('Temperature units. Default: celsius.'),
  includeAlerts: z
    .boolean()
    .default(false)
    .describe('Include weather alerts if available. Adds ~500ms to response time.'),
})
```

#### Output Format

Describe what the tool returns:

```typescript
description: `...
Returns:
{
  "temperature": number,
  "condition": "sunny" | "rainy" | "cloudy" | "snowy",
  "humidity": number (0-100),
  "forecast": { date, high, low, condition }[]
}
...`
```

#### Limitations and Constraints

Be explicit about what the tool can't do:

```typescript
description: `...
Limitations:
- Historical data is limited to 30 days
- Forecast accuracy decreases beyond 10 days
- Some remote locations may not have data
- Updates occur every 30 minutes
...`
```

### Avoiding Common Mistakes

#### ❌ Too Vague

```typescript
description: 'Search for things' // Bad - too vague
```

#### ✅ Clear and Specific

```typescript
description: `Search the customer database for people matching the query.
Returns full customer records including ID, name, email, and account status.`
```

#### ❌ Overlapping Tools

```typescript
// Bad - tool descriptions are too similar
search_documents: 'Search through documents'
search_files: 'Search through files'
```

#### ✅ Distinct Tool Descriptions

```typescript
search_documents: 'Full-text search across indexed documents in the knowledge base. Returns snippets with relevance scores.'
search_files: 'File system search by name pattern. Returns file paths and metadata. Does not search file contents.'
```

#### ❌ Missing Examples

```typescript
description: 'Convert units' // Unclear what units are supported
```

#### ✅ With Examples

```typescript
description: `Convert between different units of measurement.
Examples:
- 5 miles to kilometers → 8.05 km
- 100 fahrenheit to celsius → 37.78°C
- 2 pounds to grams → 907.18 g`
```

### Performance Considerations

#### Tool Output Verbosity

Keep tool outputs concise. Return only what's necessary:

```typescript
// Bad - returns too much detail
callback: async (query) => {
  const results = await database.search(query)
  return JSON.stringify(results) // Could be massive
}

// Good - summarizes results
callback: async (query) => {
  const results = await database.search(query)
  return results.slice(0, 5).map(r => `${r.id}: ${r.title}`)
}
```

#### Context Window Management

Consider using ContextOffloader plugin for large results. See **Context Offloader** for details.

#### Execution Speed

Monitor tool execution time. Slow tools should mention timeout expectations:

```typescript
description: `...
Note: This tool may take 10-30 seconds depending on data volume.
Consider using pagination for large queries.`
```

### Tool Organization

When building multiple related tools:

1. **Group by domain**: Keep related tools together
2. **Use consistent naming**: Prefix related tools with a common name
3. **Document relationships**: Explain how tools work together
4. **Avoid redundancy**: Don't create duplicate tools with slightly different behavior

```typescript
// Good - clear naming convention
const tools = [
  search_articles,      // Find articles
  read_article,         // Get full article content
  search_comments,      // Find comments on articles
  read_comment,         // Get full comment content
]
```

---

## See Also

- [Custom Tools](./custom-tools) — Building your own tools
- [Vended Tools](./strands-tools-overview.md#part-2-vended-tools) — Pre-built tools included in the SDK
- [Community Tools](./strands-tools-overview.md#part-3-community-built-tools) — Extended tool library
- [Tool Executors](./strands-tools-overview.md#part-1-tool-executors) — Concurrent vs sequential execution
- [Agents as Tools](./agents-as-tools) — Using agents as tools
- [MCP Tools](./mcp-tools) — Model Context Protocol integration
- [Hooks](./strands-hooks-guide.md) — Intercept and customize tool execution
- [Context Offloader](./strands-plugins-guide.md#part-3-context-offloader) — Manage large tool results
