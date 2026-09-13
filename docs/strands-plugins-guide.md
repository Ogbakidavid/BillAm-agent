# Strands Agent SDK: Plugins Guide

## Overview

Plugins allow you to change the typical behavior of an agent. They enable you to introduce concepts like Skills, steering, or other behavioral modifications into the agentic loop. Plugins work by taking advantage of the low-level primitives exposed by the Agent class—`model`, `systemPrompt`, `messages`, `tools`, and `hooks`—and executing logic to improve an agent's behavior.

### Built-in Plugins

The Strands SDK provides built-in plugins that you can use out of the box:

- **Skills** - On-demand, modular instructions that agents discover and activate at runtime following the [Agent Skills specification](https://github.com/strands-ai/agent-skills)
- **Steering** - Modular prompting for complex agent tasks through context-aware guidance
- **Context Offloader** - Proactively offloads oversized tool results to storage, replacing them with previews and providing a built-in retrieval tool
- **Context Injector** - Folds real-time text (a clock, environment facts, a lookup) into the model input before each call, without persisting it to history
- **GoalLoop** - Retry loop with validation and feedback injection until a quality bar is met
- **Custom Plugins** - Build and distribute your own plugins to extend agent functionality

You can also build and distribute your own plugins to extend agent functionality. See **Get Featured** to share your plugins with the community.

### Using Plugins

Plugins are passed to agents during initialization via the `plugins` parameter:

```typescript
import { Agent, Plugin, Tool } from '@strands-agents/sdk'

// Create an agent with plugins
const agent = new Agent({
  tools: [myTool],
  plugins: [new GuidancePlugin('Guide the agent...')],
})
```

---

## Building Plugins

This section walks through how to build a custom plugin step by step.

### Basic Plugin Structure

A plugin is a class that implements the `Plugin` interface and defines a `name` property. For example, a simple logging plugin would look like this:

```typescript
import { Agent, FunctionTool, Plugin, Tool } from '@strands-agents/sdk'
import { BeforeToolCallEvent, AfterToolCallEvent } from '@strands-agents/sdk'

class LoggingPlugin implements Plugin {
  name = 'logging-plugin'

  initAgent(agent: LocalAgent): void {
    // Register hooks manually in initAgent
    agent.addHook(BeforeToolCallEvent, (event) => {
      console.log(`[LOG] Calling tool: ${event.toolUse.name}`)
      console.log(`[LOG] Input: ${JSON.stringify(event.toolUse.input)}`)
    })

    agent.addHook(AfterToolCallEvent, (event) => {
      console.log(`[LOG] Tool completed: ${event.toolUse.name}`)
    })
  }

  getTools(): Tool[] {
    // Provide additional tools via the plugin
    return [debugPrintTool]
  }
}

// Using the plugin
const agent = new Agent({
  plugins: [new LoggingPlugin()],
})

// Custom tool to add
const debugPrintTool = new FunctionTool({
  name: 'debug_print',
  description: 'Print a debug message',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The message to print' },
    },
    required: ['message'],
  },
  callback: async (input: unknown) => {
    const typedInput = input as { message: string }
    console.log(`[DEBUG] ${typedInput.message}`)
    return `Printed: ${typedInput.message}`
  },
})
```

### How It Works Under the Hood

When you attach a plugin to an agent, the following happens:

```
Plugin Attached
    ↓
Discover Tools (@tool / getTools)
    ↓
Add Tools
    ↓
Initialize (init_agent / initAgent)
    ↓
Register Hooks (@hook / addHook)
    ↓
Plugin Ready
```

The lifecycle:

1. **Tool Registration**: The `getTools()` method is called to get tools provided by the plugin
2. **Initialization**: The `initAgent(agent)` method is called for hook registration and setup
3. **Hook Registration**: In `initAgent`, use `agent.addHook()` to register event callbacks manually

> **Note**: TypeScript does not use `@hook` or `@tool` decorators. Instead, tools are returned from `getTools()` and hooks are registered manually in `initAgent()`.

### Registering Hooks in Plugins

#### Manual Hook Registration

TypeScript plugins register hooks manually in the `initAgent` method using `agent.addHook()`:

```typescript
import { Plugin } from '@strands-agents/sdk'
import { BeforeModelCallEvent, AfterModelCallEvent } from '@strands-agents/sdk'

class ModelMonitorPlugin implements Plugin {
  name = 'model-monitor'

  initAgent(agent: LocalAgent): void {
    // Register a hook for a single event type
    agent.addHook(BeforeModelCallEvent, () => {
      console.log('Model call starting...')
    })

    // Register the same handler for multiple event types (union equivalent)
    const onModelEvent = (event: BeforeModelCallEvent | AfterModelCallEvent) => {
      console.log(`Model event: ${event.constructor.name}`)
    }
    agent.addHook(BeforeModelCallEvent, onModelEvent)
    agent.addHook(AfterModelCallEvent, onModelEvent)
  }
}
```

#### Manual Hook and Tool Registration

For more control, you can manually register hooks and tools in the `initAgent` method:

```typescript
import { Plugin } from '@strands-agents/sdk'
import { BeforeToolCallEvent } from '@strands-agents/sdk'

class ManualPlugin implements Plugin {
  private verbose: boolean

  name = 'manual-plugin'

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose ?? false
  }

  initAgent(agent: LocalAgent): void {
    // Conditionally register additional hooks
    if (this.verbose) {
      agent.addHook(BeforeToolCallEvent, (event) => {
        console.log(`[VERBOSE] ${JSON.stringify(event.toolUse)}`)
      })
    }

    // Access agent tools via toolRegistry
    console.log(`Attached to agent with ${agent.toolRegistry.list().length} tools`)
  }
}
```

### Managing Plugin State

Plugins can maintain state that persists across agent invocations. For state that needs to be serialized or shared, use the Agent State mechanism:

```typescript
import { Agent, Plugin } from '@strands-agents/sdk'
import { BeforeToolCallEvent } from '@strands-agents/sdk'

class MetricsPlugin implements Plugin {
  name = 'metrics-plugin'

  initAgent(agent: LocalAgent): void {
    // Initialize state values if not present
    if (!agent.appState.get('metrics_call_count')) {
      agent.appState.set('metrics_call_count', 0)
    }

    agent.addHook(BeforeToolCallEvent, () => {
      const current = (agent.appState.get('metrics_call_count') as number) ?? 0
      agent.appState.set('metrics_call_count', current + 1)
    })
  }
}

// Usage
const metricsPlugin = new MetricsPlugin()
const agent = new Agent({
  plugins: [metricsPlugin],
})
console.log(`Tool calls: ${agent.appState.get('metrics_call_count')}`)
```

See **Agent State** for more information on state management.

### Async Plugin Initialization

Plugins can perform asynchronous initialization:

```typescript
import { Plugin } from '@strands-agents/sdk'
import { BeforeToolCallEvent } from '@strands-agents/sdk'

class AsyncConfigPlugin implements Plugin {
  private config: Record<string, unknown> = {}

  name = 'async-config'

  async initAgent(agent: LocalAgent): Promise<void> {
    // Async initialization
    this.config = await this.loadConfig()

    agent.addHook(BeforeToolCallEvent, () => {
      console.log(`Config: ${JSON.stringify(this.config)}`)
    })
  }

  private async loadConfig(): Promise<Record<string, unknown>> {
    await new Promise((resolve) => setTimeout(resolve, 100)) // Simulate async operation
    return { setting: 'value' }
  }
}
```

---

## Part 1: Skills

Skills give your agent on-demand access to specialized instructions without bloating the system prompt. Instead of front-loading every possible instruction into a single prompt, you define modular skill packages that the agent discovers and activates only when relevant.

The AgentSkills plugin follows the **Agent Skills specification** and uses progressive disclosure: lightweight metadata (name and description) is injected into the system prompt, and full instructions are loaded on-demand when the agent activates a skill through a tool call. This keeps the context window lean while giving the agent access to deep, specialized knowledge.

### What are Skills?

As agents take on more complex tasks, their system prompts grow. A single agent handling PDF processing, data analysis, code review, and email drafting can end up with a massive prompt containing instructions for every capability. This leads to several problems:

- **Context window bloat** — Large prompts consume tokens that could be used for reasoning and conversation
- **Instruction confusion** — Models struggle to follow dozens of unrelated instructions packed into one prompt
- **Maintenance burden** — Monolithic prompts are hard to update, version, and share across teams

Skills solve this by breaking instructions into self-contained packages. The agent sees a menu of available skills and loads the full instructions only when it needs them — similar to how a developer opens a reference manual only when working on a specific task.

### How Skills Work

The AgentSkills plugin operates in three phases:

```
Developer
    ↓
AgentSkills(skills=["./skills/pdf-processing"])
    ↓
Load skill metadata (name + description)
    ↓
Agent
    ↓
Inject metadata XML into system prompt
    ↓
Agent sees available skills in system prompt
    ↓
skills(skill_name="pdf-processing")
    ↓
Return full instructions + resource listing
    ↓
Agent follows skill instructions
```

1. **Discovery** — On initialization, the plugin reads skill metadata (name and description) and injects it as an XML block into the agent's system prompt. The agent can see what skills are available without loading their full instructions.

2. **Activation** — When the agent determines it needs a skill, it calls the skills tool with the skill name. The tool returns the complete instructions, metadata, and a listing of any available resource files.

3. **Execution** — The agent follows the loaded instructions. If the skill includes resource files (scripts, reference documents, assets), the agent can access them through whatever tools you've provided.

The injected system prompt metadata looks like this:

```xml
<available_skills>
<skill>
<name>pdf-processing</name>
<description>Extract text and tables from PDF files.</description>
<location>/path/to/pdf-processing/SKILL.md</location>
</skill>
</available_skills>
```

This XML block is refreshed before each invocation, so changes to available skills (through `setAvailableSkills`) take effect immediately. Activated skills are tracked in agent state for session persistence.

### Usage

The AgentSkills plugin accepts skill sources in several forms — filesystem paths, parent directories, HTTPS URLs, or programmatic Skill instances.

```typescript
import { Agent } from '@strands-agents/sdk'
import { AgentSkills, Skill } from '@strands-agents/sdk/vended-plugins/skills'

// Single skill directory
const plugin = new AgentSkills({
  skills: ['./skills/pdf-processing'],
})

// Parent directory — loads all child directories
// containing SKILL.md
const pluginFromDir = new AgentSkills({
  skills: ['./skills/'],
})

// Mixed sources
const pluginMixed = new AgentSkills({
  skills: [
    './skills/pdf-processing',
    './skills/',
    new Skill({
      name: 'custom-greeting',
      description: 'Generate custom greetings',
      instructions: 'Always greet the user by name with enthusiasm.',
    }),
  ],
})

const agent = new Agent({
  model,
  plugins: [pluginMixed],
})
```

### Providing Tools for Resource Access

The AgentSkills plugin handles only skill discovery and activation. It does not bundle tools for reading files or executing scripts. This is deliberate — it keeps the plugin decoupled from any assumptions about where skills live or how resources are accessed.

When a skill is activated, the tool response includes a listing of available resource files (from `scripts/`, `references/`, and `assets/` subdirectories), but to actually read those files or run scripts, you provide your own tools. This gives you full control over what the agent can access.

For filesystem-based skills, the vended `bash` and `fileEditor` tools are the easiest way to get started:

```typescript
import { Agent } from '@strands-agents/sdk'
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills'
import { bash } from '@strands-agents/sdk/vended-tools/bash'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'

const plugin = new AgentSkills({
  skills: ['./skills/'],
})

const agent = new Agent({
  model,
  plugins: [plugin],
  tools: [bash, fileEditor],
})
```

### Programmatic Skill Creation

Use the `Skill` class to create skills in code without filesystem directories:

```typescript
import { Skill } from '@strands-agents/sdk/vended-plugins/skills'

// Create directly
const skill = new Skill({
  name: 'code-review',
  description: 'Review code for best practices and bugs',
  instructions: 'Review the provided code. Check for...',
})

// Parse from SKILL.md content
const parsed = Skill.fromContent(
  '---\n' +
    'name: code-review\n' +
    'description: Review code for best practices\n' +
    '---\n' +
    'Review the provided code. Check for...\n'
)

// Load from a specific directory
const loaded = Skill.fromFile('./skills/code-review')

// Load all skills from a parent directory
const skills = Skill.fromDirectory('./skills/')
```

### Managing Skills at Runtime

You can add, replace, or inspect skills after the plugin is created. Changes take effect on the next agent invocation because the plugin refreshes the system prompt XML before each call.

```typescript
import { Agent } from '@strands-agents/sdk'
import { AgentSkills, Skill } from '@strands-agents/sdk/vended-plugins/skills'

const plugin = new AgentSkills({
  skills: ['./skills/pdf-processing'],
})
const agent = new Agent({ model, plugins: [plugin] })

// View available skills
const available = await plugin.getAvailableSkills()
for (const skill of available) {
  console.log(`${skill.name}: ${skill.description}`)
}

// Add a new skill at runtime
const newSkill = new Skill({
  name: 'summarize',
  description: 'Summarize long documents',
  instructions: 'Read the document and produce a concise summary...',
})
plugin.setAvailableSkills([...available, newSkill])

// Replace all skills
plugin.setAvailableSkills(['./skills/new-set/'])

// Check which skills the agent has activated
const activated = plugin.getActivatedSkills(agent)
console.log(`Activated skills: ${activated}`)
```

### SKILL.md Format

Skills follow the Agent Skills specification. A skill is a directory containing a `SKILL.md` file with YAML frontmatter and markdown instructions.

```markdown
---
name: pdf-processing
description: Extract text and tables from PDF files
allowed-tools: file_read shell
---
# PDF processing

You are a PDF processing expert. When asked to extract content from a PDF:

1. Use `shell` to run the extraction script at `scripts/extract.py`
2. Use `file_read` to review the output
3. Summarize the extracted content for the user
```

#### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier. Lowercase alphanumeric and hyphens, 1–64 characters. |
| `description` | Yes | What the skill does. This text appears in the system prompt. |
| `allowed-tools` | No | Space-delimited list of tool names the skill uses. |
| `metadata` | No | Additional key-value pairs for custom data. |
| `license` | No | License identifier (for example, Apache-2.0). |
| `compatibility` | No | Compatibility information string. |

**allowed-tools behavior**: The allowed-tools field is currently informational. When a skill is activated, the listed tool names are included in the instructions returned to the agent, but tool access is not enforced or restricted at runtime. This field is still experimental in the Agent Skills specification.

**Name validation**: Skill names must match the parent directory name. By default, validation issues produce warnings rather than errors. Pass `strict: true` to raise exceptions instead.

### Resource Directories

Skills can include resource files organized in three standard subdirectories:

```
my-skill/
├── SKILL.md
├── scripts/       # Executable scripts the agent can run
│   └── process.py
├── references/    # Reference documents and guides
│   └── API.md
└── assets/        # Static files (templates, configs, data)
    └── template.json
```

When the agent activates a skill, the tool response includes a listing of all resource files found in these directories. The agent can then use the tools you've provided to access them.

### Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `skills` | SkillSource[] | Required | Array of skill sources (paths, Skill instances, or HTTPS URLs). |
| `stateKey` | string | 'agent_skills' | Key for storing plugin state in agent.appState. |
| `maxResourceFiles` | number | 20 | Maximum number of resource files listed in skill activation responses. |
| `strict` | boolean | false | If true, throw on validation issues instead of logging warnings. |

Activated skills are tracked in agent state under the configured state key. This means activated skills persist across invocations within the same session and can be serialized for session management.

### Comparison with Other Approaches

| Approach | Best for | Trade-off |
|----------|----------|-----------|
| System prompt | Small, always-relevant instructions | Grows unwieldy with many capabilities |
| Steering | Dynamic, context-aware guidance and validation | More complex to set up |
| **Skills** | **Modular, domain-specific instruction sets** | **Requires a tool call to activate** |
| Multi-agent | Fundamentally different roles or models | Higher complexity and latency |

Use skills when you want a single agent that can handle a wide range of tasks by loading the right instructions at the right time, without the overhead of a multi-agent architecture.

---

## Part 2: Steering (Plugins)

> **Language Support**: This feature is only supported in Python. In TypeScript, steering handlers use the **interventions** framework rather than plugins. See Steering (Interventions) for the full TypeScript API reference.

Steering provides modular prompting for complex agent tasks through context-aware guidance that appears when relevant, rather than front-loading all instructions in monolithic prompts. This lets you assign agents complex, multi-step tasks while maintaining effectiveness through just-in-time feedback loops.

### What Is Steering?

Building agents for complex multi-step tasks runs into a prompting wall. Traditional approaches require front-loading all instructions, business rules, and operational guidance into a single prompt. For tasks with 30+ steps, monolithic prompts become unwieldy: agents ignore instructions, hallucinate behaviors, or fail to follow critical procedures.

A common workaround is decomposing the agent into a graph with predefined nodes and edges that control execution flow. While this improves predictability and reduces prompt complexity, it limits the adaptive reasoning that makes agents valuable in the first place, and it is costly to maintain as requirements change.

Steering takes a different approach: **modular prompting**. Instead of front-loading all instructions, you define context-aware steering handlers that provide feedback at the right moment. Each handler defines the business rules to enforce and the lifecycle hooks where agent behavior should be validated, like before a tool call or before returning output to the user.

### Context Population

To give the handler something to reason about, attach a provider that observes agent activity and records it as steering context.

```
Hook Events → Context Providers → Update Steering Context → Handler Access
```

Context providers observe agent activity and contribute structured data into the handler's steering context. The built-in tool ledger provider tracks tool call history, timing, and results. Steering handlers read from this context when deciding whether to intervene.

### Steering Moments

#### Before a Tool Call

When you want the handler to validate a tool call before it runs:

```
Tool Call Attempt
    ↓
BeforeToolCallEvent
    ↓
Handler Evaluates Call
    ↓
Steering Action
    ↓
├─→ Approve → Tool Executes
├─→ Guide → Cancel + Feedback
└─→ Pause for Human → Human Input
```

The handler returns one of three actions:

- **Proceed**: Tool executes immediately
- **Guide**: Tool is cancelled, agent receives contextual feedback
- **Interrupt**: Tool execution pauses for human input

#### After a Model Response

When you want the handler to validate the model's output before it reaches the user:

```
Model Response
    ↓
AfterModelCallEvent
    ↓
Handler Evaluates Output
    ↓
Steering Action
    ↓
├─→ Approve → Response Accepted
└─→ Guide → Discard + Retry
```

The handler returns one of two actions:

- **Proceed**: Accept the response as-is
- **Guide**: Discard the response and retry with guidance injected into the conversation

After-model steering enables handlers to validate responses, ensure required tools are used before completion, or guide conversation flow based on output.

### Getting Started

#### Natural Language Steering

When you want to express guidance in plain English rather than imperative code, use the `LLMSteeringHandler`. The handler operates on whatever context you provide and makes contextual decisions across the full steering context.

For best practices on writing steering prompts, see the Agent Standard Operating Procedures (SOP) framework, which provides structured templates for effective agent prompts.

Steering handlers are attached via `plugins=[handler]` on the agent:

```python
from strands import Agent, tool
from strands.vended_plugins.steering import LLMSteeringHandler

@tool
def send_email(recipient: str, subject: str, message: str) -> str:
    """Send an email to a recipient."""
    return f"Email sent to {recipient}"

handler = LLMSteeringHandler(
    system_prompt="""
    You are providing guidance to ensure emails maintain a cheerful, positive tone.

    Guidance:
    - Review email content for tone and sentiment
    - Suggest more cheerful phrasing if the message seems negative or neutral
    - Encourage use of positive language and friendly greetings

    When agents attempt to send emails, check if the message tone
    is appropriately cheerful and provide feedback if improvements are needed.
    """
)

agent = Agent(
    tools=[send_email],
    plugins=[handler],
)

agent(
    "Send a frustrated email to tom@example.com, "
    "a client who keeps rescheduling important meetings at the last minute"
)
print(agent.messages)

# Typical: agent.messages includes a cancelled send_email ToolUseBlock,
# a guidance message, then a retried send_email with cheerier wording.
```

#### Tool Ledger Provider

The tool ledger provider tracks tool call history for audit trails and usage-based guidance. It captures every tool invocation with inputs, execution time, and success/failure status.

The ledger captures:

- **Tool Call History**: Every tool invocation with inputs, execution time, and result status. Before tool calls, it records pending status with timestamp and arguments. After tool calls, it updates with completion timestamp, final status, results, and any errors.
- **Session Metadata**: Session start time and other context that persists across the handler's lifecycle.
- **Structured Data**: The ledger is stored in JSON-serializable form in the handler's steering context, making it directly accessible to LLM-based steering decisions.

The `LedgerProvider` retains all tool calls for the lifetime of the handler instance.

### Comparison with Other Approaches

#### Steering vs. Workflow Frameworks

Workflow frameworks force you to specify discrete steps and control flow logic upfront, making agents brittle and requiring extensive developer time to define complex decision trees. When business requirements change, you rebuild the workflow logic. Steering uses modular prompting where you define contextual guidance that appears when relevant rather than prescribing exact execution paths. This maintains the adaptive reasoning that makes agents valuable while enabling reliable execution of complex procedures.

#### Steering vs. Traditional Prompting

Traditional prompting requires front-loading all instructions into a single prompt. For complex tasks with 30+ steps, this leads to prompt bloat where agents ignore instructions, hallucinate behaviors, or fail to follow critical procedures. Steering provides context-aware reminders that appear at the right moment, like post-it notes that guide agents when they need specific information. This keeps context windows lean while maintaining agent effectiveness on complex tasks.

---

## Part 3: Context Offloader

The ContextOffloader plugin prevents large tool results from consuming your agent's context window. When a tool returns a result that exceeds a configurable token threshold, the plugin stores each content block individually in an external storage backend and replaces it in the conversation with a truncated preview plus per-block references. Each offloaded result includes inline guidance telling the agent to use its available tools to selectively access the data it needs.

### The Problem

Tools like file readers, API clients, and database queries can return results that are tens or hundreds of thousands of characters long. When these large results enter the conversation, they crowd out other context and can exceed the model's token limits.

The default `SlidingWindowConversationManager` handles this reactively — after the context overflows, it truncates tool results to the first and last 200 characters. This works as a safety net, but the truncation is lossy (the middle content is gone permanently) and happens after a failed API call has already been wasted.

ContextOffloader takes a **proactive approach**: it intercepts results at tool execution time, before they enter the conversation, so the overflow never happens in the first place.

### How It Works

After each tool call, the plugin estimates the result's token count and compares it against the `maxResultTokens` threshold (default: 2,500 tokens). If the result exceeds it, the plugin:

1. **Stores** each content block individually in the configured storage backend, preserving its content type
2. **Replaces** the in-context result with the first `previewTokens` tokens (default: 1,000) plus per-block storage references

Token estimation uses `model.countTokens()`, which delegates to the model provider's native counting API if available, otherwise falling back to a character-based heuristic (chars/4 for text, chars/2 for JSON).

Results under the threshold pass through unchanged.

### What the Agent Sees

For a tool that returns 150KB of JSON, the agent would see something like:

```
{"users": [{"id": 1, "name": "Alice", ...}, {"id": 2, "name": "Bob", ...},
... (first ~1,000 tokens of the result) ...

[Full content offloaded to storage - reference: a1b2c3d4]
```

For non-text content, the plugin replaces the result with a descriptive placeholder plus a reference:

| Content Type | What the agent sees |
|--------------|-------------------|
| Text / JSON | First previewTokens tokens + storage reference |
| Image | `[image: format, N bytes]` placeholder + storage reference |
| Document | `[document: format, name, N bytes]` placeholder + storage reference |

### Getting Started

#### Quick Setup

Pass a `ContextOffloader` instance to your agent's plugins list with a Storage backend:

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextOffloader } from '@strands-agents/sdk/vended-plugins/context-offloader'
import { InMemoryStorage } from '@strands-agents/sdk/storage'

