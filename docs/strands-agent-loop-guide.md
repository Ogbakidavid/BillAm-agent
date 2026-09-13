# Strands Agent SDK: Agent Loop Guide

## Overview

A language model can answer questions. An agent can do things. The agent loop is what makes that difference possible.

When a model receives a request it cannot fully address with its training alone, it needs to reach out into the world: read files, query databases, call APIs, execute code. The agent loop is the orchestration layer that enables this. It manages the cycle of reasoning and action that allows a model to tackle problems requiring multiple steps, external information, or real-world side effects.

### The Agent Loop is Foundational

The agent loop is the foundational concept in the Strands Agents SDK, installed as `strands-agents` on PyPI and `@strands-agents/sdk` on npm. Everything else builds on top of it. The loop ships with the controls a production agent needs:

- **Invocation limits** cap the turns and tokens one call may use
- **Cancellation** stops a running agent mid-loop
- **Stop reasons** report why the loop ended
- **Concurrent invocation guards** prevent overlapping calls on one agent instance
- **Hooks** intercept any step, and **retry strategies** recover from model and tool errors

---

## How the Loop Works

The agent loop operates on a simple principle: invoke the model, check if it wants to use a tool, execute the tool if so, then invoke the model again with the result. Repeat until the model produces a final response.

### Loop Cycle

```
Input & Context
    ↓
Reasoning (LLM)
    ↓
Tool Selection
    ↓
Tool Execution
    ↓
Response
    ↓
(Repeat if needed)
```

The diagram shows the recursive structure at the heart of the loop. The model reasons, selects a tool, the tool executes, and the result feeds back into the model for another round of reasoning. This cycle continues until the model decides it has enough information to respond.

### Power Through Accumulated Context

What makes this powerful is the accumulation of context. Each iteration through the loop adds to the conversation history. The model sees not just the original request, but every tool it has called and every result it has received. This accumulated context enables sophisticated multi-step reasoning.

---

## A Concrete Example

Consider a request to analyze a codebase for security vulnerabilities. This is not something a model can do from memory. It requires an agent that can read files, search code, and synthesize findings. The agent loop handles this through successive iterations:

### Turn 1: Understand the Structure

The model receives the request to analyze a codebase. It first needs to understand the structure. It requests a file listing tool with the repository root as input.

**Model output**: "I'll help analyze your codebase for security vulnerabilities. Let me start by understanding the repository structure."

### Turn 2: Examine Entry Point

The model now sees the directory structure in its context. It identifies the main application entry point and requests the file reader tool to examine it.

**Tool call**: `read_file('./src/main.js')`

### Turn 3: Identify Database Module

The model sees the application code. It notices database queries and decides to examine the database module for potential SQL injection. It requests the file reader again.

**Tool call**: `read_file('./src/db.js')`

### Turn 4: Search for Vulnerable Call Sites

The model sees the database module and identifies a vulnerability: user input concatenated directly into SQL queries. To assess the scope, it requests a code search tool to find all call sites of the vulnerable function.

**Tool call**: `search_code('executeQuery')`

### Turn 5: Generate Report

The model sees 12 call sites in the search results. It now has everything it needs. Rather than requesting another tool, it produces a terminal response: a report detailing the vulnerability, affected locations, and remediation steps.

**Model output**: "I found a critical SQL injection vulnerability in your database module..."

### The Pattern

Each iteration followed the same pattern. The model received context, decided whether to act or respond, and either continued the loop or exited it. The key insight is that the model made these decisions autonomously based on its evolving understanding of the task.

---

## Messages and Conversation History

Messages flow through the agent loop with two roles: user and assistant. Each message contains content that can take different forms.

### User Messages

User messages contain the initial request and any follow-up instructions. User message content can include:

- Text input from the user
- Tool results from previous tool executions
- Media such as files, images, audio, or video

### Assistant Messages

Assistant messages are the model's outputs. Assistant message content can include:

- Text responses for the user
- Tool use requests for the execution system
- Reasoning traces (when supported by the model)

### Conversation History as Working Memory

The conversation history accumulates all three message types across loop iterations. This history is the model's working memory for the task. The conversation manager applies strategies to keep this history within the model's context window while preserving the most relevant information. See **Conversation Management** for details on available strategies.

---

## Tool Execution

When the model requests a tool, the execution system:

1. **Validates** the request against the tool's schema
2. **Locates** the tool in the registry
3. **Executes** it with error handling
4. **Formats** the result as a tool result message

