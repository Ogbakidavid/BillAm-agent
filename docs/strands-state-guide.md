# State Management

Strands Agents state is maintained in several forms:

- **Conversation History**: The sequence of messages between the user and the agent.
- **Agent State**: Stateful information outside of conversation context, maintained across multiple requests.
- **Invocation State**: Contextual information maintained within a single invocation.

Understanding how state works in Strands is essential for building agents that can maintain context across multi-turn interactions and workflows.

## Conversation History

Conversation history is the primary form of context in a Strands agent, directly accessible through the agent:

```javascript
// Create an agent
const agent = new Agent()

// Send a message and get a response
await agent.invoke('Hello!')

// Access the conversation history
console.log(agent.messages) // Shows all messages exchanged so far
```

The agent messages contains all user and assistant messages, including tool calls and tool results. This is the primary way to inspect what's happening in your agent's conversation.

You can initialize an agent with existing messages to continue a conversation or pre-fill your Agent's context with information:

```javascript
// Create an agent with initial messages
const agent = new Agent({
  messages: [
    { role: 'user', content: [{ text: 'Hello, my name is Strands!' }] },
    { role: 'assistant', content: [{ text: 'Hi there! How can I help you today?' }] },
  ],
})

// Continue the conversation
await agent.invoke("What's my name?")
```

Conversation history is automatically:

- Maintained between calls to the agent
- Passed to the model during each inference
- Used for tool execution context
- Managed to prevent context window overflow

### Direct Tool Calling

Direct tool calls are (by default) recorded in the conversation history:

```javascript
import { Agent } from '@strands-agents/sdk'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'

const agent = new Agent({
  tools: [notebook],
})

// notebook is registered when the agent is created, so the non-null assertion is safe.
await agent.tool.notebook!.invoke({ mode: 'list' })
const recordedMessageCount = agent.messages.length

await agent.tool.notebook!.invoke({ mode: 'list' }, { recordDirectToolCall: false })

console.log(recordedMessageCount > 0) // true
console.log(agent.messages.length === recordedMessageCount) // true
```

### Conversation Manager

Strands uses a conversation manager to handle conversation history effectively. The default is the SlidingWindowConversationManager, which keeps recent messages and removes older ones when needed:

```javascript
import { SlidingWindowConversationManager } from '@strands-agents/sdk'
// Create a conversation manager with custom window size
// By default, SlidingWindowConversationManager is used even if not specified
const conversationManager = new SlidingWindowConversationManager({
  windowSize: 10,
})

const agent = new Agent({
  conversationManager,
})
```

The sliding window conversation manager:

- Keeps the most recent N message pairs
- Removes the oldest messages when the window size is exceeded
- Handles context window overflow exceptions by reducing context
- Ensures conversations don't exceed model context limits

See Conversation Management for more information about conversation managers.

## Agent State

Agent state (also called app state) provides key-value storage for stateful information that exists outside of the conversation context. Unlike conversation history, agent state is not passed to the model during inference but can be accessed and modified by tools and application logic.

### Basic Usage

```javascript
// Create an agent with initial state
const agent = new Agent({
  appState: { user_preferences: { theme: 'dark' }, session_count: 0 },
})

// Access state values
const theme = agent.appState.get('user_preferences')
console.log(theme) // { theme: 'dark' }

// Set new state values
agent.appState.set('last_action', 'login')
agent.appState.set('session_count', 1)

// Get state values individually
console.log(agent.appState.get('user_preferences'))
console.log(agent.appState.get('session_count'))

// Delete state values
agent.appState.delete('last_action')
```

### State Validation and Safety

Agent state enforces JSON serialization validation to ensure data can be persisted and restored:

```javascript
const agent = new Agent()

// Valid JSON-serializable values
agent.appState.set('string_value', 'hello')
agent.appState.set('number_value', 42)
agent.appState.set('boolean_value', true)
agent.appState.set('list_value', [1, 2, 3])
agent.appState.set('dict_value', { nested: 'data' })
agent.appState.set('null_value', null)

// Invalid values will raise an error
try {
  agent.appState.set('function', () => 'test') // Not JSON serializable
} catch (error) {
  console.log(`Error: ${error}`)
}
```

### Using State in Tools

> **Note:** To use ToolContext in your tool function, the parameter must be named `tool_context`. See ToolContext documentation for more information.

Agent state is particularly useful for maintaining information across tool executions:

```javascript
const trackUserActionTool = tool({
  name: 'track_user_action',
  description: 'Track user actions in agent state',
  inputSchema: z.object({
    action: z.string().describe('The action to track'),
  }),
  callback: (input, context?: ToolContext) => {
    if (!context) {
      throw new Error('Context is required')
    }

    // Get current action count
    const actionCount = (context.agent.appState.get('action_count') as number) || 0

    // Update state
    context.agent.appState.set('action_count', actionCount + 1)
    context.agent.appState.set('last_action', input.action)

    return `Action '${input.action}' recorded. Total actions: ${actionCount + 1}`
  },
})

const getUserStatsTool = tool({
  name: 'get_user_stats',
  description: 'Get user statistics from agent state',
  inputSchema: z.object({}),
  callback: (input, context?: ToolContext) => {
    if (!context) {
      throw new Error('Context is required')
    }

    const actionCount = (context.agent.appState.get('action_count') as number) || 0
    const lastAction = (context.agent.appState.get('last_action') as string) || 'none'

    return `Actions performed: ${actionCount}, Last action: ${lastAction}`
  },
})

// Create agent with tools
const agent = new Agent({
  tools: [trackUserActionTool, getUserStatsTool],
})

// Use tools that modify and read state
await agent.invoke('Track that I logged in')
await agent.invoke('Track that I viewed my profile')
console.log(`Actions taken: ${agent.appState.get('action_count')}`)
console.log(`Last action: ${agent.appState.get('last_action')}`)
```

## Invocation State

Each agent interaction maintains an invocation state dictionary that persists throughout the event loop cycles and is not included in the agent's context:

```javascript
const agent = new Agent()

// Pass per-invocation state when invoking
const result = await agent.invoke('Hi there!', {
  invocationState: { requestId: 'r-42', userId: 'u-1' },
})

// Hooks and tools can read and mutate invocationState during
// the invocation. The same object is returned on the result.
console.log(result.invocationState)
// { requestId: 'r-42', userId: 'u-1', ... }
```

Invocation state (`invocationState`):

- Is initialized at the beginning of each agent invocation (defaults to `{}` when omitted)
- Persists through recursive event loop cycles within a single invocation
- Is shared by reference across all hook events and tools
- Mutations by hooks or tools are visible to subsequent hooks, tools, and the final result
- Is returned on the AgentResult (Python: `result.state`, TypeScript: `result.invocationState`)
- Is not included in the agent's model context

## Persisting State Across Sessions

For automatic persistence of agent state and conversation history across application restarts, see Session Management. For manual, point-in-time capture and restore of agent state, see Snapshots.