const agent = new Agent({
  plugins: [
    new ContextOffloader({ storage: new InMemoryStorage() }),
  ],
})
```

#### Custom Token Thresholds

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextOffloader } from '@strands-agents/sdk/vended-plugins/context-offloader'
import { InMemoryStorage } from '@strands-agents/sdk/storage'

const agent = new Agent({
  plugins: [
    new ContextOffloader({
      storage: new InMemoryStorage(),
      maxResultTokens: 5_000,
      previewTokens: 2_000,
    }),
  ],
})
```

### Storage Backends

ContextOffloader accepts any Storage backend. Choose one based on your durability needs:

| Backend | Persistence | Best for |
|---------|-------------|----------|
| InMemoryStorage | Process lifetime only | Testing, serverless, short-lived agents |
| LocalFileStorage | Local disk | Development, debugging, inspecting stored artifacts |
| S3Storage | Amazon S3 | Production workloads, shared or durable artifact retention |

#### InMemoryStorage

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextOffloader } from '@strands-agents/sdk/vended-plugins/context-offloader'
import { InMemoryStorage } from '@strands-agents/sdk/storage'

const agent = new Agent({
  plugins: [
    new ContextOffloader({ storage: new InMemoryStorage() }),
  ],
})
```

#### LocalFileStorage

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextOffloader } from '@strands-agents/sdk/vended-plugins/context-offloader'
import { LocalFileStorage } from '@strands-agents/sdk/storage'

const agent = new Agent({
  plugins: [
    new ContextOffloader({
      storage: new LocalFileStorage('./artifacts/'),
    }),
  ],
})
```

