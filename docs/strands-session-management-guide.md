# Strands Agent SDK: Session Management Guide

## Overview

Session management in Strands Agents provides a robust mechanism for persisting agent state and conversation history across multiple interactions. This enables agents to maintain context and continuity even when the application restarts or when deployed in distributed environments.

### What is a Session?

A session represents all of the stateful information that is needed by agents and multi-agent systems to function.

#### Single Agent Sessions

- Conversation history (messages)
- Agent state (key-value storage)
- Other stateful information (like Conversation Manager)

#### Multi-Agent Sessions

- Orchestrator state and configuration
- Individual agent states and results within the orchestrator
- Cross-agent shared state and context
- Execution flow and node transition history

Strands provides built-in session persistence capabilities that automatically capture and restore this information, allowing agents to seamlessly continue conversations where they left off. Beyond the built-in options, third-party session managers provide additional storage and memory capabilities.

---

## Basic Usage

### Single Agent Sessions

Simply create an agent with a session manager and use it:

```typescript
const session = new SessionManager({
  sessionId: 'test-session',
  storage: new LocalFileStorage('./sessions/'),
})

const agent = new Agent({ sessionManager: session })

// Use the agent - all messages and state are automatically persisted
await agent.invoke('Hello!') // This conversation is persisted
```

**Note**: `SessionManager` implements both `Plugin` (for agents) and `MultiAgentPlugin` (for orchestrators). The `sessionManager` constructor field is a convenience shorthand — you can also pass it directly in the plugins array:

```typescript
const session = new SessionManager({
  sessionId: 'test-session',
  storage: new LocalFileStorage('./sessions/'),
})

// Equivalent to passing via sessionManager field
const agent = new Agent({ plugins: [session] })
await agent.invoke('Hello!')
```

The conversation, and associated state, is persisted to the underlying storage backend.

> **Note**: `FileSessionManager` and `S3SessionManager` remain supported in Python, but use `SnapshotSessionManager` for new single-agent sessions.

### Multi-Agent Sessions

Multi-agent systems (Graph/Swarm) can also use session management to persist their state.

> **Caution**: Agents inside a multi-agent system must not have their own session manager — only the orchestrator should have one. The orchestrator snapshots and restores each agent node's state on every execution, so an agent-level session manager would conflict with the orchestrator's persistence.

#### Graph Example

```typescript
const session = new SessionManager({
  sessionId: 'graph-session',
  storage: new LocalFileStorage('./sessions/'),
})

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
  sessionManager: session,
})

// Orchestrator state is automatically persisted after each node completes
const result = await graph.invoke('Research and write about AI')
```

#### Swarm Example

Swarm works the same way:

```typescript
const session = new SessionManager({
  sessionId: 'swarm-session',
  storage: new LocalFileStorage('./sessions/'),
})

const researcher = new Agent({
  id: 'researcher',
  description: 'Researches a topic and gathers key facts.',
  systemPrompt: 'Research the answer, then hand off to the writer.',
})

const writer = new Agent({
  id: 'writer',
  description: 'Writes a polished final answer.',
  systemPrompt: 'Write the final answer. Do not hand off.',
})

const swarm = new Swarm({
  nodes: [researcher, writer],
  start: 'researcher',
  sessionManager: session,
})

const result = await swarm.invoke('Explain quantum computing')
```

> **Note**: Multi-agent session managers only track the current state of the Graph/Swarm execution and do not persist individual agent conversation histories.

---

## Storage Backends

Snapshot-based session managers accept any Storage backend, including:

- `InMemoryStorage`
- `LocalFileStorage`
- `S3Storage`
- Custom implementations

See **Storage** for backend configuration, tradeoffs, custom backends, and required S3 permissions.

**Configuration**: Pass storage to `SessionManager` or to the agent. Manager-level storage takes precedence over agent-level storage. If neither provides storage, initialization fails.

---

## How Session Management Works

### Snapshot-based Session Managers

`SnapshotSessionManager` in Python and `SessionManager` in TypeScript persist a complete point-in-time snapshot. Both restore `snapshot_latest` during initialization and support immutable checkpoints.

#### Single Agent Events

1. **Agent Initialization**: Restores state from `snapshot_latest` if it exists.
2. **Message Addition** (`saveLatestOn: 'message'`): Saves after each message and again when the invocation ends.
3. **Agent Invocation** (`saveLatestOn: 'invocation'`, default): Saves when the invocation ends.
4. **Snapshot Trigger**: Creates an immutable checkpoint when `snapshotTrigger` returns true.
5. **Message Redaction**: Saves redacted content for the message and invocation strategies, but not for trigger.

