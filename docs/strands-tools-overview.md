# Strands Agent SDK: Tools Overview

## Introduction

Tools enable agents to interact with the world beyond language. The Strands SDK provides three ways to access tools:

1. **Tool Executors** - Control how tools run (concurrent vs sequential)
2. **Vended Tools** - Pre-built tools included in the SDK
3. **Community Tools Package** - Extended tool library for Python

---

## Part 1: Tool Executors

Tool executors control whether tools from a single assistant turn run concurrently or sequentially. Both SDKs default to concurrent execution.

### Concurrent Executor (Default)

Concurrent execution runs all tool calls from a single turn in parallel. This is the default in both SDKs — you get it without any extra configuration.

```typescript
import { Agent } from '@strands-agents/sdk'

const agent = new Agent({
  tools: [weatherTool, timeTool],
  toolExecutor: 'concurrent',
})
// Omit toolExecutor to use concurrent execution by default.

await agent.invoke('What is the weather and time in New York?')
```

The `'concurrent'` string shorthand keeps your imports minimal. Passing `new ConcurrentToolExecutor()` is equivalent if you prefer to be explicit.

Assuming the model returns `weather_tool` and `time_tool` use requests, the concurrent executor runs both at the same time. **End-to-end latency scales with the slowest tool rather than their sum.**

#### Sequential Behavior by Default

