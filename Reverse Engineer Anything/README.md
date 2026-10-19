# REA — Reverse Engineer Anything

This folder tracks the upstream **REA** reverse-engineering toolkit for use during development of Adventure-game.

- Official source: https://github.com/morluto/rea
- Official website and guides: https://rea.tools/
- npm package: https://www.npmjs.com/package/rea-agents
- License: upstream project states MIT for REA-authored code; see the upstream repository for third-party notices and tool-specific terms.

## What it is for

REA provides an MCP server and CLI workflows for investigating software you own or are authorized to analyze. Depending on the target and locally installed providers, it can inspect JavaScript/Electron applications, websites, .NET assemblies, native binaries, Android packages/devices, firmware, network captures, databases, and other artifacts. Findings include evidence and limitations.

## Setup

Prerequisites: Node.js **22.19+**, **24.11+**, or **26+**, plus npm. Additional analysis engines/tools depend on the target and host.

From a terminal on your development machine:

```bash
npx rea-agents@latest setup
```

Review the setup plan and approve only the agent/configuration changes you want. Restart the selected agent afterward. This registers REA with a compatible local agent; adding this documentation folder to the game repository does **not** itself install or start the MCP server.

For a one-off JavaScript/Electron application inspection:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

For regular CLI use:

```bash
npm install --global rea-agents
rea --help
```

To refresh a global installation, use `rea update`; to refresh agent registrations after updating, run the setup command it prints or `npx rea-agents@latest setup`. Review changes and restart the agent.

## Use with Adventure-game

Use REA as a **development/research tool**, not as part of the browser game's runtime bundle. It can help investigate behavior in software we are authorized to inspect, gather evidence about relevant implementation patterns, and then guide a separately implemented, tested feature in this project.

- Keep REA's MCP server and analysis tools on the developer machine.
- Do not commit binaries, dumps, captures, credentials, private app data, or generated evidence from targets.
- Analyze only software and devices you own or have permission to examine.
- Native analysis may require a separately installed provider such as Hopper, Ghidra, or IDA. REA does not grant commercial-tool licenses.
- Check upstream documentation for platform-specific requirements and current release capabilities before relying on a workflow.

## Upstream source of truth

REA is actively maintained and changes frequently. This folder intentionally documents and links to the official upstream project rather than copying a potentially stale snapshot of its large source tree. Obtain source/releases only through the official links above.

Useful upstream docs:
- [Installation and setup](https://github.com/morluto/rea/blob/main/docs/installation.md)
- [CLI and Evidence](https://github.com/morluto/rea/blob/main/docs/cli.md)
- [MCP contracts and prompts](https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md)
- [Architecture map](https://github.com/morluto/rea/blob/main/docs/architecture.mermaid)
- [Security policy](https://github.com/morluto/rea/blob/main/SECURITY.md)
- [Disclaimer and responsible use](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)
- [Third-party notices](https://github.com/morluto/rea/blob/main/THIRD_PARTY_NOTICES.md)

Upstream repository inspected at commit: `b44cb5bd306de5b20466cf7b35f56247492dd41d`.
