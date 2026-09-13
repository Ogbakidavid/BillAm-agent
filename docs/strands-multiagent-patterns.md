# Strands Multi-Agent Patterns Guide

> **⚠️ IMPORTANT NOTE**: This documentation is **NOT required** for session manager implementation. Session management works independently with single agents. Multi-agent patterns are optional architectural choices for when you need orchestration, specialization, or distributed workflows. Reference this only when designing your agent architecture beyond basic session persistence.

---

## Table of Contents

1. [Agents as Tools](#agents-as-tools)
2. [Agent-to-Agent Protocol (A2A)](#agent-to-agent-protocol-a2a)
3. [Swarm Multi-Agent Pattern](#swarm-multi-agent-pattern)
4. [Graph Multi-Agent Pattern](#graph-multi-agent-pattern)
5. [Agent Workflows](#agent-workflows)
6. [When to Use Each Pattern](#when-to-use-each-pattern)

---

## Agents as Tools

### The Concept: Agents as Tools

"Agents as Tools" is an architectural pattern where specialized AI agents are wrapped as callable functions (tools) that can be used by other agents. This creates a hierarchical structure where:

- A primary "orchestrator" agent handles user interaction and determines which specialized agent to call
- Specialized "tool agents" perform domain-specific tasks when called by the orchestrator
- This mimics human team dynamics, where a manager coordinates specialists

```
        User
         │
         ↓
   Orchestrator Agent
    /      │      \
   /       │       \
  ↓        ↓        ↓
Research  Product  Trip
Assistant Recommendation Planning
          Assistant  Assistant
```

### Key Benefits

- **Separation of concerns**: Each agent has focused responsibility
- **Hierarchical delegation**: Clear chain of command
- **Modular architecture**: Add/remove specialists independently
- **Improved performance**: Tailored system prompts and tools per agent

### Implementation Methods

#### 1. Passing Agents Directly (Simplest)

```typescript
const researchAgent = new Agent({
  name: 'research_agent',
  description: 'Provides factual, well-sourced information.',
  systemPrompt: 'You are a specialized research assistant...',
  printer: false,
})

const productAgent = new Agent({
  name: 'product_agent',
  description: 'Provides personalized product suggestions.',
  systemPrompt: 'You are a specialized product recommendation assistant...',
  printer: false,
})

const travelAgent = new Agent({
  name: 'travel_agent',
  description: 'Creates detailed travel itineraries.',
  systemPrompt: 'You are a specialized travel planning assistant...',
  printer: false,
})

// Agents automatically converted to tools
const orchestrator = new Agent({
  systemPrompt: `You are an assistant that routes queries to specialized agents:
- For research questions → Use the research_agent tool
- For product recommendations → Use the product_agent tool
- For travel planning → Use the travel_agent tool`,
  tools: [researchAgent, productAgent, travelAgent],
})
```

#### 2. Customizing with .asTool()

Use when you need to customize tool name, description, or context behavior:

```typescript
const orchestrator = new Agent({
  systemPrompt: 'You are an assistant that routes queries to specialized agents.',
  tools: [
    researchAgent.asTool({
      name: 'research_assistant',
      description: 'Process research-related queries requiring factual information.',
    }),
  ],
})
```

#### 3. Context Management

By default, agent context resets between invocations. To preserve conversation history:

```typescript
const orchestrator = new Agent({
  systemPrompt: 'You are an assistant that routes queries to specialized agents.',
  tools: [
    researchAgent.asTool({ 
      preserveContext: true  // Remember prior interactions
    }),
  ],
})
```

#### 4. Creating Custom Agent Tools

For full control over invocation, pre/post-processing, or multiple parameters:

```typescript
const researchAssistant = tool({
  name: 'research_assistant',
  description: 'Process and respond to research-related queries.',
  inputSchema: z.object({
    query: z.string().describe('A research question requiring factual information'),
  }),
  callback: async (input) => {
    const researchAgent = new Agent({
      systemPrompt: 'You are a specialized research assistant...',
    })

    const response = await researchAgent.invoke(input.query)
    return response.lastMessage.content
      .map((block) => ('text' in block ? block.text : ''))
      .join('')
  },
})
```

### Delegation: Skipping Re-processing

Mark a tool agent as a delegate to skip the orchestrator re-processing its response:

```typescript
const billingAgent = new Agent({
  name: 'billing_expert',
  description: 'Answers billing questions: charges, refunds, invoices.',
  systemPrompt: 'You handle billing questions with precision.',
  structuredOutputSchema: BillingResponseSchema,
  printer: false,
})

const orchestrator = new Agent({
  systemPrompt: 'Route billing questions to billing_expert.',
  tools: [billingAgent.asTool({ delegate: true })],  // Response goes directly to user
})

const result = await orchestrator.invoke('Why was I charged twice?')
// result contains billing agent's response unchanged
```

**Limitations:**
- Single delegated tool per turn (can't call other tools alongside it)
- Incompatible with stateful models

---

## Agent-to-Agent Protocol (A2A)

### What is A2A?

The Agent-to-Agent protocol is an open standard that defines how AI agents can discover, communicate, and collaborate across different platforms and implementations.

### Use Cases

- **Multi-Agent Workflows**: Chain multiple specialized agents together
- **Agent Marketplaces**: Discover and use agents from different providers
- **Cross-Platform Integration**: Connect Strands agents with other A2A-compatible systems
- **Distributed AI Systems**: Build scalable, distributed agent architectures

### Consuming Remote Agents

#### Basic Usage with A2AAgent

```typescript
import { A2AAgent } from '@strands-agents/sdk/a2a'

// Create an A2AAgent pointing to a remote A2A server
const a2aAgent = new A2AAgent({ url: 'http://localhost:9000' })

// Invoke it just like a regular Agent
const result = await a2aAgent.invoke('Show me 10 ^ 6')
console.log(result.lastMessage.content)
```

#### Configuration Options

```typescript
const a2aAgent = new A2AAgent({
  url: 'http://localhost:9000',                    // Required: Base URL
  agentCardPath: '/.well-known/agent-card.json',  // Path to agent card
  id: 'my-remote-agent',                          // Unique identifier
  name: 'Remote Calculator',                      // Agent name
  description: 'A remote calculator agent',       // Agent description
})
```

#### Streaming Responses

```typescript
const remoteAgent = new A2AAgent({ url: 'http://localhost:9000' })

const stream = remoteAgent.stream('Explain quantum computing')
let next = await stream.next()
while (!next.done) {
  console.log(next.value)  // A2AStreamUpdateEvent
  next = await stream.next()
}
console.log(next.value)  // AgentResultEvent (final result)
```

#### Using as a Tool in Orchestrator

```typescript
const calculatorAgent = new A2AAgent({
  url: 'http://calculator-service:9000',
})

const calculate = tool({
  name: 'calculate',
  description: 'Perform a mathematical calculation.',
  inputSchema: z.object({
    expression: z.string().describe('The math expression to evaluate'),
  }),
  callback: async (input) => {
    const calcResult = await calculatorAgent.invoke(input.expression)
    return String(calcResult.lastMessage.content[0])
  },
})

const orchestrator = new Agent({
  systemPrompt: 'You are a helpful assistant. Use the calculate tool for math.',
  tools: [calculate],
})
```

### Creating an A2A Server

#### Basic Server Setup

```typescript
import { Agent } from '@strands-agents/sdk'
import { A2AExpressServer } from '@strands-agents/sdk/a2a/express'

const server = new A2AExpressServer({
  agentFactory: (contextId) =>
    new Agent({
      systemPrompt: 'You are a calculator agent that can perform basic arithmetic.',
    }),
  name: 'Calculator Agent',
  description: 'A calculator agent that can perform basic arithmetic operations.',
})

await server.serve()
```

#### Conversation Isolation

The A2A protocol isolates conversation state per `context_id`. Use `agentFactory` (recommended) to provide a dedicated agent per context:

```typescript
const storage = new FileStorage('./sessions')

const server = new A2AExpressServer({
  agentFactory: (contextId) =>
    new Agent({
      name: 'Calculator Agent',
      systemPrompt: 'You are a calculator agent.',
      sessionManager: new SessionManager({
        sessionId: contextId,
        storage: { snapshot: storage },
      }),
    }),
  name: 'Calculator Agent',
  maxContexts: 1000,  // Retain at most 1000 contexts
})

await server.serve()
```

#### Server Configuration

```typescript
const server = new A2AExpressServer({
  agentFactory: (contextId) =>
    new Agent({ systemPrompt: 'You are a helpful agent.' }),
  name: 'My Agent',
  description: 'A helpful agent',
  maxContexts: 1000,
  host: '0.0.0.0',
  port: 8080,
  version: '1.0.0',
  httpUrl: 'https://my-agent.example.com',
  skills: [
    { id: 'math', name: 'Math', description: 'Performs calculations', tags: [] },
  ],
})

await server.serve()
```

#### Custom Express Integration

```typescript
import express from 'express'

const server = new A2AExpressServer({
  agentFactory: (contextId) =>
    new Agent({ systemPrompt: 'You are a customizable agent.' }),
  name: 'My Agent',
  description: 'A customizable agent',
})

const a2aRouter = server.createMiddleware()

const app = express()
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})
app.use(a2aRouter)

app.listen(9000, '127.0.0.1', () => {
  console.log('Server listening on http://127.0.0.1:9000')
})
```

---

## Swarm Multi-Agent Pattern

### How Swarms Work

A Swarm is a collaborative agent orchestration system where multiple agents work together with:

- **Shared context**: Full task context accessible to all agents
- **Agent-driven coordination**: Autonomous handoffs based on expertise
- **No central control**: Agents decide when to hand off
- **Dynamic distribution**: Tasks allocated based on capabilities
- **Collective intelligence**: Shared knowledge across agents

```
              Researcher
                 ↔
              Coder ↔ Reviewer
                 ↔
              Architect
```

### Creating a Swarm

```typescript
const researcher = new Agent({
  id: 'researcher',
  description: 'Researches topics and gathers information.',
  systemPrompt: 'You are a research specialist...',
})

const architect = new Agent({
  id: 'architect',
  description: 'Designs system architecture based on research.',
  systemPrompt: 'You are a system architecture specialist...',
})

const coder = new Agent({
  id: 'coder',
  description: 'Implements code based on architecture designs.',
  systemPrompt: 'You are a coding specialist...',
})

const reviewer = new Agent({
  id: 'reviewer',
  description: 'Reviews code and provides the final result.',
  systemPrompt: 'You are a code review specialist...',
})

const swarm = new Swarm({
  nodes: [researcher, architect, coder, reviewer],
  start: 'researcher',
  maxSteps: 10,
})

const result = await swarm.invoke(
  'Design and implement a simple REST API for a todo app'
)

console.log('Status:', result.status)
console.log('Node history:', result.results.map((r) => r.nodeId).join(' -> '))
```

### Swarm Configuration

```typescript
const swarm = new Swarm({
  nodes: [agent1, agent2, agent3],                    // Required
  start: 'agent1',                                    // Optional: override first agent
  maxSteps: 10,                                       // Optional: max executions
  repetitiveHandoffDetectionWindow: 5,               // Optional: ping-pong detection
  repetitiveHandoffMinUniqueAgents: 3,               // Optional: min unique agents
  timeout: 60000,                                    // Optional: wall-clock limit (ms)
  nodeTimeout: 30000,                               // Optional: per-node limit (ms)
  plugins: [customPlugin],                          // Optional: extensibility
})
```

### Multi-Modal Input Support

```typescript
const imageAnalyzer = new Agent({
  id: 'image_analyzer',
  description: 'Analyzes images and extracts key details.',
  systemPrompt: 'You are an image analysis expert...',
})

const reportWriter = new Agent({
  id: 'report_writer',
  description: 'Writes reports based on analysis.',
  systemPrompt: 'You are a report writing expert...',
})

const swarm = new Swarm({
  nodes: [imageAnalyzer, reportWriter],
})

// Create content blocks with text and image
const imageBytes = new Uint8Array(/* your image data */)
const contentBlocks = [
  new TextBlock('Analyze this image and create a report:'),
  new ImageBlock({ format: 'png', source: { bytes: imageBytes } }),
]

const result = await swarm.invoke(contentBlocks)
```

### Streaming Events

```typescript
const swarm = new Swarm({
  nodes: [coordinator, specialist],
  maxSteps: 4,
})

for await (const event of swarm.stream('Design and implement a REST API')) {
  switch (event.type) {
    case 'multiAgentHandoffEvent':
      console.log(`🔀 Handoff: ${event.source} -> ${event.targets.join(', ')}`)
      break
    case 'nodeResultEvent':
      console.log(`✅ Node ${event.result.nodeId}: ${event.result.status}`)
      break
    case 'multiAgentResultEvent':
      console.log(`Swarm completed: ${event.result.status}`)
      break
  }
}
```

### Safety Mechanisms

- **Step limits**: `maxSteps` caps total executions
- **Execution timeout**: Wall-clock ceiling for entire swarm
- **Node timeout**: Per-node runtime limit
- **Repetitive handoff detection**: Prevents ping-pong loops

---

## Graph Multi-Agent Pattern

### How Graphs Work

A Graph is a deterministic directed graph where:

- **Nodes** represent agents, custom nodes, or multi-agent systems
- **Edges** define dependencies and information flow
- **Deterministic order** based on graph structure
- **Output propagation** from one node to dependent nodes
- **Cyclic support** with proper exit conditions

```
Researcher → Analysis → Fact-Check ↘
             ↘_______________↗ → Report
```

### Creating a Graph

```typescript
const researcher = new Agent({
  id: 'research',
  systemPrompt: 'You are a research specialist...',
})

const analyst = new Agent({
  id: 'analysis',
  systemPrompt: 'You are a data analysis specialist...',
})

const factChecker = new Agent({
  id: 'fact_check',
  systemPrompt: 'You are a fact checking specialist...',
})

const reportWriter = new Agent({
  id: 'report',
  systemPrompt: 'You are a report writing specialist...',
})

const graph = new Graph({
  nodes: [researcher, analyst, factChecker, reportWriter],
  edges: [
    ['research', 'analysis'],
    ['research', 'fact_check'],
    ['analysis', 'report'],
    ['fact_check', 'report'],
  ],
  sources: ['research'],  // Entry point
  maxSteps: 20,           // Safety limit
})

const result = await graph.invoke(
  'Research the impact of AI on healthcare and create a comprehensive report'
)

console.log('Status:', result.status)
console.log('Execution order:', result.results.map((r) => r.nodeId).join(' -> '))
```

### Conditional Edges

```typescript
const onlyIfSuccessful = (state) => {
  const resultText = state
    .node('research')!
    .content.map((b) => ('text' in b ? b.text : ''))
    .join('')
  return resultText.toLowerCase().includes('successful')
}

const graph = new Graph({
  nodes: [researcher, analyst],
  edges: [
    { 
      source: 'research', 
      target: 'analysis', 
      handler: onlyIfSuccessful 
    },
  ],
})
```

### Nested Multi-Agent Patterns

Use a Swarm or Graph as a node in another Graph:

```typescript
const researchSwarm = new Swarm({
  id: 'research_swarm',
  nodes: [medicalResearcher, technologyResearcher, economicResearcher],
})

const analyst = new Agent({
  id: 'analysis',
  systemPrompt: 'Analyze the provided research.',
})

const graph = new Graph({
  nodes: [researchSwarm, analyst],
  edges: [['research_swarm', 'analysis']],
})

const result = await graph.invoke(
  'Research the impact of AI on healthcare and create a report'
)
```

### Remote Agents with A2AAgent

```typescript
const dataPrep = new Agent({
  id: 'prep',
  systemPrompt: 'You prepare data for analysis.',
})

const reportWriter = new Agent({
  id: 'report',
  systemPrompt: 'You synthesize analysis results into clear reports.',
})

// Remote specialized services
const mlAnalyzer = new A2AAgent({ url: 'http://ml-service:9000', id: 'ml' })
const nlpProcessor = new A2AAgent({ url: 'http://nlp-service:9000', id: 'nlp' })

const graph = new Graph({
  nodes: [dataPrep, mlAnalyzer, nlpProcessor, reportWriter],
  edges: [
    ['prep', 'ml'],
    ['prep', 'nlp'],
    ['ml', 'report'],
    ['nlp', 'report'],
  ],
})

const result = await graph.invoke('Analyze customer feedback from Q4 2024')
```

### Custom Node Types

```typescript
class ValidatorNode extends Node {
  async *handle(
    args: string | ContentBlock[],
    _state: MultiAgentState
  ): AsyncGenerator<MultiAgentStreamEvent, NodeResultUpdate, undefined> {
    const input = typeof args === 'string' ? args : ''

    if (!input.trim()) {
      throw new Error('Empty input')
    }

    return { content: [new TextBlock(`Validated: ${input.slice(0, 50)}...`)] }
  }
}

const validator = new ValidatorNode('validator', { 
  description: 'Validates input data' 
})
const processor = new Agent({
  id: 'processor',
  systemPrompt: 'Process the validated data.',
})

const pipelineGraph = new Graph({
  nodes: [validator, processor],
  edges: [['validator', 'processor']],
})
```

### Streaming Events

```typescript
const graph = new Graph({
  nodes: [researcher, analyst],
  edges: [['research', 'analysis']],
})

for await (const event of graph.stream('Research and analyze market trends')) {
  switch (event.type) {
    case 'beforeNodeCallEvent':
      console.log(`🔄 Node ${event.nodeId} starting`)
      break
    case 'nodeResultEvent':
      console.log(`✅ Node ${event.nodeId} completed`)
      break
    case 'multiAgentHandoffEvent':
      console.log(`🔀 Handoff: ${event.source} -> ${event.targets.join(', ')}`)
      break
    case 'multiAgentResultEvent':
      console.log(`Graph completed: ${event.result.status}`)
      break
  }
}
```

### Common Graph Topologies

#### Sequential Pipeline
```
Research → Analysis → Review → Report
```

#### Parallel Processing with Aggregation
```
      ↙ Worker1 ↘
Coordinator → Worker2 → Aggregator
      ↖ Worker3 ↗
```

#### Branching Logic
```
           ↙ TechBranch → TechReport
Classifier 
           ↖ BusinessBranch → BusinessReport
```

#### Feedback Loop
```
DraftWriter → Reviewer ⟲ (needs revision)
                    ↓ (approved)
                Publisher
```

---

## Agent Workflows

### What is an Agent Workflow?

An agent workflow is a structured coordination of tasks across multiple AI agents where each agent performs specialized functions in a defined sequence or pattern.

### Components

1. **Task Definition and Distribution**
   - Clear task descriptions
   - Agent assignment
   - Priority levels

2. **Dependency Management**
   - Sequential dependencies
   - Parallel execution
   - Join points

3. **Information Flow**
   - Input/output mapping
   - Context preservation
   - State management

### Sequential Workflow Example

```typescript
// Create specialized agents
const researcher = new Agent({
  systemPrompt: 'You are a research specialist. Find key information.',
  printer: false,
})

const analyst = new Agent({
  systemPrompt: 'You analyze research data and extract insights.',
  printer: false,
})

const writer = new Agent({
  systemPrompt: 'You create polished reports based on analysis.',
})

// Sequential workflow processing
async function processWorkflow(topic: string) {
  // Step 1: Research
  const researchResults = await researcher.invoke(
    `Research the latest developments in ${topic}`
  )

  // Step 2: Analysis
  const analysis = await analyst.invoke(
    `Analyze these research findings: ${researchResults.lastMessage.content}`
  )

  // Step 3: Report writing
  const finalReport = await writer.invoke(
    `Create a report based on this analysis: ${analysis.lastMessage.content}`
  )

  return finalReport
}
```

### Task Management and Dependency Resolution

```typescript
const tasks = {
  data_extraction: {
    description: 'Extract key financial data from the quarterly report',
    status: 'pending',
    agent: financialAgent,
    dependencies: [],
  },
  trend_analysis: {
    description: 'Analyze trends in the extracted data',
    status: 'pending',
    agent: analystAgent,
    dependencies: ['data_extraction'],
  },
}

function getReadyTasks(tasks, completedTasks) {
  const readyTasks = []
  for (const taskId in tasks) {
    const task = tasks[taskId]
    if (task.status === 'pending') {
      const deps = task.dependencies || []
      if (deps.every(dep => completedTasks.includes(dep))) {
        readyTasks.push(taskId)
      }
    }
  }
  return readyTasks
}
```

### Context Passing Between Tasks

```typescript
function buildTaskContext(taskId, tasks, results) {
  const context = []
  for (const depId of tasks[taskId].dependencies || []) {
    if (depId in results) {
      context.push(`Results from ${depId}: ${results[depId]}`)
    }
  }

  let prompt = tasks[taskId].description
  if (context.length > 0) {
    prompt = 'Previous task results:\n' + 
             context.join('\n\n') + 
             '\n\nTask:\n' + 
             prompt
  }

  return prompt
}
```

---

## When to Use Each Pattern

### Agents as Tools
**Use when:**
- You have a primary orchestrator that routes to specialists
- Specialists are domain-specific and reusable
- Clear hierarchy: manager → specialists
- Output from specialists is re-processed by orchestrator

**Example:** Customer service agent routing to billing, technical support, or sales specialists

### Agent-to-Agent (A2A)
**Use when:**
- Agents run on separate services/machines
- Need cross-platform interoperability
- Building agent marketplaces
- Agents from different vendors collaborate

**Example:** ML service agent + NLP service agent + reporting service agent

### Swarm
**Use when:**
- Agents are peer-level collaborators (no hierarchy)
- Autonomous handoffs based on expertise
- Shared context and working memory needed
- Emergent problem-solving from agent collaboration

**Example:** Team of agents researching, architecting, coding, and reviewing together

### Graph
**Use when:**
- Deterministic workflow with clear dependencies
- Need parallel processing and parallel paths
- Clear input/output between stages
- Conditional routing based on intermediate results

**Example:** Research → Analysis → Fact-Check ⇒ Report (with parallel branches)

### Workflows
**Use when:**
- Complex multi-step processes with dependencies
- Resource optimization needed
- Long-running processes requiring monitoring
- Audit trail of each step is necessary

**Example:** Financial data extraction → trend analysis → compliance review → report generation

---

## Decision Tree

```
Do you have a single orchestrator?
├─ YES → Agents as Tools
│
└─ NO, multiple peer agents
   │
   ├─ Autonomous self-organization needed?
   │  ├─ YES → Swarm
   │  └─ NO → proceed
   │
   ├─ Deterministic dependency graph?
   │  ├─ YES → Graph
   │  └─ NO → proceed
   │
   └─ Multi-step process with monitoring?
      ├─ YES → Workflow
      └─ NO → Consider simpler architecture
```

---

## Key Takeaways

✅ **Agents as Tools**: Hierarchical, orchestrator-specialist pattern

✅ **A2A Protocol**: Cross-platform, distributed, interoperable agents

✅ **Swarm**: Peer-level collaboration, emergent intelligence

✅ **Graph**: Deterministic workflows with dependencies

✅ **Workflows**: Long-running, monitored multi-step processes

⚠️ **For Session Manager**: None of these patterns are required. Choose based on your architecture needs, not session persistence.

---

## Related Documentation

- [Strands Session Management Guide](./strands-session-management-guide.md) — Persistence across sessions
- [Storage Guide](./storage.md) — Backend options for session data
- [TypeScript Quickstart](./strands-quickstart-typescript.md) — Basic agent setup
- [State Management](./strands-state-guide.md) — Agent state patterns