#### S3Storage

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextOffloader } from '@strands-agents/sdk/vended-plugins/context-offloader'
import { S3Storage } from '@strands-agents/sdk/storage'

const agent = new Agent({
  plugins: [
    new ContextOffloader({
      storage: new S3Storage('my-agent-artifacts', {
        prefix: 'tool-results/',
      }),
    }),
  ],
})
```

#### Eviction

Offloaded entries are automatically deleted after `evictAfterCycles` agent loop cycles (default: 20). Set to `null` to disable.

```typescript
// Custom eviction window
const agent2 = new Agent({
  plugins: [
    new ContextOffloader({
      storage: new InMemoryStorage(),
      evictAfterCycles: 50,
    }),
  ],
})

// Disable eviction
const agent3 = new Agent({
  plugins: [
    new ContextOffloader({
      storage: new InMemoryStorage(),
      evictAfterCycles: null,
    }),
  ],
})
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `storage` | (required) | Storage backend instance |
| `maxResultTokens` | 2_500 | Results whose estimated token count exceeds this are offloaded |
| `previewTokens` | 1_000 | Number of tokens to keep as an in-context preview |
| `includeRetrievalTool` | true | Registers a retrieve_offloaded_content tool the agent can use to fetch full content by reference. Enabled by default; set to false to disable |