See **Basic Usage** for configuration examples.

#### Multi-Agent Events

1. **Before Multi-Agent Invocation**: Restores orchestrator state from `snapshot_latest` on the first invocation.
2. **After Node Call** (`multiAgentSaveLatestOn: 'node'`, default): Saves after each node and again when the invocation ends.
3. **After Multi-Agent Invocation** (`multiAgentSaveLatestOn: 'invocation'`): Saves only when the full invocation ends.

**Configuration Example**:

```typescript
const session = new SessionManager({
  sessionId: 'my-session',
  storage: new LocalFileStorage('./sessions/'),
  // Save orchestrator state after each node completes (default)
  multiAgentSaveLatestOn: 'node',
  // Or save only after the full orchestrator invocation completes:
  // multiAgentSaveLatestOn: 'invocation',
})
```

### Repository-based Session Managers

> **Note**: Repository-based session managers are available in the Python SDK only.

`FileSessionManager`, `S3SessionManager`, and `RepositorySessionManager` store individual message records and agent metadata. Use them for existing repository-format sessions, Graph, Swarm, or bidirectional streaming.

`SnapshotSessionManager` remains the recommended option for new single-agent sessions. Use the repository-based managers when you need one of the compatibility cases above:

```python
from strands import Agent
from strands.session import FileSessionManager, S3SessionManager

file_session_manager = FileSessionManager(
    session_id="file-session",
    storage_dir="./sessions/",
)
file_agent = Agent(session_manager=file_session_manager)

s3_session_manager = S3SessionManager(
    session_id="s3-session",
    bucket="my-agent-sessions",
    prefix="production/",
)
s3_agent = Agent(session_manager=s3_session_manager)
```

**Lifecycle Events**:

1. **Agent Initialization**: Restores stored messages, agent state, conversation manager state, interrupt state, and model state.
2. **Message Addition**: Appends the message record and synchronizes changed agent state.
3. **Agent Invocation**: Synchronizes changed agent and conversation manager state.
4. **Message Redaction**: Updates the latest stored message record.
5. **Multi-Agent and Bidirectional Events**: Restore state during initialization and synchronize state after node, message, and invocation events.

#### Direct Message Modifications

Changing `agent.messages` directly does not trigger persistence. A later snapshot save captures the current list, but repository-based managers do not create message records for direct changes. Use the agent and Conversation Manager APIs so persistence follows normal lifecycle events.

---

## Immutable Snapshots

In addition to `snapshot_latest`, snapshot-based session managers support immutable snapshots. Strands assigns each append-only checkpoint a UUIDv7 identifier, which lets you restore the agent to any prior checkpoint instead of only the latest state.

### Creating Immutable Snapshots

Use the snapshot trigger callback to control when an immutable snapshot is created. The callback receives the current agent data and returns a boolean:

```typescript
const session = new SessionManager({
  sessionId: 'my-session',
  storage: new LocalFileStorage('./sessions/'),
  // Create an immutable snapshot after every 4 messages
  snapshotTrigger: ({ agentData }) => agentData.messages.length % 4 === 0,
})

const agent = new Agent({ sessionManager: session })
await agent.invoke('First message') // 2 messages — no snapshot
await agent.invoke('Second message') // 4 messages — immutable snapshot created
```

### Listing and Restoring Snapshots

Snapshot IDs are UUID v7, so they sort lexicographically in chronological order. Use `listSnapshotIds` on the session manager to retrieve them, then pass a `snapshotId` to `restoreSnapshot`:

```typescript
const storage = new LocalFileStorage('./sessions/')

const session = new SessionManager({
  sessionId: 'my-session',
  storage,
})
const agent = new Agent({ sessionManager: session })
await agent.initialize()

// List all immutable snapshot IDs (chronological order)
const snapshotIds = await session.listSnapshotIds({
  target: agent,
})

// Restore agent to a specific checkpoint
await session.restoreSnapshot({
  target: agent,
  snapshotId: snapshotIds[0]!,
})
```

### Deleting Sessions

To remove all snapshots for a session, call the session manager's `delete` method:

```typescript
const session = new SessionManager({
  sessionId: 'my-session',
  storage: new LocalFileStorage('./sessions/'),
})

// Remove all snapshots and manifests for this session
await session.deleteSession()
```

---

## Data Models

### Snapshot Structure

The TypeScript SDK stores session state as a `Snapshot` object written to JSON. Each snapshot contains:

- `data.messages`: The full conversation history
- `data.state`: Agent key-value state
- `data.systemPrompt`: The agent's system prompt
- `schemaVersion`: Schema version for forward compatibility
- `createdAt`: ISO 8601 timestamp

### Snapshot Types

There are two kinds of snapshots:

1. **snapshot_latest.json**: A single mutable file overwritten on each save. Used to resume the most recent state after a restart.
2. **Immutable snapshots** (`immutable_history/snapshot_<uuid7>.json`): Append-only checkpoints created when `snapshotTrigger` fires. Used for time-travel restore.

---

## Third-Party Session Managers

The following third-party session managers extend Strands with additional storage and memory capabilities:

| Session Manager | Provider | Description | Documentation |
|-----------------|----------|-------------|-----------------|
| `AgentCoreMemorySessionManager` | Amazon | Advanced memory with intelligent retrieval using Amazon Bedrock AgentCore Memory. Supports both short-term memory (STM) and long-term memory (LTM) with strategies for user preferences, facts, and session summaries. | View Documentation |
| Contribute Your Own | Community | Have you built a session manager? Share it with the community! | Learn How |

---

## Custom Session Repositories

For advanced use cases, you can implement your own session storage backend.

### Simple Approach: Storage Backend

The simplest approach is to pass any `Storage` backend directly — the `SessionManager` wraps it automatically.

### Advanced Approach: SnapshotStorage Interface

For full control, you can implement the `SnapshotStorage` interface:

```typescript
// Implement SnapshotStorage to plug in any backend
class MyStorage implements SnapshotStorage {
  async saveSnapshot({
    location,
    snapshotId,
    snapshot,
  }: {
    location: SnapshotLocation
    snapshotId: string
    isLatest: boolean
    snapshot: Snapshot
  }) {
    // Store the snapshot JSON keyed by location + snapshotId
  }

  async loadSnapshot({
    location,
    snapshotId,
  }: {
    location: SnapshotLocation
    snapshotId?: string
  }) {
    // Return the snapshot, or null if not found
    return null
  }

  async listSnapshotIds({
    location,
  }: {
    location: SnapshotLocation
    limit?: number
    startAfter?: string
  }) {
    // Return immutable snapshot IDs sorted chronologically
    return []
  }

  async deleteSession({ sessionId }: { sessionId: string }) {
    // Remove all stored data for this session
  }

  async loadManifest({
    location,
  }: {
    location: SnapshotLocation
  }): Promise<SnapshotManifest> {
    return {
      schemaVersion: '1',
      updatedAt: new Date().toISOString(),
    }
  }

  async saveManifest({
    location,
    manifest,
  }: {
    location: SnapshotLocation
    manifest: SnapshotManifest
  }) {
    // Persist the manifest
  }
}

const agent = new Agent({
  sessionManager: new SessionManager({
    sessionId: 'user-789',
    storage: { snapshot: new MyStorage() },
  }),
})
```

This approach allows you to store session data in any backend system while leveraging the built-in session management logic.

### Data Layout

Both file and S3 backends use the same key structure:

```
<root>/
└── <sessionId>/
    └── scopes/
        ├── agent/
        │   └── <agentId>/
        │       └── snapshots/
        │           ├── snapshot_latest.json
        │           └── immutable_history/
        │               └── snapshot_<uuid7>.json
        └── multiAgent/
            └── <orchestratorId>/
                └── snapshots/
                    └── snapshot_latest.json
```

> **Migration Note**: Using the same session ID and storage location does not migrate repository-based Python data to `SnapshotSessionManager`. Existing sessions can continue using their current manager, or applications can migrate the required state explicitly.

---

## Sessions, Agents, and Concurrency

Session management is designed around a single live writer per conversation: the session ID plus the agent ID (`id`), or the orchestrator ID for a Graph or Swarm, address one conversation thread in storage.

### One Conversation per Session

Give each conversation its own session ID. Several agents can share one session ID as long as their agent IDs differ: the session acts as a namespace, and each agent keeps its own messages and state inside it. A single agent instance processes one invocation at a time by default and rejects overlap, as described in **Concurrent Invocations**.

### Create an Agent per Conversation

Constructing an agent is cheap: it wires up tools, hooks, and plugins locally and makes no model call. Build one per request, invoke it, and let it go out of scope. The model provider is the part worth reusing: providers such as `BedrockModel` build their client in the constructor, so create the provider once per process and pass the same instance to every agent.

### Common Failure Modes

The built-in session managers take no distributed lock, and the single-instance invocation guard is in-process, so neither can detect a second writer running elsewhere. Two patterns result:

