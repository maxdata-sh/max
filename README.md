```
 _____ _____ __ __
|     |  _  |  |  |  is a federated data query layer
| | | |     |-   -|  for both agents and humans  
|_|_|_|__|__|__|__|  
```

## What is max?
Max turns any source into a queryable data provider:

```bash
max connect @max/connector-linear --name linear-1

max sync linear-1
>> 68,012 records syncd

max search linear-1 --filter 'title ~= "AcmeCo"' --fields=status,title
>> ... 1,138 records (1.8ms)
```
### When would you use Max over MCP?

Your agent talks to other tools through thin straws - MCP servers and APIs that force every record through the context window, burning tokens and hitting limits.

Max is a fat pipe. It syncs data locally, indexes it, and gives your agent a CLI to query it.   
This allows your agent to `cut`, `grep`, `sed`, `sort` pipe to `jq` etc. and redirect at will. 


## CLI > MCP; `max` is a CLI

```bash
max -t max://my.vpc/linear-1 search Task \
  --filter '(status = done AND priority = medium) or (priority = low)
  --fields=title,status,priority,owner
  -o ndjson   
```

A motivating example from a real-world test:

> *"What are the top 10 first names in HubSpot, and how many Google Drive files mention them in the title?"*

|         | Tokens | Time  | Cost    |
|---------|--------|-------|---------|
| **MCP** | 180M+  | 80m+  | $180+   |
| **Max** | 238    | 27s   | $0.003  |

Note: MCP figures are extrapolated - we had to terminate claude mid-run due to repeated recompactions and a not-unlimited buget. Additionally, the $180 cost doesn't include any calls to google drive (the second half of the challenge).



## Status

> **Alpha.** Max is under heavy active development. Expect breaking changes, rough edges, and missing features. We're releasing early because the core idea works and we want feedback.

## Quick start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3.9
- [Rust](https://rustup.rs) (for native dependencies)

### Install

```bash
git clone https://github.com/maxdata-sh/max.git
cd max
bun install

# Put max on your path somewhere
PATH=$PATH:`pwd` 
```

### Shell completions

Max can generate shell completions for you:

```bash
# Zsh
max completion zsh > ~/.max-completions.zsh
echo 'source ~/.max-completions.zsh' >> ~/.zshrc

# Or, if you use a completions directory (e.g. oh-my-zsh):
max completion zsh > ~/.oh-my-zsh/completions/_max

# Bash
max completion bash > ~/.max-completions.bash
echo 'source ~/.max-completions.bash' >> ~/.bashrc

# Fish
max completion fish > ~/.config/fish/completions/max.fish
```

## Getting started


```bash

# (optional) spin up acme in apps/acme - a fake saas tool:
cd /path/to/max/acme
./acme start --tenant default

# create a workspace
mkdir my-workspace && cd my-workspace
max init .

# connect to a connector
max connect @max/connector-acme --name acme-1 
# Max will walk you through authentication - you'll need an API token from the service you're connecting to.

# check your workspace's status
max status

# check the schema of your connector
max schema acme-1

# synchronise the installation
max sync acme-1
  Syncing...
    AcmeWorkspace  ██▓··      12  1021.8 op/s
    AcmeUser       █████     283  4391.1 op/s
    AcmeTask       ███▒·    2156  4811.3 op/s
    ──────────────────────────────────────────────
    3.2s elapsed

# query your data
max search acme-1 AcmeTask \
  --filter 'title ~= "protocol"' \
  --fields title,description \
  --output ndjson
```

The query runs locally against your synced data - fast, cheap, and doesn't touch the upstream API.   
**Roadmap item:** JIT access to upstream data, using local version as hot cache.

### 5. Teach your agent

```bash
max llm bootstrap
```

This outputs a context block that teaches your AI agent what Max is and how to use it. Paste it into your agent's system prompt, or pipe it directly:


Your agent now knows how to discover connectors, run queries, and work with Max's output formats.

## Connectors

**@max/connector-\* Connectors coming shortly**.  Today, only the acme connector is offered.

| Connector | Status | Description |
|-----------|--------|-------------|
| **ACME** | Demo | Fictional connector for testing and learning |

### Creating a connector
See [max developer guide](docs/developer/README.md)




## How it works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  SaaS Tool  │────▶│  Connector   │────▶│  Storage     │
│  (HubSpot,  │     │  (sync,      │     │              │
│   Linear..) │     │   auth,      │     │              │
│             │     │   schema)    │     │              │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                         max search / query
                                                │
                                         ┌──────▼───────┐
                                         │  Your Agent  │
                                         │  (238 tokens │
                                         │   not 180M)  │
                                         └──────────────┘
```

## Contributing

Max is early in its journey and under very active development. We're not accepting code contributions just yet whilst we allow the api to stabilize, but we'd love your feedback:

- [Open an issue](https://github.com/maxdata-sh/max/issues) for bugs, feature requests, or connector ideas
- Star the repo if you find it useful - it helps others discover Max!

## License

[Apache 2.0](./LICENSE)

---

Max is a trademark of Metomic Ltd.