### Retrieval Tool

The plugin includes a `retrieve_offloaded_content` tool that lets the agent fetch offloaded content by reference, returning it in its native format — text as a string, JSON as a JSON block, images as image blocks, and documents as document blocks. This tool is registered by default.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `reference` | string | (required) Storage reference from the offloaded result |
| `pattern` | string | Regex or keyword to grep for |
| `line_range` | { start: number; end: number } | 1-indexed inclusive line span to retrieve |
| `context_lines` | number | Lines of context around pattern matches (default: 5) |

**Retrieval modes**:

- **Pattern search** — Provide pattern to grep for regex/keyword matches with configurable context_lines
- **Line range** — Provide line_range for random access to specific line numbers
- **Combined** — Provide both pattern and line_range to search within a specific range
- **Head** — Provide only context_lines without a pattern or line_range to return the first N lines of the content
- **Full retrieval** — Omit all optional parameters to retrieve everything (discouraged for large content)

### Retrieval Example

1. **Tool result gets offloaded** (replaces original result inline)

```
[Offloaded: 1 blocks, ~10,000 tokens]
Tool result was offloaded to external storage due to size.
Use the preview below if it answers your question.
If you need more detail, use retrieve_offloaded_content with a reference and:
  - pattern: regex or keyword to find matching lines with context
  - line_range: { start, end } to read a specific span of lines
Retrieve full content (omit pattern/line_range) as a last resort.

{"users":[{"id":1,"name":"Alice","role":"admin"},{"id":2,"name":"Bob","role":"user"},{"id":3,"name":"Charlie","rol

[Stored references:]
  mem_1_tool-123_0 (json, 42,000 bytes)
```