On certain prompts, the model may decide to return one tool use request at a time. Under these circumstances, the tools will execute sequentially. Concurrency is only achieved if the model returns multiple tool use requests in a single response. Certain models however offer additional abilities to coerce a desired behavior. For example, Anthropic exposes an explicit parallel tool use setting ([docs](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use#parallel-tool-use)).

### Sequential Executor

Use sequential execution when tool order matters — for example, when a later tool depends on a side effect of an earlier one:

```typescript
import { Agent } from '@strands-agents/sdk'

const agent = new Agent({
  tools: [screenshotTool, emailTool],
  toolExecutor: 'sequential',
})

await agent.invoke('Take a screenshot and email it to my friend')
```

The `'sequential'` string shorthand keeps your imports minimal. Passing `new SequentialToolExecutor()` is equivalent if you prefer to be explicit.

Assuming the model returns `screenshot_tool` and `email_tool` use requests, the sequential executor runs both in the order given.

### Event Ordering

Both modes preserve per-tool event order. In concurrent mode, events from different tools may interleave across that per-tool sequence.

**Per-tool event order**:
```
BeforeToolCallEvent
  ↓
ToolStreamUpdateEvent (0+)
  ↓
AfterToolCallEvent
  ↓
ToolResultEvent
```

### Cancellation

Cancellation works identically in both modes. Call `agent.cancel()` to request cooperative cancellation. In TypeScript, this flips `agent.cancelSignal`.

**Pre-launch cancel**: Set `BeforeToolsEvent.cancel` on the batch-level hook, or call `agent.cancel()` before tools start, to produce error results for every tool in the batch.

**Mid-flight cancel**:
- In sequential mode: Short-circuits not-yet-started tools
- In concurrent mode: All tools have already launched, so each in-flight tool must cooperatively observe `context.cancelSignal` to stop early

### Custom Executors

Custom tool executors are not currently supported but are planned for a future release. You can track progress on this feature at [GitHub Issue #762](https://github.com/strands-agents/harness-sdk/issues/762).

---

## Part 2: Vended Tools

Vended tools are pre-built tools included directly in the Strands SDK for common agent tasks like file operations, shell commands, HTTP requests, and persistent notes.

They ship as part of the SDK package and are updated alongside it. See **Versioning & Maintenance** for details on how changes are communicated and what level of backwards compatibility they maintain.

### Quick Start

Each tool is imported from its own subpath under `@strands-agents/sdk/vended-tools` — no additional packages required:

```typescript
import { Agent } from '@strands-agents/sdk'
import { bash } from '@strands-agents/sdk/vended-tools/bash'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'
import { httpRequest } from '@strands-agents/sdk/vended-tools/http-request'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'

const agent = new Agent({
  tools: [bash, fileEditor, httpRequest, notebook],
})
```

### Available Vended Tools

| Tool | Description | Supported in |
|------|-------------|--------------|
| **File Editor** | View, create, and edit files | Python, TypeScript (Node.js) |
| **HTTP Request** | Make HTTP requests to external APIs | Python, TypeScript (Node.js 22+, browsers) |
| **Notebook** | Manage persistent text notebooks | TypeScript (Node.js, browsers) |
| **Bash** | Execute shell commands with persistent sessions | Python, TypeScript (Node.js, Unix/Linux/macOS) |
| **Sleep** | Pause execution for a bounded, cancellable duration | Python, TypeScript (Node.js, browsers) |
| **Stop** | Gracefully end the agent loop when the task is complete | Python, TypeScript (Node.js, browsers) |
| **Web Fetch** | Fetch a URL and return cleaned markdown | Python |

---

### File Editor

Gives your agent the ability to read and modify files on disk — useful for coding agents, config management, or any workflow where the agent needs to inspect output and make targeted edits.

**Security Warning**: This tool reads and writes files at arbitrary absolute paths with the full permissions of the process. Only use with trusted input and consider running in a sandboxed environment for production.

#### Example

```typescript
import { Agent } from '@strands-agents/sdk'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'

const agent = new Agent({
  tools: [fileEditor],
})

// Create, view, and edit files
await agent.invoke('Create a file /tmp/config.json with {"debug": false}')
await agent.invoke('Replace "debug": false with "debug": true in /tmp/config.json')
await agent.invoke('View lines 1-10 of /tmp/config.json')
```

📖 [Full API Reference](./vended-tools/file-editor)

---

### HTTP Request

Lets your agent call external APIs and fetch web content. Supports all HTTP methods, custom headers, and request bodies. Default timeout is 30 seconds.

**Supported in**: Python; Node.js 22+, modern browsers (TypeScript).

#### Example

```typescript
import { Agent } from '@strands-agents/sdk'
import { httpRequest } from '@strands-agents/sdk/vended-tools/http-request'

const agent = new Agent({
  tools: [httpRequest],
})

// Make API requests
await agent.invoke('Get data from https://api.example.com/users')
await agent.invoke('Post {"name": "John"} to https://api.example.com/users')
```

📖 [Full API Reference - TypeScript](./vended-tools/http-request-ts) · [Full API Reference - Python](./vended-tools/http-request-py)

---

### Notebook

A scratchpad the agent can read and write across invocations. The most effective use is giving the agent a notebook at the start of a task and instructing it to plan its work there — it can break the task into steps, check things off as it goes, and always have a clear picture of what's left. 

Notebook state is part of the agent's state, so it persists automatically with **Session Management**.

**Supported in**: Node.js, browsers.

#### Example - Task Management

```typescript
import { Agent } from '@strands-agents/sdk'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'

const agent = new Agent({
  tools: [notebook],
  systemPrompt:
    'Before starting any multi-step task, create a notebook with a checklist of steps. ' +
    'Check off each step as you complete it.',
})

// The agent uses the notebook to plan and track its work
await agent.invoke('Write a project plan for building a personal budget tracker app')
```

#### Example - State Persistence

```typescript
import { Agent, SessionManager, LocalFileStorage } from '@strands-agents/sdk'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'

const session = new SessionManager({
  sessionId: 'my-session',
  storage: new LocalFileStorage('./sessions'),
})

const agent = new Agent({ tools: [notebook], sessionManager: session })

// Notebooks are automatically persisted as part of the session
await agent.invoke('Create a notebook called "ideas" with "# Project Ideas"')
await agent.invoke('Add "- Build a web scraper" to the ideas notebook')

// ...

// Later, a new agent with the same session restores notebooks automatically
const restoredAgent = new Agent({ tools: [notebook], sessionManager: session })
await restoredAgent.invoke('Read the ideas notebook')
```

📖 [Full API Reference](./vended-tools/notebook)

---

### Bash / Shell

Lets your agent run shell commands and act on the output. The two SDKs expose different tools here:

- **TypeScript bash**: Spawns a persistent bash process on the host. Shell state — variables, working directory, exported functions — persists across invocations within the same session, so the agent can build up context incrementally. Sessions can be restarted to clear state.
- **Python shell**: Routes each command through the agent's Sandbox and is stateless: every call runs in a fresh shell, so variables and the working directory do not carry over. The sandbox decides the interpreter — sh locally and in Docker, the remote login shell over SSH — so use portable POSIX syntax.

**Supported in**: Node.js on Unix/Linux/macOS (TypeScript), all platforms (Python).

**Security Warning**: These tools execute arbitrary shell commands. Without a Sandbox, commands run with the full permissions of the process. Only use with trusted input and consider running in a sandboxed environment for production.

#### Example - File Operations

```typescript
import { Agent } from '@strands-agents/sdk'
import { bash } from '@strands-agents/sdk/vended-tools/bash'

const agent = new Agent({
  tools: [bash],
})

// List files and create a new file
await agent.invoke('List all files in the current directory')
await agent.invoke('Create a new file called notes.txt with "Hello World"')
```

#### Example - Session Persistence (TypeScript)

```typescript
import { Agent } from '@strands-agents/sdk'
import { bash } from '@strands-agents/sdk/vended-tools/bash'

const agent = new Agent({
  tools: [bash],
})

// Variables persist across invocations within the same session
await agent.invoke('Run: export MY_VAR="hello"')
await agent.invoke('Run: echo $MY_VAR') // Will show "hello"

// Restart session to clear state
await agent.invoke('Restart the bash session')
await agent.invoke('Run: echo $MY_VAR') // Variable will be empty
```

📖 [Full API Reference - shell](./vended-tools/shell) · [Full API Reference - bash (TypeScript only)](./vended-tools/bash)

---

### Sleep

Pauses the agent for a bounded number of seconds. Cancelling the enclosing invocation aborts the sleep immediately rather than waiting for the full duration, so a long timer never ties up a session the caller has moved on from.

**Supported in**: Node.js, modern browsers (TypeScript); all platforms (Python).

The maximum duration is configurable at construction (default: 60 seconds) and cannot be raised by the model. Negative, NaN, infinite, non-numeric, and boolean durations are rejected at the tool boundary.

#### Example

```typescript
import { Agent } from '@strands-agents/sdk'
import { sleep } from '@strands-agents/sdk/vended-tools/sleep'

const agent = new Agent({
  tools: [sleep],
})

await agent.invoke('Pause for two seconds, then continue.')
```

#### Custom Maximum

```typescript
import { Agent } from '@strands-agents/sdk'
import { makeSleep } from '@strands-agents/sdk/vended-tools/sleep'

const shortSleep = makeSleep({ maxDuration: 5 })
const agent = new Agent({ tools: [shortSleep] })
```

📖 [Full API Reference](./vended-tools/sleep)

---

### Stop (Experimental)

> **Note**: This tool is experimental and subject to change in future revisions without notice.

Lets the model gracefully end the agent loop with an optional final message. The default loop already terminates when the model returns without any tool call; the stop tool is useful when you want an explicit "I am done" affordance, when a workflow enforces that termination is a deliberate model decision, or when a sub-agent needs to signal completion back to a coordinator via the loop's last assistant message.

**Supported in**: Node.js, modern browsers (TypeScript); all platforms (Python).

This is a cooperative stop, not an abort. Any other tools the model requested in the same turn still run to completion; the loop halts after that batch without calling the model again. The final message defaults to a 4096-character cap; pass `max_message_length` / `maxMessageLength` to `make_stop` / `makeStop` when a longer summary is legitimate.

**SDK Differences**:
- **TypeScript**: Halts via `AfterToolsEvent.endTurn` and returns `stopReason: "endTurn"` with the stop text as the last assistant message.
- **Python**: Halts via `invocation_state["request_state"]["stop_event_loop"]` and returns `stop_reason: "tool_use"` with the model's tool-use message as the final message; the stop text lives in history as the tool result, not as a new assistant turn.

#### Example

```typescript
import { Agent } from '@strands-agents/sdk'
import { stop } from '@strands-agents/sdk/experimental/vended-tools/stop'

const agent = new Agent({
  tools: [stop],
  systemPrompt: 'Complete the task. Call stop with a short summary when you are done.',
})

await agent.invoke('Summarize the changes in ./CHANGELOG.md')
```

📖 [Full API Reference](./vended-tools/stop)

---

### Web Fetch

Fetches an HTTP(S) URL and returns its content. Two modes are available, configured at construction time via `make_web_fetch`:

- **agentic** (default) — HTML is converted to markdown and passed to an analyst agent that answers a prompt, so the full page never enters the main agent's context. Use when targeted answers are needed about potentially large pages.
- **markdown** — HTML is converted to clean markdown with scripts, styles, and noise stripped. Use when the agent needs full pages for reasoning.

The tool delegates all networking to an `httpx.AsyncClient`. Use the `make_web_fetch` factory to supply a pre-configured client with custom timeouts, redirects, proxies, or caching. The `max_bytes` parameter caps the HTTP response size (default 5 MiB); `max_content_chars` caps the extracted content delivered to the model or analyst (default 50,000 characters). For `mode='agentic'`, the factory also accepts a model for the analyst; the agent's own model is used when none is supplied.

**Supported in**: Python (all platforms).

#### Installation

`web_fetch` requires the optional `web-fetch` extra:

```bash
pip install 'strands-agents[web-fetch]'
```

#### Security Posture

`web_fetch` accepts only `http://` and `https://` URLs and caps response bodies at 5 MiB by default. Egress control belongs at the layer that encapsulates the agent — a sandbox, microVM, or network policy — where it can be enforced consistently across all tools, including shell.

#### Example - Agentic Mode (Default)

```python
from strands import Agent
from strands.vended_tools import web_fetch

agent = Agent(tools=[web_fetch])
agent("What is the pricing for the enterprise plan at https://example.com/pricing")
```

#### Example - Reading Full Page as Markdown

```python
from strands import Agent
from strands.vended_tools import make_web_fetch

tool = make_web_fetch(mode="markdown")
agent = Agent(tools=[tool])
agent("Read https://example.com/docs and then explain the architecture")
```

#### Example - Dedicated Analyst Model with Tighter Caps

```python
import httpx
from strands import Agent
from strands.models import BedrockModel
from strands.vended_tools import make_web_fetch

tool = make_web_fetch(
    mode="agentic",
    client=httpx.AsyncClient(timeout=10.0),
    max_bytes=1 * 1024 * 1024,
    max_content_chars=25_000,
    model=BedrockModel(model_id="us.amazon.nova-micro-v1:0"),
)
agent = Agent(tools=[tool])
```

---

### Using Multiple Vended Tools Together

Combine vended tools to build powerful agent workflows:

```typescript
import { Agent } from '@strands-agents/sdk'
import { bash } from '@strands-agents/sdk/vended-tools/bash'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'
import { notebook } from '@strands-agents/sdk/vended-tools/notebook'

const agent = new Agent({
  tools: [bash, fileEditor, notebook],
  systemPrompt: [
    'You are a software development assistant.',
    'When given a feature to implement:',
    '1. Use the notebook tool to create a plan with a checklist of steps',
    '2. Work through each step, checking them off as you go',
    '3. Use the bash tool to run tests and verify your changes',
  ].join('\n'),
})

// Agent plans the work, implements it, and tracks progress
await agent.invoke(
  'Add input validation to the createUser function in src/users.ts. ' +
    'It should reject empty names and invalid email formats.'
)
```

### Versioning & Maintenance

Vended tools ship as part of the SDK and are updated alongside it. Report bugs and feature requests in the GitHub repository.

**Tool names are stable** and will not change. In minor versions, a tool's description, spec, or parameters may be updated to improve effectiveness — these changes are noted in SDK release notes. Pin your SDK version and test after upgrades if your workflows depend on specific tool behavior.

---

## Part 3: Community Built Tools

The Community Tools Package (`strands-agents-tools`) is a Python-only optional package which includes pre-built tools to get started quickly experimenting with agents and tools during development. The package is also open source and available on GitHub.

### Installation

Install the `strands-agents-tools` package by running:

```bash
pip install strands-agents-tools
```

Some tools require additional dependencies. Install the additional required dependencies in order to use the following tools:

```bash
# Memory tools
pip install 'strands-agents-tools[mem0_memory]'

# Browser tools
pip install 'strands-agents-tools[local_chromium_browser]'
pip install 'strands-agents-tools[agent_core_browser]'

# Code interpretation
pip install 'strands-agents-tools[agent_core_code_interpreter]'

# Agent-to-agent communication
pip install 'strands-agents-tools[a2a_client]'

# Visualization
pip install 'strands-agents-tools[diagram]'

# RSS feeds
pip install 'strands-agents-tools[rss]'

# Desktop automation
pip install 'strands-agents-tools[use_computer]'
```

### Available Community Tools

#### RAG & Memory

- **retrieve**: Semantically retrieve data from Amazon Bedrock Knowledge Bases for RAG, memory, and other purposes
- **memory**: Agent memory persistence in Amazon Bedrock Knowledge Bases
- **agent_core_memory**: Integration with Amazon Bedrock Agent Core Memory
- **mem0_memory**: Agent memory and personalization built on top of Mem0

#### File Operations

- **editor**: File editing operations like line edits, search, and undo
- **file_read**: Read and parse files
- **file_write**: Create and modify files

#### Shell & System

- **environment**: Manage environment variables
- **shell**: Execute shell commands
- **cron**: Task scheduling with cron jobs
- **use_computer**: Automate desktop actions and GUI interactions

#### Code Interpretation

- **python_repl**: Run Python code
  - Note: Not supported on Windows due to the `fcntl` module not being available on Windows.
- **code_interpreter**: Execute code in isolated sandboxes

#### Web & Network

- **http_request**: Make API calls, fetch web data, and call local HTTP servers
- **slack**: Slack integration with real-time events, API access, and message sending
- **browser**: Automate web browser interactions
- **rss**: Manage and process RSS feeds

#### Multi-modal

- **generate_image_stability**: Create images with Stability AI
- **image_reader**: Process and analyze images
- **generate_image**: Create AI generated images with Amazon Bedrock
- **nova_reels**: Create AI generated videos with Nova Reels on Amazon Bedrock
- **speak**: Generate speech from text using macOS `say` command or Amazon Polly

#### AWS Services

- **use_aws**: Interact with AWS services

#### Utilities

- **calculator**: Perform mathematical operations
- **current_time**: Get the current date and time
- **load_tool**: Dynamically load more tools at runtime
- **sleep**: Pause execution with interrupt support
- **diagram**: Create cloud architecture and UML diagrams

#### Agents & Workflows

- **graph**: Create and manage multi-agent systems using Strands SDK Graph implementation
- **agent_graph**: Create and manage graphs of agents
- **journal**: Create structured tasks and logs for agents to manage and work from
- **swarm**: Coordinate multiple AI agents in a swarm / network of agents
- **stop**: Force stop the agent event loop
- **handoff_to_user**: Enable human-in-the-loop workflows by pausing agent execution for user input or transferring control entirely to the user
- **use_agent**: Run a new AI event loop with custom prompts and different model providers
- **think**: Perform deep thinking by creating parallel branches of agentic reasoning
- **use_llm**: Run a new AI event loop with custom prompts
- **workflow**: Orchestrate sequenced workflows
- **batch**: Call multiple tools from a single model request
- **a2a_client**: Enable agent-to-agent communication

---

## Tool Consent and Bypassing

By default, certain tools that perform potentially sensitive operations (like file modifications, shell commands, or code execution) will prompt for user confirmation before executing. This safety feature ensures users maintain control over actions that could modify their system.

### Bypassing Confirmation Prompts

To bypass these confirmation prompts, you can set the `BYPASS_TOOL_CONSENT` environment variable:

```bash
# Set this environment variable to bypass tool confirmation prompts
export BYPASS_TOOL_CONSENT=true
```

#### Setting Within Python

```python
import os

os.environ["BYPASS_TOOL_CONSENT"] = "true"
```

### When to Bypass Confirmation

When this variable is set to `true`, tools will execute without asking for confirmation. This is particularly useful for:

- Automated workflows where user interaction isn't possible
- Development and testing environments
- CI/CD pipelines
- Situations where you've already validated the safety of operations

> **Warning**: Use this feature with caution in production environments, as it removes an important safety check.

---

## Human-in-the-Loop with `handoff_to_user`

The `handoff_to_user` tool enables human-in-the-loop workflows by allowing agents to pause execution for user input or transfer control entirely to a human operator. It offers two modes:

- **Interactive Mode** (`breakout_of_loop=False`): Collects input and continues
- **Complete Handoff Mode** (`breakout_of_loop=True`): Stops the event loop and transfers control to the user

### Example

```python
from strands import Agent
from strands_tools import handoff_to_user

agent = Agent(tools=[handoff_to_user])

# Request user input and continue
response = agent.tool.handoff_to_user(
    message="I need your approval to proceed. Type 'yes' to confirm.",
    breakout_of_loop=False
)

# Complete handoff to user (stops agent execution)
agent.tool.handoff_to_user(
    message="Task completed. Please review the results.",
    breakout_of_loop=True
)
```

### Production Deployment

This tool is designed for terminal environments as an example implementation. For production applications, you may want to implement custom handoff mechanisms tailored to your specific UI/UX requirements, such as:

- Web interfaces
- Messaging platforms
- Custom approval workflows
- Mobile apps

---

## Summary

| Category | Included In |
|----------|------------|
| **Tool Executors** | Both SDKs (TypeScript & Python) |
| **Vended Tools** | Both SDKs - included by default |
| **Community Tools** | Python only - requires `pip install strands-agents-tools` |

---

## See Also

- [Custom Tools](./custom-tools) — Build your own tools
- [Agent Loop](./strands-agent-loop-guide.md) — Understanding agent tool execution
- [Hooks](./strands-hooks-guide.md) — Intercept and customize tool execution
- [Session Management](./strands-session-management-guide.md) — Persist agent state including notebooks