1. **Two live agents addressing the same session ID and agent ID**. The default IDs (`id: 'agent'`) make this easy to do by accident, including across separate executions that each build their own agent. Overlapping invocations overwrite each other's turns, sequential ones merge two conversations into one history, and neither call errors.

2. **Two callers creating the same session at the same time**. Session creation is a check followed by a write, not an atomic operation, so simultaneous cold starts on a new session ID can both succeed, with the later write winning.

---

## Session Persistence Best Practices

When implementing session persistence in your applications, consider these best practices:

### Use Unique Session IDs

Generate unique session IDs for each user or conversation context to prevent data overlap. Avoid relying on default agent IDs across multiple executions.

```typescript
// Good: Unique session ID per conversation
const session = new SessionManager({
  sessionId: `user_${userId}_conversation_${conversationId}`,
  storage: new LocalFileStorage('./sessions/'),
})
```

### Session Cleanup

Implement a strategy for cleaning up old or inactive sessions. Consider adding TTL (Time To Live) for sessions in production environments.

### Understand Persistence Triggers

Remember that changes to agent state or messages are only persisted during specific lifecycle events:

- `saveLatestOn: 'message'` — persists after each message
- `saveLatestOn: 'invocation'` — persists at invocation end (default)
- `multiAgentSaveLatestOn: 'node'` — multi-agent saves after each node
- `multiAgentSaveLatestOn: 'invocation'` — multi-agent saves at invocation end

### Concurrent Access

Session managers are not thread-safe and take no distributed lock. See **Sessions, Agents, and Concurrency** for patterns to avoid overlapping access.

### Secure Storage Directories

The session storage directory is a trusted data store. Restrict filesystem permissions so that only the agent process can read and write to it.

**Security Warning**: In shared or multi-tenant environments (shared volumes, containers), be aware that the SDK does not block symlinks in the session storage directory. If an attacker with write access to the storage directory creates a symlink (e.g., `message_0.json` pointing to an arbitrary file), the SDK will follow it, which could cause sensitive file contents to be loaded into the agent's conversation history. Implement appropriate access controls on the storage directory.

---

## Common Patterns

### Single-Shot Conversation

For one-off agent invocations that don't need persistence:

```typescript
const agent = new Agent({
  tools: [/* ... */],
})

const result = await agent.invoke('What is 2 + 2?')
```

### Persistent Multi-Turn Conversation

For conversations that should persist across restarts:

```typescript
const session = new SessionManager({
  sessionId: `user_${userId}`,
  storage: new LocalFileStorage('./sessions/'),
})

const agent = new Agent({
  sessionManager: session,
  tools: [/* ... */],
})

// First turn
const result1 = await agent.invoke('My name is Alice')

// Second turn - conversation history is preserved
const result2 = await agent.invoke('What did I just tell you?')
```

### Multi-Agent Workflow with Persistence

For orchestrators that should maintain state across invocations:

```typescript
const session = new SessionManager({
  sessionId: `workflow_${workflowId}`,
  storage: new LocalFileStorage('./sessions/'),
  multiAgentSaveLatestOn: 'node', // Save after each agent completes
})

const graph = new Graph({
  nodes: [researcher, writer, reviewer],
  edges: [
    ['researcher', 'writer'],
    ['writer', 'reviewer'],
  ],
  sessionManager: session,
})

// Invocation 1 - completes first two nodes, saves state
const result1 = await graph.invoke('Research quantum computing')

// Invocation 2 - starts from where we left off
const result2 = await graph.invoke('Continue the workflow')
```

### Time-Travel Restore

To implement rollback or checkpoint functionality:

```typescript
const session = new SessionManager({
  sessionId: 'my-session',
  storage: new LocalFileStorage('./sessions/'),
  snapshotTrigger: ({ agentData }) => agentData.messages.length % 5 === 0, // Every 5 messages
})

const agent = new Agent({ sessionManager: session })

// ... perform operations ...

// Get all checkpoints
const snapshotIds = await session.listSnapshotIds({ target: agent })

// Restore to an earlier point
await session.restoreSnapshot({
  target: agent,
  snapshotId: snapshotIds[0], // First checkpoint
})

// Continue from that point
const result = await agent.invoke('Continue from here')
```

---

## Next Steps

- Review **Storage** for backend configuration and setup
- Explore **Conversation Management** for managing complex multi-turn interactions
- Check **Concurrent Invocations** for patterns when running multiple agent instances
- See **Hooks** for monitoring session state changes