2. **Agent searches with a pattern**

```
Input: { reference: "mem_1_tool-123_0", pattern: "admin", context_lines: 2 }

[2 matches for /admin/]

   1| {
   2|   "users": [
>  3|     { "id": 1, "name": "Alice", "role": "admin" },
   4|     { "id": 2, "name": "Bob", "role": "user" },
   5|     { "id": 3, "name": "Charlie", "role": "user" },
---
  48|     { "id": 15, "name": "Dana", "role": "user" },
> 49|     { "id": 16, "name": "Eve", "role": "admin" },
  50|     { "id": 17, "name": "Frank", "role": "user" }
  51|   ]
```

### Using Other Tools for Retrieval

When using `LocalFileStorage`, the agent can use its existing tools (shell, grep, cat, etc.) to access offloaded content directly from the file system:

```bash
grep -n "admin" ./artifacts/mem_1_tool-123_0
cat ./artifacts/mem_1_tool-123_0 | head -50
sed -n '45,55p' ./artifacts/mem_1_tool-123_0
```

With `S3Storage`, the agent can use the AWS CLI:

```bash
aws s3 cp s3://my-agent-artifacts/tool-results/mem_1_tool-123_0 - | grep -n "admin"
aws s3 cp s3://my-agent-artifacts/tool-results/mem_1_tool-123_0 - | head -50
```

