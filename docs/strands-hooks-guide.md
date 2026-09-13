# Strands Agent SDK: Hooks System Guide

## Overview

The hooks system is a composable, type-safe system that supports multiple subscribers per event type. Hooks enable you to add logging, validation, guardrails, or custom logic at any point in the agent loop.

**Hook Event**: A specific event in the lifecycle that callbacks can be associated with.
**Hook Callback**: A callback function that is invoked when the hook event is emitted.

### Hooks Enable Use Cases

- Monitoring agent execution and tool usage
- Modifying tool execution behavior
- Adding validation and error handling
- Monitoring multi-agent execution flow and node transitions
- Debugging complex orchestration patterns
- Implementing custom logging and metrics collection

---

## Basic Usage

Hook callbacks are registered against specific event types and receive strongly-typed event objects when those events occur during agent execution. Each event carries relevant data for that stage of the agent lifecycle.

### Registering Individual Hook Callbacks

The simplest way to register a hook callback is using the `agent.addHook()` method:

```typescript
const agent = new Agent()

// Register individual callback
const myCallback = (event: BeforeInvocationEvent) => {
  console.log('Custom callback triggered')
}

agent.addHook(BeforeInvocationEvent, myCallback)
```

### Multi-Agent Orchestrators

For multi-agent orchestrators, you can register callbacks for orchestration events:

```typescript
const researcher = new Agent({
  id: 'researcher',
  systemPrompt: 'You are a research specialist.',
})
const writer = new Agent({
  id: 'writer',
  systemPrompt: 'You are a writing specialist.',
})

const graph = new Graph({
  nodes: [researcher, writer],
  edges: [['researcher', 'writer']],
})

// Register individual callbacks on the orchestrator
graph.addHook(BeforeNodeCallEvent, (event) => {
  console.log(`Node ${event.nodeId} starting`)
})

graph.addHook(AfterNodeCallEvent, (event) => {
  console.log(`Node ${event.nodeId} completed`)
})
```

### Using Plugins for Multiple Hooks

For packaging multiple related hooks together, Plugins provide a convenient way to bundle hooks with configuration and tools:

```typescript
class LoggingPlugin implements Plugin {
  name = 'logging-plugin'

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeToolCallEvent, (event) => {
      console.log(`Calling: ${event.toolUse.name}`)
    })

    agent.addHook(AfterToolCallEvent, (event) => {
      console.log(`Completed: ${event.toolUse.name}`)
    })
  }
}

const agent = new Agent({ plugins: [new LoggingPlugin()] })
```

---

## Hook Event Lifecycle

### Single-Agent Lifecycle

The following diagram shows when hook events are emitted during a typical agent invocation where tools are invoked:

```
Request Start Events
├── BeforeInvocationEvent
└── MessageAddedEvent

Model Events
├── BeforeModelCallEvent
├── ModelStreamUpdateEvent
├── ContentBlockEvent
├── ModelMessageEvent
├── AfterModelCallEvent
└── MessageAddedEvent

Tool Events
├── BeforeToolsEvent
├── BeforeToolCallEvent
├── ToolStreamUpdateEvent
├── ToolResultEvent
├── AfterToolCallEvent
└── AfterToolsEvent
└── MessageAddedEvent

Request End Events
├── AgentResultEvent
├── AfterInvocationEvent
└── InterruptEvent
```

### Multi-Agent Lifecycle

The following diagram shows when multi-agent hook events are emitted during orchestrator execution:

```
Initialization
└── MultiAgentInitializedEvent

Invocation Lifecycle
├── BeforeMultiAgentInvocationEvent
│
├── Node Execution (Repeated)
│  ├── BeforeNodeCallEvent
│  ├── NodeStreamUpdateEvent
│  ├── AfterNodeCallEvent
│  └── NodeResultEvent
│
├── MultiAgentHandoffEvent
├── AfterMultiAgentInvocationEvent
└── MultiAgentResultEvent
```

---

## Available Events

All events extend `HookableEvent`, making them both streamable via `agent.stream()` and subscribable via hook callbacks.