### Error Handling

The execution system captures both successful results and failures. When a tool fails, the error information goes back to the model as an error result rather than throwing an exception that terminates the loop. This gives the model an opportunity to recover or try alternatives.

```typescript
const myTool = tool({
  name: 'fetch_data',
  description: 'Fetch data from an API',
  inputSchema: z.object({ url: z.string() }),
  callback: async (input) => {
    try {
      const response = await fetch(input.url)
      return await response.json()
    } catch (error) {
      throw new Error(`Failed to fetch: ${error.message}`)
    }
  },
})
```

When this tool throws an error, the agent receives it as an error result and can attempt recovery.

---

## Loop Lifecycle

The agent loop has well-defined entry and exit points. Understanding these helps predict agent behavior and handle edge cases.

### Starting the Loop

When an agent receives a request, it:

1. Registers tools
2. Sets up the conversation manager
3. Prepares metrics collection
4. Converts the user's input into the first message in the conversation history
5. Begins its first iteration

### Stop Reasons

Each model invocation ends with a stop reason that determines what happens next:

| Stop Reason | Meaning | Recovery |
|-------------|---------|----------|
| `end turn` | The model has finished its response and has no further actions to take. This is the normal successful termination. | Loop exits and returns the model's final message |
| `tool use` | The model wants to execute one or more tools before continuing. | Loop executes the requested tools and invokes the model again |
| `cancelled` | The agent was stopped externally via `agent.cancel()`. | See **Cancellation** below |
| `limitTurns` | The per-invocation turn budget was exhausted. | See **Invocation Limits** |
| `limitTotalTokens` | The cumulative token budget was exhausted. | See **Invocation Limits** |
| `limitOutputTokens` | The output token budget was exhausted. | See **Invocation Limits** |
| `max tokens` | The model's response was truncated because it hit the token limit. This is unrecoverable within the current loop. | Terminate with error; reinvoke with higher limit |
| `stop sequence` | The model encountered a configured stop sequence. | Like end turn, terminates normally |
| `content filtered` | The response was blocked by safety mechanisms. | Handle according to application requirements |
| `guardrail intervention` | A guardrail policy stopped generation. | Handle according to application requirements |

### Limit Stop Reasons

The limit stop reasons (`limitTurns`, `limitTotalTokens`, `limitOutputTokens`) indicate graceful budget exhaustion. The agent's message history remains in a valid state, and you can reinvoke with a higher budget or different prompt.

Both `content filtered` and `guardrail intervention` terminate the loop and should be handled according to application requirements.

### Extending the Loop

The agent emits lifecycle events at key points:

- Before and after each invocation
- Before and after each model call
- Before and after each tool execution

These events enable observation, metrics collection, and behavior modification without changing the core loop logic. See **Hooks** for details on subscribing to these events.

---

## Cancellation

The `agent.cancel()` method provides a way to stop the loop from outside, such as on a client disconnect, a timeout, or a UI "Stop" button. Calling `cancel()` sets an internal signal that the agent checks at key checkpoints. The cancel signal clears automatically when the invocation completes, so the agent is immediately reusable.

### Cancellation Checkpoints

The agent checks for cancellation at four checkpoints:

| Checkpoint | Behavior | Note |
|-----------|----------|------|
| Top of each loop cycle | Agent stops before the next model invocation | Cleanest cancellation point |
| During model response streaming | Partial output is discarded | Usage metrics may be inaccurate since the stream is closed before the model sends its final metadata event |
| Before tool execution | All pending tool calls are skipped with error results | |
| Between sequential tool executions | Remaining tool calls are skipped with error results | |

### Basic Cancellation

```typescript
const agent = new Agent()

// Cancel after 30 seconds
setTimeout(() => agent.cancel(), 30_000)

const result = await agent.invoke('Analyze this large dataset')

if (result.stopReason === 'cancelled') {
  console.log('Agent was cancelled due to timeout')
}
```

`cancel()` is idempotent — calling it multiple times is safe.

### External Cancellation Signals

You can also pass your own `AbortSignal` into `invoke()` or `stream()` via the `cancelSignal` option. The agent composes it with its internal controller using `AbortSignal.any()`, so both `agent.cancel()` and the external signal can trigger cancellation independently. This is useful for declarative timeouts, custom `AbortController` workflows, or framework-driven cancellation on client disconnect.

#### Timeout-based Cancellation