With `InMemoryStorage`, there is no external access path — the built-in retrieval tool is the only way to access offloaded content.

To disable the built-in retrieval tool and rely on the agent's own tools:

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextOffloader } from '@strands-agents/sdk/vended-plugins/context-offloader'
import { LocalFileStorage } from '@strands-agents/sdk/storage'
import { bash } from '@strands-agents/sdk/vended-tools/bash'
import { fileEditor } from '@strands-agents/sdk/vended-tools/file-editor'

const agent = new Agent({
  tools: [bash, fileEditor],
  plugins: [
    new ContextOffloader({
      storage: new LocalFileStorage('./artifacts/'),
      includeRetrievalTool: false,
    }),
  ],
})
```

### Tradeoffs

- **Preview vs. full content**: The agent reasons over the preview, not the full result. If the answer is buried deep in a large result, the agent may miss it. Tune `previewTokens` to balance context usage against information loss for your use case. The `retrieve_offloaded_content` tool is enabled by default so the agent can fetch full offloaded content as a fallback.

- **Storage costs**: S3Storage incurs S3 PUT/GET and storage charges. LocalFileStorage writes to disk on every large result.

- **Eviction**: Offloaded entries are deleted after 20 agent loop cycles by default (configurable via `evictAfterCycles`). Evicted content is permanently lost. Increase the value or pass `null` to disable eviction if your agent revisits offloaded content after many turns.

- **Not a replacement for conversation management**: This plugin handles individual large results. You still need a conversation manager like `SlidingWindowConversationManager` to handle overall context growth across many turns.

---

## Part 4: Context Injector

The ContextInjector plugin folds real-time text into the model input before each call. The text is added to that single call's input only: it is never written to the conversation history, so it is not persisted or replayed on later turns. Use it for context the agent should always have but that does not belong in the stored history: the current time, a sandbox descriptor, environment facts, or a retrieval lookup.

### How It Works

A ContextInjector has two parts:

1. **Callback function** decides what text to fold into the next model call's input
2. **Trigger** decides when the callback is called

The injected text is ephemeral by design: it augments the model input for that one call and never persists into the durable conversation or session.

This is the same injection mechanism that powers memory context injection. ContextInjector is the generic surface for any consumer.

### Getting Started

Pass a `ContextInjector` to your agent's plugins list with a callback that renders the text to inject. By default it injects only on a fresh user turn, the common case for chat agents:

```typescript
import { Agent } from '@strands-agents/sdk'
import { ContextInjector } from '@strands-agents/sdk/vended-plugins/context-injector'