| Event | Description |
|-------|-------------|
| `AgentInitializedEvent` | Triggered when an agent has been constructed and finished initialization at the end of the agent constructor. |
| `BeforeInvocationEvent` | Triggered at the beginning of a new agent invocation request |
| `AfterInvocationEvent` | Triggered at the end of an agent request, regardless of success or failure. Uses reverse callback ordering |
| `MessageAddedEvent` | Triggered when a message is added to the agent's conversation history |
| `BeforeModelCallEvent` | Triggered before the model is invoked for inference |
| `AfterModelCallEvent` | Triggered after model invocation completes. Uses reverse callback ordering |
| `ModelStreamUpdateEvent` | Wraps each transient streaming delta from the model during inference. Access via `.event` |
| `ContentBlockEvent` | Wraps a fully assembled content block (TextBlock, ToolUseBlock, ReasoningBlock). Access via `.contentBlock` |
| `ModelMessageEvent` | Wraps the complete model message after all blocks are assembled. Access via `.message` |
| `BeforeToolCallEvent` | Triggered before a tool is invoked |
| `AfterToolCallEvent` | Triggered after tool invocation completes. Uses reverse callback ordering |
| `BeforeToolsEvent` | Triggered before tools are executed in a batch |
| `AfterToolsEvent` | Triggered after tools are executed in a batch. Uses reverse callback ordering |
| `ToolStreamUpdateEvent` | Wraps streaming progress events from tool execution. Access via `.event` |
| `ToolResultEvent` | Wraps a completed tool result. Access via `.result` |
| `AgentResultEvent` | Wraps the final agent result at the end of the invocation. Access via `.result` |
| `InterruptEvent` | Fires once per unanswered interrupt when the agent halts to wait for responses. Access via `.interrupt` |
| `MultiAgentInitializedEvent` | Triggered when a multi-agent orchestrator has finished initialization |
| `BeforeMultiAgentInvocationEvent` | Triggered before orchestrator execution starts |
| `AfterMultiAgentInvocationEvent` | Triggered after orchestrator execution completes. Uses reverse callback ordering |
| `BeforeNodeCallEvent` | Triggered before individual node execution starts |
| `NodeStreamUpdateEvent` | Wraps an inner streaming event from a node with the node's identity. Access via `.event` |
| `NodeCancelEvent` | Triggered when a node is cancelled via `BeforeNodeCallEvent.cancel` |
| `AfterNodeCallEvent` | Triggered after individual node execution completes. Uses reverse callback ordering |
| `NodeResultEvent` | Wraps a completed node result. Access via `.result` |
| `MultiAgentHandoffEvent` | Triggered when execution transitions between nodes |
| `MultiAgentResultEvent` | Wraps the final multi-agent result at the end of orchestration. Access via `.result` |

---

## Hook Behaviors

### Event Properties

Most event properties are read-only to prevent unintended modifications. However, certain properties can be modified to influence agent behavior:

#### BeforeInvocationEvent
- `cancel` - Cancel the agent invocation with a message.

#### BeforeModelCallEvent
- `cancel` - Cancel the model call with a message.

#### BeforeToolsEvent
- `cancel` - Cancel all tool calls in a batch with a message.

#### BeforeToolCallEvent
- `cancel` - Cancel tool execution with a message.
- `selectedTool` - Replace the tool to be executed with a different Tool instance.
- `toolUse` - Mutable. Rewrite name, toolUseId, or input before execution. Renaming name re-resolves the tool from the registry when selectedTool is not set.

#### AfterModelCallEvent
- `retry` - Request a retry of the model invocation.

#### AfterToolCallEvent
- `retry` - Request a retry of the tool invocation.
- `result` - Mutable. Rewrite the ToolResultBlock before it propagates to the model.

#### AfterToolsEvent
- `endTurn` - Halt the agent loop after the tool batch without calling the model again. Set true for a default final assistant message, a string to use as the final assistant message, or a list of content blocks to use as the final assistant message content directly. The returned result has stopReason="endTurn".

#### AfterInvocationEvent
- `resume` - Trigger a follow-up agent invocation with new input.

### Callback Ordering