```typescript
const timedResult = await agent.invoke('Analyze this large dataset', {
  cancelSignal: AbortSignal.timeout(5000),
})
```

#### Custom AbortController

```typescript
const controller = new AbortController()
const controllerResult = await agent.invoke('Hello', {
  cancelSignal: controller.signal,
})

// Call controller.abort() from anywhere to cancel
setTimeout(() => controller.abort(), 10_000)
```

### Cancellation Within Tool Execution

The SDK automatically checks for cancellation before and between tool calls (see checkpoints above). Once a tool callback is running, cancellation is cooperative: only the tool itself can respond mid-execution.

Tools can participate by:

1. **Forwarding the cancel signal** to APIs that accept `AbortSignal`
2. **Polling** `context.cancelSignal.aborted` between steps

If a tool does neither, it runs to completion, and the agent resumes cancellation handling after the tool returns.

```typescript
const myTool = tool({
  name: 'long_running_task',
  description: 'A task that respects cancellation',
  inputSchema: z.object({ url: z.string() }),
  callback: async (input, context) => {
    // Forward the cancel signal to APIs that accept AbortSignal
    const response = await fetch(input.url, {
      signal: context?.cancelSignal,
    })
    return response.text()
  },
})
```

---

## Invocation Limits

To cap how much work an agent does in a single invocation, pass a `limits` object. You can bound turns (loop iterations), output tokens, or total tokens. All three are optional.

### Configuration

```typescript
const agent = new Agent()

const result = await agent.invoke('Summarize this document', {
  limits: {
    turns: 5,
    outputTokens: 2000,
    totalTokens: 10000,
  },
})

if (result.stopReason === 'limitTurns') {
  console.log('Hit turn budget')
} else if (result.stopReason === 'limitTotalTokens') {
  console.log('Hit token budget')
}
```

The same option works with `stream()`. Each cap must be a positive finite number.

### How Limits Work

- **Checked at top of iteration**: Limits are checked at the top of each loop iteration, not mid-call
- **Overshoot allowed**: A single turn can overshoot the token budget, but the check fires before the next turn starts
- **Tools complete**: Tools requested by the previous turn always run to completion before the limit check fires
- **Valid state**: The agent's message history stays in a valid, reinvokable state
- **Fresh counters**: Limits apply to the current invocation only. A reused agent starts each call with fresh counters

### Priority Order

When multiple caps trip simultaneously, the reported stop reason follows priority order:

1. `limitTurns`
2. `limitTotalTokens`
3. `limitOutputTokens`

### Use Cases

Limits are useful for:

- **Cost control**: Cap token consumption to manage API costs
- **Latency control**: Cap turns to ensure predictable response times
- **Resource management**: Prevent runaway agents from consuming unlimited resources
- **Testing**: Constrain agent behavior for reproducible testing

---

## Concurrent Invocations

Sometimes more than one request targets the same agent instance at once: a retried API call, a double-submitted form, two web requests that happen to share an agent.

### TypeScript Behavior

TypeScript rejects overlapping invocations: invoking an agent that is already running throws `ConcurrentInvocationError`. It does not offer:

- Configurable concurrency mode
- Idempotency-token deduplication of retries

Both features are available only in the Python SDK.

### Best Practice: Create an Agent per Request

The recommended pattern is to create one agent per request:

```typescript
// Good: One agent per request
app.post('/analyze', async (req, res) => {
  const agent = new Agent({
    tools: [/* ... */],
  })
  const result = await agent.invoke(req.body.query)
  res.json(result)
})
```

Agent construction is cheap: it wires up tools, hooks, and plugins locally and makes no model call.

### Sharing Model Providers

Reuse model providers, not agents:

```typescript
// Reuse the model provider
const model = new BedrockModel({ modelId: 'claude-3-sonnet' })

app.post('/analyze', async (req, res) => {
  // Create a fresh agent per request
  const agent = new Agent({
    model,
    tools: [/* ... */],
  })
  const result = await agent.invoke(req.body.query)
  res.json(result)
})
```

Model providers build their client in the constructor, so create the provider once per process and pass the same instance to every agent.

---

## Common Problems

### Context Window Exhaustion

Each loop iteration adds messages to the conversation history. For complex tasks requiring many tool calls, this history can exceed the model's context window. When this happens, the agent cannot continue.

**Symptoms**:

- Errors from the model provider about input length
- Degraded model performance as the context fills with less relevant earlier messages

**Solutions**:

1. **Reduce tool output verbosity**: Return summaries or relevant excerpts rather than complete data

```typescript
const searchResults = await searchDatabase(query)
// Return only top 3 results instead of all 100
return searchResults.slice(0, 3).map(r => ({ id: r.id, summary: r.summary }))
```

2. **Simplify tool schemas**: Deeply nested schemas consume tokens in both the tool configuration and the model's reasoning

```typescript
// Before: Deeply nested
inputSchema: z.object({
  filters: z.object({
    advanced: z.object({
      temporalOptions: z.object({
        /* ... */
      })
    })
  })
})

// After: Flattened
inputSchema: z.object({
  temporalFilter: z.string(),
  // ... other fields
})
```

3. **Configure a conversation manager**: Use appropriate strategies to maintain coherence

See **Conversation Management** for available options.

4. **Decompose large tasks**: Break them into subtasks, each handled with fresh context

```typescript
const result1 = await researchAgent.invoke('Research topic X')
const result2 = await synthesisAgent.invoke(`Based on this research: ${result1}...`)
```

### Inappropriate Tool Selection

When the model consistently picks the wrong tool, the problem is usually ambiguous tool descriptions. Review the descriptions from the model's perspective. If two tools have overlapping descriptions, the model has no basis for choosing between them.

**Example of unclear descriptions**:

```typescript
// Bad: Too similar
tool({
  name: 'search_documents',
  description: 'Search through documents',
  // ...
})

tool({
  name: 'search_files',
  description: 'Search through files',
  // ...
})

// Good: Clear distinction
tool({
  name: 'search_documents',
  description: 'Full-text search across indexed documents in the knowledge base. Returns snippets with relevance scores.',
  // ...
})

tool({
  name: 'search_files',
  description: 'File system search by name pattern. Returns file paths and metadata. Does not search file contents.',
  // ...
})
```

See **Tools Overview** for guidance on writing effective descriptions.

### MaxTokensReachedException

When the model's response exceeds the configured token limit, the loop raises a `MaxTokensReachedException`. This typically occurs when:

- The model attempts to generate an unusually long response
- The context window is nearly full, leaving insufficient space for the response
- Tool results push the conversation close to the token limit

**Solutions**:

1. Reduce context size by using conversation management strategies
2. Increase the token limit
3. Break the task into smaller steps
4. Simplify tool outputs

---

## Advanced Patterns

### Custom Stop Condition via Hooks

Use hooks to implement custom stop conditions:

```typescript
const agent = new Agent({ tools: [/* ... */] })

let iterationCount = 0
agent.addHook(BeforeInvocationEvent, () => {
  iterationCount = 0
})

agent.addHook(AfterToolCallEvent, (event) => {
  iterationCount++
  if (iterationCount >= 3) {
    event.cancel = 'Reached iteration limit'
  }
})
```

### Monitoring Token Usage

Track token consumption across invocations:

```typescript
let totalTokensUsed = 0

const result = await agent.invoke('Analyze this dataset')

totalTokensUsed += result.usage?.totalTokens || 0
console.log(`Total tokens used: ${totalTokensUsed}`)
```

### Fallback on Cancellation

Handle cancellation gracefully with a fallback:

```typescript
try {
  const result = await agent.invoke(query, {
    cancelSignal: AbortSignal.timeout(5000),
  })
  return result.messages
} catch (error) {
  if (error instanceof CancellationError) {
    console.log('Agent timed out, using fallback response')
    return getFallbackResponse(query)
  }
  throw error
}
```

---

## What Comes Next

The agent loop is the execution primitive. Higher-level patterns build on top of it:

- **Conversation Management** strategies that maintain coherent long-running interactions
- **Hooks** for observing, modifying, and extending agent behavior
- **Multi-agent architectures** where agents coordinate through shared tools or message passing
- **Evaluation frameworks** that assess agent performance on complex tasks

Understanding the loop deeply makes these advanced patterns more approachable. The same principles apply at every level: clear tool contracts, accumulated context, and autonomous decision-making within defined boundaries.

---

## Further Resources

- [Hooks Guide](./strands-hooks-guide.md) - Observe and extend agent behavior
- [Conversation Management](./conversation-management-guide.md) - Maintain context across long interactions
- [Tools Guide](./tools-guide.md) - Create effective tools for agents
- [Multi-Agent Systems](./multi-agent-guide.md) - Orchestrate multiple agents
- [Session Management](./strands-session-management-guide.md) - Persist agent state