const agent = new Agent({
  plugins: [
    new ContextInjector({
      renderContent: async () => `<now>${new Date().toISOString()}</now>`,
    }),
  ],
})
```

### When to Inject

The trigger controls when the callback runs:

- **'userTurn'** (the default) injects only when the latest message is a fresh user ask, a user message carrying no tool result. This is the common case for chat agents.
- **'everyTurn'** injects before every model call, including mid-task tool-result turns. Use it for autonomous agents that should consult the injected context at each step.

```typescript
import { ContextInjector } from '@strands-agents/sdk/vended-plugins/context-injector'

const clock = new ContextInjector({
  name: 'clock',
  trigger: 'everyTurn', // inject before every model call, not just fresh user asks
  renderContent: async () => `<now>${new Date().toISOString()}</now>`,
})
```

For finer control, pass a predicate: a function that receives the injection context and returns whether to inject this call. The context carries the current messages, durable state shared across calls via `context.appState`, and the agent. A predicate that throws fails open, so the model call still proceeds:

```typescript
import { ContextInjector } from '@strands-agents/sdk/vended-plugins/context-injector'
import type { InjectionContext } from '@strands-agents/sdk/vended-plugins/context-injector'

const injector = new ContextInjector({
  // Inject only when a tool stashed a flag in app state last turn.
  trigger: ({ appState }: InjectionContext) => appState.get('recallEnabled') === true,
  renderContent: async ({ messages }) =>
    `<context>${messages.length} turns so far</context>`,
})
```

### Configuration

| Field | Purpose |
|-------|---------|
| `renderContent` | Returns the text to inject for this call, or undefined / empty string to skip. Required, and the only positional argument. |
| `trigger` | 'userTurn' (default), 'everyTurn', or a predicate over the injection context. |
| `name` | Plugin name for logging and duplicate detection. Defaults to 'strands:context-injector'. Set a distinct name when registering more than one. |

### Security

Injected text reaches the model verbatim. The rendered text is a prompt-injection surface. If it interpolates attacker-influenced data (tool output, user-derived state), escape it yourself before returning. A callback that throws fails open: injection is skipped and the model call proceeds.

### Related

Memory builds on this engine to inject retrieved knowledge before a model call.

---

## Part 5: GoalLoop

When your agent's response needs to meet a quality bar before returning, GoalLoop handles the retry loop. It validates the response after each invocation, feeds feedback back as a user message on failure, and re-invokes the agent. This continues until validation passes, a max attempt count is reached, or a timeout elapses.

### The Problem

A single-pass agent response often misses the mark: too verbose, wrong format, incomplete reasoning, or failing a test suite. You could wrap the agent call in a manual retry loop, but that means reimplementing timeout logic, attempt tracking, feedback injection, and state management every time.

GoalLoop handles all of that as a plugin. Define what "done" means, attach it to your agent, and the retry loop runs automatically inside the existing hook lifecycle.

### How It Works

```
invoke Agent responds
    ↓
Validate
    ↓
├─ pass → Done
└─ fail → Inject feedback → (loop)
```

1. The agent processes the prompt and produces a response.
2. GoalLoop extracts the last assistant message and runs the validator.
3. If the validator passes, the loop terminates with a "satisfied" result.
4. If the validator fails and budget remains, GoalLoop injects feedback as a new user message and re-invokes the agent.
5. If the attempt limit or timeout is exhausted, the loop terminates without retrying.

### Getting Started

Pass a natural-language goal string. GoalLoop builds an internal judge agent (using the host agent's model) that grades each response against the goal and returns structured feedback on failure.

```typescript
import { Agent } from '@strands-agents/sdk'
import { GoalLoop } from '@strands-agents/sdk/vended-plugins/goal'

const concise = new GoalLoop({
  goal: 'At most 3 sentences, accessible to a 10-year-old, '
    + 'no jargon.',
  maxAttempts: 3,
})

const agent = new Agent({ plugins: [concise] })
await agent.invoke('Explain how rainbows form.')
console.log(concise.lastResult(agent))

// Typical output:
// { passed: true, stopReason: 'satisfied', attempts: [...] }
```

### Programmatic Validators

For checks that don't need a language model (word count, schema conformance, test suite exit codes), pass a function as goal. This skips the judge agent entirely.

A validator receives the last assistant message and the host agent. It returns:

- `true` / `false` (shorthand: pass or fail with no feedback)
- A dict/object with `passed` and optional `feedback`
- A `ValidationOutcome` instance

```typescript
import { Message } from '@strands-agents/sdk'
import { GoalLoop } from '@strands-agents/sdk/vended-plugins/goal'

function wordCountValidator(response: Message) {
  const text = response.content
    .flatMap((b) => (b.type === 'textBlock' ? [b.text] : []))
    .join(' ')
  const words = text.trim().split(/\s+/).length
  if (words <= 50) return true
  return { passed: false, feedback: `Too long (${words} words). Cap at 50.` }
}

const plugin = new GoalLoop({
  goal: wordCountValidator,
  maxAttempts: 5,
  timeout: 30_000,
})
```

#### Async Validators

Async validators work too. Run a test suite, call an external API, or await any I/O inside the validator:

```typescript
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { GoalLoop } from '@strands-agents/sdk/vended-plugins/goal'