By default, After event callbacks run in reverse registration order for cleanup symmetry. You can override this with explicit priority using the `order` option — lower values run first.

The SDK exports convenience presets that mark where the SDK's own hooks run:

- `HookOrder.SDK_FIRST (-100)` — where the SDK's earliest hooks run
- `HookOrder.DEFAULT (0)` — implicit when no order is specified
- `HookOrder.SDK_LAST (100)` — where the SDK's latest hooks run

```typescript
import { Agent, HookOrder, BeforeToolCallEvent } from '@strands-agents/sdk'

const agent = new Agent()

agent.addHook(BeforeToolCallEvent, (event) => {
  console.log('[logging] Tool called:', event.toolUse.name)
}) // HookOrder.DEFAULT (0)

// Run before the SDK's earliest hooks
agent.addHook(
  BeforeToolCallEvent,
  (event) => {
    console.log('[guardrail] Runs before SDK hooks')
  },
  { order: HookOrder.SDK_FIRST - 1 }
)

// Arbitrary numbers for fine-grained control
agent.addHook(
  BeforeToolCallEvent,
  (event) => {
    console.log('[validation] Validating input')
  },
  { order: -50 }
)

// Use -Infinity/Infinity for guaranteed absolute first/last
agent.addHook(
  BeforeToolCallEvent,
  (event) => {
    console.log('[absolute] Always runs first, no matter what')
  },
  { order: -Infinity }
)
```

Within the same order group, Before events preserve registration order and After events reverse it.

---

## Advanced Usage

### Accessing Invocation State in Hooks

Invocation state provides configuration and context data passed through the agent or orchestrator invocation. This is particularly useful for:

- Custom Objects: Access database client objects, connection pools, or other Python objects
- Request Context: Access session IDs, user information, settings, or request-specific data
- Multi-Agent Shared State: In multi-agent patterns, access state shared across all agents
- Custom Parameters: Pass any additional data that hooks might need

```typescript
const agent = new Agent()

agent.addHook(BeforeToolCallEvent, (event) => {
  // Read caller-provided context
  const userId = event.invocationState.userId as string | undefined
  const sessionId = event.invocationState.sessionId as string | undefined

  console.log(
    `User ${userId} (session ${sessionId}) ` + `invoking tool: ${event.toolUse.name}`
  )
})

// Pass invocation state when invoking the agent
const result = await agent.invoke('Process the data', {
  invocationState: {
    userId: 'user123',
    sessionId: 'sess456',
  },
})

// The same object is returned on the result
console.log(result.invocationState.userId) // 'user123'
```

Multi-agent hook events provide access to:

- `orchestrator`: The multi-agent orchestrator instance (for example: Graph/Swarm)
- `nodeId`: Identifier of the node being executed (for node-level events)
- `state`: The MultiAgentState for the current invocation, including an app field for custom consumer state

### Tool Interception

Modify or replace tools before execution:

```typescript
import {
  BeforeToolCallEvent,
  type LocalAgent,
  type Plugin,
  type FunctionTool,
} from '@strands-agents/sdk'

class ToolInterceptor implements Plugin {
  name = 'tool-interceptor'

  constructor(private readonly safeAlternative: FunctionTool) {}

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeToolCallEvent, (event) => this.interceptTool(event))
  }

  private interceptTool(event: BeforeToolCallEvent): void {
    if (event.toolUse.name !== 'sensitive_tool') return
    // Run a safer tool in place of the registry's match for this call.
    event.selectedTool = this.safeAlternative
    // Mirror the rename on toolUse so the model sees the substitution.
    event.toolUse.name = this.safeAlternative.name
  }
}
```

### Result Modification

Modify tool results after execution:

```typescript
import {
  AfterToolCallEvent,
  ToolResultBlock,
  TextBlock,
  type LocalAgent,
  type Plugin,
} from '@strands-agents/sdk'

class ResultProcessor implements Plugin {
  name = 'result-processor'

  initAgent(agent: LocalAgent): void {
    agent.addHook(AfterToolCallEvent, (event) => this.processResult(event))
  }

  private processResult(event: AfterToolCallEvent): void {
    if (event.toolUse.name !== 'calculator') return

    // Prefix calculator output before it propagates to the model.
    event.result = new ToolResultBlock({
      toolUseId: event.result.toolUseId,
      status: event.result.status,
      content: event.result.content.map((block) =>
        block.type === 'textBlock' ? new TextBlock(`Result: ${block.text}`) : block
      ),
      ...(event.result.error !== undefined ? { error: event.result.error } : {}),
    })
  }
}
```

### Conditional Node Execution

Implement custom logic to modify orchestration behavior in multi-agent systems:

```typescript
const researcher = new Agent({
  id: 'researcher',
  systemPrompt: 'You are a research specialist.',
})
const writer = new Agent({
  id: 'writer',
  systemPrompt: 'You are a writing specialist.',
})
const reviewer = new Agent({
  id: 'reviewer',
  systemPrompt: 'You are a review specialist.',
})

const graph = new Graph({
  nodes: [researcher, writer, reviewer],
  edges: [
    ['researcher', 'writer'],
    ['writer', 'reviewer'],
  ],
})

// Cancel specific nodes based on custom conditions
graph.addHook(BeforeNodeCallEvent, (event) => {
  if (event.nodeId === 'reviewer') {
    // Cancel with a custom message
    event.cancel = 'Skipping review for this run'
  }
})
```

---

## Best Practices

### Composability

Design hooks to be composable and reusable:

```typescript
class RequestLoggingHook implements Plugin {
  name = 'request-logging'

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeInvocationEvent, (ev) => this.logRequest(ev))
    agent.addHook(AfterInvocationEvent, (ev) => this.logResponse(ev))
    agent.addHook(BeforeToolCallEvent, (ev) => this.logToolUse(ev))
  }

  // ...
}
```

### Event Property Modifications

When modifying event properties, log the changes for debugging and audit purposes:

```typescript
import {
  AfterToolCallEvent,
  ToolResultBlock,
  TextBlock,
  type LocalAgent,
  type Plugin,
} from '@strands-agents/sdk'

class ResultProcessor implements Plugin {
  name = 'result-processor'

  initAgent(agent: LocalAgent): void {
    agent.addHook(AfterToolCallEvent, (event) => this.processResult(event))
  }

  private processResult(event: AfterToolCallEvent): void {
    if (event.toolUse.name !== 'calculator') return

    const original = event.result.content.find((block) => block.type === 'textBlock')
    if (original?.type !== 'textBlock') return

    // Log the change before mutating so the audit trail captures both states.
    console.log(`Modifying calculator result: ${original.text}`)
    event.result = new ToolResultBlock({
      toolUseId: event.result.toolUseId,
      status: event.result.status,
      content: event.result.content.map((block) =>
        block.type === 'textBlock' ? new TextBlock(`Result: ${block.text}`) : block
      ),
      ...(event.result.error !== undefined ? { error: event.result.error } : {}),
    })
  }
}
```

### Orchestrator-Agnostic Design

Design multi-agent hooks to work with different orchestrator types:

```typescript
class UniversalMultiAgentPlugin implements MultiAgentPlugin {
  readonly name = 'universal-multi-agent'

  initMultiAgent(orchestrator: MultiAgent): void {
    orchestrator.addHook(BeforeNodeCallEvent, (event) => {
      console.log(`Executing node ${event.nodeId} in ${orchestrator.id} orchestrator`)

      // Handle orchestrator-specific logic if needed
      if (orchestrator instanceof Graph) {
        this.handleGraphNode(event)
      } else if (orchestrator instanceof Swarm) {
        this.handleSwarmNode(event)
      }
    })
  }

  private handleGraphNode(event: BeforeNodeCallEvent): void {
    // Graph-specific handling
  }

  private handleSwarmNode(event: BeforeNodeCallEvent): void {
    // Swarm-specific handling
  }
}
```

### Integration with Multi-Agent Systems

Multi-agent hooks complement single-agent hooks. Individual agents within the orchestrator can still have their own hooks, creating a layered monitoring and customization system:

```typescript
// Agent-level hooks via plugins
class AgentLoggingPlugin implements Plugin {
  name = 'agent-logging'

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeToolCallEvent, (event) => {
      console.log(`Agent tool call: ${event.toolUse.name}`)
    })
  }
}

// Create agents with individual hooks
const agent1 = new Agent({ id: 'agent1', plugins: [new AgentLoggingPlugin()] })
const agent2 = new Agent({ id: 'agent2', plugins: [new AgentLoggingPlugin()] })

// Orchestrator-level hooks via MultiAgentPlugin
class OrchestratorLoggingPlugin implements MultiAgentPlugin {
  readonly name = 'orchestrator-logging'

  initMultiAgent(orchestrator: MultiAgent): void {
    orchestrator.addHook(BeforeNodeCallEvent, (event) => {
      console.log(`Orchestrator node execution: ${event.nodeId}`)
    })
  }
}

// Create orchestrator with multi-agent hooks
const graph = new Graph({
  nodes: [agent1, agent2],
  edges: [['agent1', 'agent2']],
  plugins: [new OrchestratorLoggingPlugin()],
})
```

This layered approach provides comprehensive observability and control across both individual agent execution and orchestrator-level coordination.

---

## Cookbook

### Fixed Tool Arguments

Useful for enforcing security policies, maintaining consistency, or overriding agent decisions with system-level requirements. This hook ensures specific tools always use predetermined parameter values regardless of what the agent specifies.

```typescript
class ConstantToolArguments implements Plugin {
  private fixedToolArguments: Record<string, Record<string, unknown>>

  /**
   * Initialize fixed parameter values for tools.
   *
   * @param fixedToolArguments - A dictionary mapping tool names to dictionaries of
   *     parameter names and their fixed values. These values will override any
   *     values provided by the agent when the tool is invoked.
   */
  constructor(fixedToolArguments: Record<string, Record<string, unknown>>) {
    this.fixedToolArguments = fixedToolArguments
  }

  name = 'constant-tool-arguments'

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeToolCallEvent, (ev) => this.fixToolArguments(ev))
  }

  private fixToolArguments(event: BeforeToolCallEvent): void {
    // If the tool is in our list of parameters, then use those parameters
    const parametersToFix = this.fixedToolArguments[event.toolUse.name]
    if (parametersToFix) {
      const toolInput = event.toolUse.input as Record<string, unknown>
      Object.assign(toolInput, parametersToFix)
    }
  }
}
```

**Example**: To always force the calculator tool to use precision of 1 digit:

```typescript
const fixParameters = new ConstantToolArguments({
  calculator: {
    precision: 1,
  },
})

const agent = new Agent({ tools: [calculator], plugins: [fixParameters] })
const result = await agent.invoke('What is 2 / 3?')
```

### Limit Tool Counts

Useful for preventing runaway tool usage, implementing rate limiting, or enforcing usage quotas. This hook tracks tool invocations per request and replaces tools with error messages when limits are exceeded.

```typescript
class LimitToolCounts implements Plugin {
  private maxToolCounts: Record<string, number>
  private toolCounts: Record<string, number> = {}

  /**
   * Initialize with maximum allowed invocations per tool.
   *
   * @param maxToolCounts - A dictionary mapping tool names to their maximum
   *     allowed invocation counts per agent invocation.
   */
  constructor(maxToolCounts: Record<string, number>) {
    this.maxToolCounts = maxToolCounts
  }

  name = 'limit-tool-counts'

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeInvocationEvent, () => this.resetCounts())
    agent.addHook(BeforeToolCallEvent, (event) => this.interceptTool(event))
  }

  private resetCounts(): void {
    this.toolCounts = {}
  }

  private interceptTool(event: BeforeToolCallEvent): void {
    const toolName = event.toolUse.name
    const maxToolCount = this.maxToolCounts[toolName]
    const toolCount = (this.toolCounts[toolName] ?? 0) + 1
    this.toolCounts[toolName] = toolCount

    if (maxToolCount !== undefined && toolCount > maxToolCount) {
      event.cancel =
        `Tool '${toolName}' has been invoked too many times and is now being throttled. ` +
        `DO NOT CALL THIS TOOL ANYMORE`
    }
  }
}
```

