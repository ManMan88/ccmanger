# Claude Manager User Guide

This guide covers the basic usage of Claude Manager, a GUI application for managing Claude Code CLI agents across git worktrees.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Workspaces](#workspaces)
3. [Worktrees](#worktrees)
4. [Agents](#agents)
5. [Real-time Features](#real-time-features)
6. [Usage Tracking](#usage-tracking)
7. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

### Prerequisites

Before using Claude Manager, ensure you have:

- **Node.js 20+** installed
- **pnpm** package manager
- **Git** installed and configured
- **Claude Code CLI** installed and authenticated

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd claude-manager

# Install dependencies
pnpm install

# Start in development mode
./scripts/start-dev.sh
```

The application will be available at:

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3001

### Production Mode

```bash
# Build for production
./scripts/build.sh

# Start in production mode
./scripts/start-prod.sh
```

---

## Workspaces

A workspace represents a git repository that you want to manage with Claude agents.

### Opening a Workspace

1. Click the **"Open Workspace"** button in the toolbar
2. Enter or browse to the path of your git repository
3. Click **"Open"**

Claude Manager will scan the repository and detect all existing worktrees.

### Workspace Features

- **Multiple workspaces**: You can have multiple workspaces open simultaneously
- **Auto-detection**: Existing git worktrees are automatically discovered
- **Persistence**: Your workspaces are saved and restored between sessions

### Closing a Workspace

Click the **X** button on the workspace card or use the workspace menu to close it.

> **Note**: Closing a workspace does not delete any files or stop running agents - it just removes it from Claude Manager's view.

---

## Worktrees

Worktrees allow you to work on multiple branches simultaneously in the same repository.

### Creating a Worktree

1. Click **"Add Worktree"** in a workspace
2. Choose a branch (existing or new)
3. Optionally specify a custom path
4. Click **"Create"**

### Worktree Options

| Option            | Description                              |
| ----------------- | ---------------------------------------- |
| **Branch**        | The git branch for this worktree         |
| **Path**          | Where the worktree files will be created |
| **Create Branch** | Create a new branch if it doesn't exist  |

### Managing Worktrees

- **Reorder**: Drag worktrees to change their display order
- **Sort agents**: Choose how agents within a worktree are sorted (free, by status, by name)
- **Delete**: Remove a worktree (this also removes the git worktree directory)

### Checkout

Switch branches within an existing worktree using the checkout feature. This is equivalent to running `git checkout <branch>` in that worktree.

---

## Agents

Agents are instances of Claude Code CLI that can help you with coding tasks.

### Creating an Agent

1. Click **"+"** in a worktree to add a new agent
2. Enter a name for the agent
3. Choose the mode and permissions
4. Optionally provide an initial prompt
5. Click **"Create"**

### Agent Modes

| Mode        | Description                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| **Regular** | Standard interactive mode - Claude asks for confirmation before making changes |
| **Auto**    | Auto-approve mode - Claude makes changes without asking (use with caution)     |
| **Plan**    | Planning mode - Claude creates detailed plans before implementation            |

### Permissions

| Permission  | Description                    |
| ----------- | ------------------------------ |
| **Read**    | Can read files and directories |
| **Write**   | Can create and modify files    |
| **Execute** | Can run shell commands         |

### Agent Status

| Status      | Color  | Meaning                               |
| ----------- | ------ | ------------------------------------- |
| **Running** | Green  | Agent is actively processing          |
| **Waiting** | Yellow | Agent is waiting for user input       |
| **Error**   | Red    | Agent encountered an error            |
| **Idle**    | Gray   | Agent is idle and available for tasks |

### Context Level

The context level indicator shows how much of the agent's context window is being used (0-100%). When context is high, consider:

- Starting a new agent for new tasks
- Summarizing the conversation
- Using the fork feature to create a fresh agent

### Interacting with Agents

1. Click on an agent card to open the terminal interface
2. Type your message in the input field and press Enter
3. If the agent is idle, your message starts the agent with that prompt
4. If the agent is running, your message is sent to the agent's stdin

Output streams in real-time in a terminal-style display (dark background, monospace font). The input is always enabled regardless of agent status.

### Agent Actions

| Action     | Description                                   |
| ---------- | --------------------------------------------- |
| **Start**  | Begin or resume the agent process             |
| **Stop**   | Stop the running agent (can be resumed later) |
| **Fork**   | Create a copy of this agent with its settings |
| **Delete** | Remove the agent completely                   |

### Forking Agents

Forking creates a new agent with the same configuration:

- Same mode and permissions
- Same worktree
- Fresh context (no message history)

This is useful when you want to start a similar task without reconfiguring settings.

---

## Real-time Features

Claude Manager uses WebSockets for real-time updates.

### Connection Status

The connection indicator in the toolbar shows:

- **Green dot**: Connected
- **Yellow dot**: Connecting/reconnecting
- **Red dot**: Disconnected

### Auto-reconnect

If the connection is lost, Claude Manager will automatically attempt to reconnect. Your agent processes continue running on the server.

### Live Updates

The following updates happen in real-time:

- Agent output/responses
- Agent status changes
- Context level changes
- Usage statistics

---

## Usage Tracking

Claude Manager tracks API usage to help you monitor costs.

### Usage Bar

The usage bar at the bottom shows:

- **Input tokens**: Tokens sent to Claude
- **Output tokens**: Tokens received from Claude
- **Total cost**: Estimated cost based on current pricing

### Usage Period

Usage is tracked per day by default. The bar shows:

- Current day's usage
- Daily limit (if configured)

### Viewing Detailed Usage

Click on the usage bar to see:

- Breakdown by agent
- Historical usage
- Cost projections

---

## Keyboard Shortcuts

| Shortcut       | Action                        |
| -------------- | ----------------------------- |
| `Cmd/Ctrl + K` | Open command palette          |
| `Cmd/Ctrl + N` | New agent in current worktree |
| `Cmd/Ctrl + O` | Open workspace                |
| `Cmd/Ctrl + W` | Close current modal           |
| `Enter`        | Send message (in terminal)    |
| `Escape`       | Cancel / Close modal          |

---

## Tips & Best Practices

### Organizing Agents

- Use descriptive names for agents (e.g., "Feature: Auth System", "Bug: Login Fix")
- Group related work in the same worktree
- Use different worktrees for parallel feature development

### Managing Context

- Start new agents for unrelated tasks
- Use the fork feature when context is high
- Keep conversations focused on specific goals

### Performance

- Close workspaces you're not actively using
- Stop agents when they're not needed
- The backend will clean up orphaned processes on restart

### Troubleshooting

If something isn't working:

1. Check the connection status indicator
2. Look at the browser console for errors
3. Check the server logs (`~/.claude-manager/logs/`)
4. Try refreshing the page
5. Restart the server if needed

---

## API Access

Claude Manager exposes a REST API for programmatic access.

### API Documentation

Visit http://localhost:3001/api/docs/ui for interactive Swagger documentation.

### Example API Calls

```bash
# List workspaces
curl http://localhost:3001/api/workspaces

# Get agent status
curl http://localhost:3001/api/agents/{id}/status

# Send message to agent
curl -X POST http://localhost:3001/api/agents/{id}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello, Claude!"}'
```

---

## Getting Help

- **Documentation**: Check the `docs/` directory for technical documentation
- **Issues**: Report bugs at the project's issue tracker
- **Logs**: Check `~/.claude-manager/logs/` for detailed logs