const execAsync = promisify(exec)

const plugin = new GoalLoop({
  goal: async () => {
    try {
      await execAsync('npm test')
      return true
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string }
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.slice(-4000)
      return {
        passed: false,
        feedback: `Tests failed.\n${out}`,
      }
    }
  },
  maxAttempts: 10,
})
```

### Configuration Reference

| Parameter | Default | Description |
|-----------|---------|-------------|
| `goal` | (required) | Natural-language string (judged by internal agent) or Validator function |
| `maxAttempts` | Infinity | Maximum attempts before stopping |
| `timeout` | Infinity | Wall-clock budget in milliseconds for the entire run |
| `judge` | undefined | JudgeConfig with optional model and systemPrompt for the NL judge |
| `preserveContext` | true | Keep conversation history across retries |
| `resumePromptTemplate` | (built-in) | `(feedback: string \| undefined) => string \| ContentBlock[]` that builds the retry message |
| `name` | "strands:goal-loop" | Plugin name (must be unique per agent) |

When both the attempt limit and timeout are left unbounded (the defaults), the plugin warns at construction time. Set at least one bound in production to prevent runaway loops.

### Advanced Usage

#### Inspecting Results

After an invocation completes, retrieve the result from the plugin to get the full attempt history:

```typescript
const result = plugin.lastResult(agent)
if (result && !result.passed) {
  console.log(
    `Stopped after ${result.attempts.length} attempts`
  )
  console.log(`Reason: ${result.stopReason}`)
  for (const attempt of result.attempts) {
    console.log(`  #${attempt.attempt}: ${attempt.feedback}`)
  }
}
```

The result is `undefined` before the first completed run and while a run is in-flight. It resets at the start of each new invocation.

#### Stateless Retries

By default, the agent sees its own prior attempts and the validator's feedback, letting it build on previous work. Disable context preservation to restore the agent's full session state (messages, system prompt, model state) to the snapshot captured immediately before the first model call. Each retry starts fresh, seeing only the original input plus the latest feedback. Use this when prior attempts would confuse the model rather than help it.

```typescript
const plugin = new GoalLoop({
  goal: testsPass,
  maxAttempts: 10,
  preserveContext: false,
})
```

The snapshot excludes agent state (`appState`) deliberately — other plugins (rate limiters, cost trackers) rely on their mutations persisting across attempts.

#### Custom Judge Configuration

When goal is a string, GoalLoop builds a judge agent from the host agent's model. Override the model or system prompt to tune cost and behavior:

```typescript
import { BedrockModel } from '@strands-agents/sdk'
import { GoalLoop } from '@strands-agents/sdk/vended-plugins/goal'

const plugin = new GoalLoop({
  goal: 'Response must cite at least two sources.',
  maxAttempts: 3,
  judge: {
    model: new BedrockModel({
      modelId: 'us.amazon.nova-lite-v1:0',
    }),
  },
})
```

#### Custom Resume Prompt

Override how feedback is injected before each retry. The template receives the trimmed feedback string (or undefined when the validator gave none) and returns the user message content:

```typescript
const plugin = new GoalLoop({
  goal: '...',
  maxAttempts: 3,
  resumePromptTemplate: (feedback) => {
    if (!feedback) {
      return 'That didn\'t pass. Start over from scratch '
        + 'with a different approach.'
    }
    return `Validation failed:\n${feedback}\n\n`
      + 'Do NOT edit your previous response. Start over '
      + 'from scratch and take a completely different approach.'
  },
})
```

#### Building a Custom Judge

The judge primitives are exported for use in function validators. Build your own judge with a custom model or prompt while reusing the same transcript format:

```typescript
import { Agent } from '@strands-agents/sdk'
import {
  GoalLoop,
  ValidationOutcome,
  buildJudgePrompt,
  JUDGE_SYSTEM_PROMPT,
  JUDGE_OUTCOME_SCHEMA,
} from '@strands-agents/sdk/vended-plugins/goal'

const plugin = new GoalLoop({
  goal: async (_response, agent): Promise<ValidationOutcome> => {
    const judge = new Agent({
      systemPrompt: JUDGE_SYSTEM_PROMPT,
    })
    const result = await judge.invoke(
      buildJudgePrompt('Be concise.', agent.messages),
      { structuredOutputSchema: JUDGE_OUTCOME_SCHEMA }
    )
    return (result.structuredOutput as ValidationOutcome) ?? {
      passed: false,
      feedback: 'Judge produced no structured outcome.',
    }
  },
  maxAttempts: 3,
})
```

### Limitations

- **One GoalLoop per agent**: Attaching a second instance throws at initialization. Compose multiple constraints in a single validator function instead.

- **Timeout is checked between attempts**: Not mid-stream. An in-flight model call runs to completion before timeout fires, so actual wall-clock may exceed the budget by one attempt's duration.

- **NL judge cost**: Each failed attempt spawns a fresh judge agent invocation. For cost-sensitive workloads, use a cheaper model via `judge.model` or switch to a programmatic validator.

---

## Next Steps

- [Hooks](./strands-hooks-guide.md) - Learn about the underlying hook system
- [Agent Loop](./strands-agent-loop-guide.md) - Understanding agent execution
- [Session Management](./strands-session-management-guide.md) - Persist plugin state across sessions
- [Get Featured](./get-featured) - Share your plugins with the community