**Example**: To limit the sleep tool to 3 invocations per invocation:

```typescript
const limitPlugin = new LimitToolCounts({ sleep: 3 })

const agent = new Agent({ tools: [sleep], plugins: [limitPlugin] })

// This call will only have 3 successful sleeps
await agent.invoke("Sleep 5 times for 10ms each or until you can't anymore")
// This will sleep successfully again because the count resets every invocation
await agent.invoke('Sleep once')
```

### Model Call Retry

Useful for implementing custom retry logic for model invocations. The `AfterModelCallEvent.retry` field allows hooks to request retries based on any criteria—exceptions, response validation, content quality checks, or any custom logic.

```typescript
class RetryOnServiceUnavailable implements Plugin {
  name = 'retry-on-service-unavailable'

  constructor(private readonly maxRetries = 3) {}

  initAgent(agent: LocalAgent): void {
    agent.addHook(AfterModelCallEvent, (event) => this.handleRetry(event))
  }

  private handleRetry(event: AfterModelCallEvent): void {
    // `attemptCount` is 1-indexed and includes the attempt that just failed,
    // so no manual counter is needed to cap retries.
    if (
      event.error !== undefined &&
      event.error.message.includes('ServiceUnavailable') &&
      event.attemptCount <= this.maxRetries
    ) {
      event.retry = true
    }
  }
}
```

**Example**: To retry up to 3 times on service unavailable errors:

```typescript
const agent = new Agent({ plugins: [new RetryOnServiceUnavailable(3)] })

const result = await agent.invoke('What is the capital of France?')
```

### Tool Call Retry

Useful for implementing custom retry logic for tool invocations. The `AfterToolCallEvent.retry` field allows hooks to request that a tool be re-executed—for example, to handle transient errors, timeouts, or flaky external services.

When retry is set to true, the tool executor discards the current result and invokes the tool again with the same tool_use_id.

**Streaming behavior**: When a tool call is retried, intermediate streaming events (ToolStreamEvent) from discarded attempts will have already been emitted to callers. Only the final attempt's ToolResultEvent is emitted and added to conversation history. Callers consuming streamed events should be prepared to handle events from discarded attempts.

```typescript
class RetryOnToolError implements Plugin {
  name = 'retry-on-tool-error'

  private readonly attempts = new Map<string, number>()

  constructor(private readonly maxRetries = 1) {}

  initAgent(agent: LocalAgent): void {
    agent.addHook(AfterToolCallEvent, (event) => this.handleRetry(event))
  }

  private handleRetry(event: AfterToolCallEvent): void {
    const toolUseId = event.result.toolUseId
    const attempt = (this.attempts.get(toolUseId) ?? 0) + 1
    this.attempts.set(toolUseId, attempt)

    if (event.error !== undefined && attempt <= this.maxRetries) {
      event.retry = true
    } else if (event.error === undefined) {
      // Clean up tracking once the tool call finally succeeds.
      this.attempts.delete(toolUseId)
    }
  }
}
```

**Example**: To retry failed tool calls once:

```typescript
const agent = new Agent({ plugins: [new RetryOnToolError(1)] })

const result = await agent.invoke('Fetch the latest metrics')
```

### Invocation Resume

The `AfterInvocationEvent.resume` property enables a hook to trigger a follow-up agent invocation after the current one completes. When you set resume to any valid agent input (a string, content blocks, or messages), the agent automatically re-invokes itself with that input instead of returning to the caller. This starts a full new invocation cycle, including firing BeforeInvocationEvent.

This is useful for building autonomous looping patterns where the agent continues processing based on its previous result—for example, re-evaluating after tool execution, injecting additional context, or implementing multi-step workflows within a single call.

**Resume input types**: The resume value accepts any valid AgentInput: a string, a list of content blocks, a list of messages, or interrupt responses. When the agent is in an interrupt state, you must provide interrupt responses (not a plain string) to resume correctly.

```typescript
import { Agent, AfterInvocationEvent } from '@strands-agents/sdk'

let resumeCount = 0

const agent = new Agent({})
agent.addHook(AfterInvocationEvent, (event) => {
  // Resume once after a clean turn to ask the model for a one-line summary.
  if (resumeCount === 0) {
    resumeCount += 1
    event.resume = 'Now summarize what you just did in one sentence.'
  }
})

const result = await agent.invoke('Look up the weather in Seattle')
```

You can also use resume to chain multiple re-invocations. Make sure to include a termination condition to avoid infinite loops:

```typescript
import { Agent, AfterInvocationEvent } from '@strands-agents/sdk'

const MAX_ITERATIONS = 3
let iteration = 0

const agent = new Agent({})
agent.addHook(AfterInvocationEvent, (event) => {
  if (iteration >= MAX_ITERATIONS) return
  iteration += 1
  event.resume = `Review your previous response and improve it. Iteration ${iteration} of ${MAX_ITERATIONS}.`
})

const result = await agent.invoke('Draft a haiku about programming')
```

**Handling interrupts with resume**: The resume property integrates with the interrupt system. When an agent invocation ends because of an interrupt, a hook can automatically handle the interrupt by resuming with interrupt responses. This avoids returning the interrupt to the caller.

When the agent is in an interrupt state, you must resume with a list of interruptResponse objects. Passing a plain string raises a TypeError.

```typescript
import {
  Agent,
  AfterInvocationEvent,
  BeforeToolCallEvent,
  InterruptEvent,
} from '@strands-agents/sdk'
import type { Interrupt } from '@strands-agents/sdk'

const agent = new Agent({ tools: [] })

// Track interrupts as they fire so AfterInvocationEvent can build resume input.
const pendingInterrupts: Interrupt[] = []

agent.addHook(BeforeToolCallEvent, (event) => {
  if (event.toolUse.name === 'send_email') {
    event.interrupt({ name: 'email_approval', reason: 'Approve this email?' })
  }
})

agent.addHook(InterruptEvent, (event) => {
  pendingInterrupts.push(event.interrupt)
})

agent.addHook(AfterInvocationEvent, (event) => {
  if (pendingInterrupts.length === 0) return
  // Auto-approve every interrupted tool call so the caller never sees the interrupt.
  event.resume = pendingInterrupts.map((interrupt) => ({
    interruptResponse: {
      interruptId: interrupt.id,
      response: 'approved',
    },
  }))
  pendingInterrupts.length = 0
})

const result = await agent.invoke('Send an email to alice@example.com saying hello')
```

### HookProvider Protocol

For advanced use cases, you can implement the HookProvider protocol to create objects that register multiple callbacks at once. This is useful when building reusable hook collections without the full plugin infrastructure:

**TypeScript SDK**: The TypeScript SDK does not export a HookProvider interface. Instead, use the Plugin class to bundle multiple hooks together. The Plugin class provides `initAgent()` for registering hooks and `getTools()` for providing tools.

```typescript
class LoggingPlugin implements Plugin {
  name = 'logging-plugin'

  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeToolCallEvent, (event) => {
      console.log(`Calling: ${event.toolUse.name}`)
    })

    agent.addHook(AfterToolCallEvent, (event) => {
      console.log(`Completed: ${event.toolUse.name}`)
    })
  }
}

const agent = new Agent({ plugins: [new LoggingPlugin()] })
```

---

## Exception Handling

When a tool raises an exception, the agent converts it to an error result and returns it to the model, allowing the model to adjust its approach and retry. This works well for expected errors like validation failures, but for unexpected errors—assertion failures, configuration errors, or bugs—you may want to fail immediately rather than let the model retry futilely.

The `exception` property on `AfterToolCallEvent` provides access to the original exception, enabling hooks to inspect error types and selectively propagate those that shouldn't be retried.

> Note: This feature is not yet available in TypeScript SDK

---

## Next Steps

- Review [Plugin documentation](/docs/plugins) for creating reusable hook collections
- Explore [Streaming](/docs/streaming) for building real-time agent applications
- Check [Agent Loop](/docs/concepts/agents/agent-loop) for deeper understanding of agent execution flow
