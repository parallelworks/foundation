# dev

`dev` runs an app's whole development setup in one terminal: Postgres 18 and
an S3-compatible server natively, with data kept between runs; its Go servers,
rebuilt and restarted when their sources change; and processes beside them,
such as Vite.

Install it once, and use `dev` in every repository that has a `dev.json`:

```sh
go install github.com/parallelworks/foundation/dev/cmd/dev@latest
```

In a repository that pins dev in its tools module, the global `dev` runs the
pinned version instead of itself whenever the two differ, so every checkout,
including one of an older branch, runs what its CI and teammates run.
`DEV_GLOBAL=1` makes it run itself anyway, and `dev --version` says which ran.
Without the global install, run the pinned one directly as
`go -C tools tool dev`; plain `go tool dev` finds only the root module's tools.

```sh
dev                                 # everything
dev web                             # only the web service
dev restart api                     # another terminal: rebuild and restart api
dev logs api web                    # another terminal: their output
```

## Adding dev to an app

1. **A tools module.** If the app has none, create one beside its own module;
   it holds development tools, never service code:

   ```sh
   mkdir tools && go -C tools mod init "$(go list -m)/tools"
   ```

2. **Pin dev in it.** This records it as a tool, at a version every checkout
   shares and the global `dev` defers to. It also lives here rather than in
   the service's module: built under that module's `godebug fips140=only`,
   the S3 emulator's MD5 ETags would panic.

   ```sh
   go -C tools get -tool github.com/parallelworks/foundation/dev/cmd/dev@latest
   ```

3. **Describe the app** in `dev.json` at the repository root (below).
4. **Ignore what dev writes:** add `.devstack/` (the stack's data and the
   services' logs) and the servers' build output, such as `tmp/`, to
   `.gitignore`.
5. **Wrap it** where people already look, such as `dev:` in the Makefile
   running `go -C tools tool dev`, or `"dev"` in `package.json`, so it works
   without the global install too.
6. **Give agents the tools** with `.mcp.json` at the repository root (see
   [Tools and agents](#tools-and-agents)).

Upgrade a repository's pin with the same `go -C tools get -tool …@latest`, and
the global `dev` with `go install …@latest`.

## Describing the app

Describe the app in `dev.json` at the repository root:

```json
{
  "name": "shop",
  "postgres": { "parameters": { "max_connections": "300" } },
  "s3": {},
  "ports": { "server": 8080, "web": 5173 },
  "env": {
    "SHOP_HTTP_ADDR": ":{port.server}",
    "SHOP_DATABASE_URL": "{postgres}",
    "SHOP_TEST_DATABASE_URL": "{postgres_test}",
    "SHOP_S3_ENDPOINT": "{s3}",
    "SHOP_VITE_URL": "http://localhost:{port.web}"
  },
  "services": [
    {
      "name": "server",
      "build": ["go", "build", "-o", "tmp/shop", "./cmd/shop"],
      "run": ["tmp/shop", "serve"],
      "exclude": ["tmp", "web", "tools"],
      "extensions": [".go", ".sql"],
      "url": "http://localhost:{port.server}",
      "health": "http://localhost:{port.server}/readyz"
    },
    { "name": "web", "run": ["pnpm", "--filter", "web", "dev", "--port", "{port.web}", "--strictPort"] }
  ]
}
```

| Command | |
| --- | --- |
| `dev [service...]` | Run the stack and the services named, or every service not marked `manual`, until interrupted. In a terminal it shows the interactive view; piped, in CI or with `--plain` it prints each line prefixed with its source |
| `dev status [--json]` | Show the running dev's services, their states and URLs; `--json` adds its ports, pid and version |
| `dev start`, `stop`, `restart` *service* | Drive one service of the running dev; `restart` rebuilds a server |
| `dev logs [service...] [-f]` | Print services' output from the latest run (all of them when none is named), and with `-f` keep following it |
| `dev up [service...]` | Start dev in the background, and return once its services are up (or with why not); `--for 2h` stops it later |
| `dev down` | Stop the dev running here |
| `dev ps` | List every dev running on this machine: checkout, pid, ports |
| `dev exec -- command` | Run a command with the running dev's environment: allocated ports, `{postgres}`, `{s3}` |
| `dev mcp` | Answer MCP over stdio, so an agent drives this checkout's dev as tools |
| `dev stack` | Run Postgres on `:5432` and S3 on `127.0.0.1:8333` until interrupted. User, password and database are `name` (required with Postgres); tests get `name_test` |
| `dev wait [service...]` | Block until a stack started elsewhere accepts connections, or until the services named are up; fails as soon as one fails, exits or turns unhealthy |
| `dev reset` | Delete the stack's data |

Data and each service's latest log live in `.devstack/` beside `dev.json`, or
`--dir`. The command finds `dev.json` from the working directory up, which is
how `go -C tools tool dev` finds it from `tools/`. A Postgres left running by a stack that was
killed is stopped on the next start.

## The interactive view

In a terminal, `dev` takes over the screen with its services, their states
(building, starting, ready, running, unhealthy, failed, exited, stopped) and
the stack's addresses:

| Key | |
| --- | --- |
| `↑` `↓` | Select a service |
| `enter` | Its output; `esc` goes back, `↑` `↓` scroll, `ctrl+u` `ctrl+d` (or `pgup` `pgdn`) page, `g` jumps to the oldest line, `G` (or `end`) follows |
| `a` | Every service's output, interleaved |
| `r` | Restart the service, rebuilding a server |
| `s` | Start or stop it, including a `manual` one |
| `q` | Stop everything and quit; in an attached view, leave dev running |
| `Q` | In an attached view, stop dev |

Run `dev` where one is already running, such as one started with `dev up` by
you or an agent, and the view attaches to it instead of starting a second:
states come over the socket and output from the logs it writes. `q` then
leaves it running and `Q` stops it, and the view says so if the running dev is
another version.

`dev status`, `start`, `stop` and `restart` reach a running dev through a Unix
socket in a directory only you can enter (`$XDG_RUNTIME_DIR/foundation-dev`, or
`~/.local/state/foundation-dev`), so a second terminal or a tool can
drive it while the view runs. Only one dev runs per checkout.

## Services

A service with `build` is a server: built, run, and rebuilt and restarted when
a file with one of its `extensions` (default `.go`) changes under its `watch`
directories (default its `dir`). A build that fails stops it until the next
change, so nothing runs stale code, and only one service builds at a time, so
several servers do not exhaust a laptop's memory. A service without `build`
runs once; if it exits, it is left stopped so its error is not buried under
restarts.

A service with a `health` URL reads *starting* once its process is up, *ready*
when the URL answers 2xx, and *unhealthy* if it stops answering, or never
answers within a minute. Without one, a service reads *running* as soon as its
process is up. `dev wait api web` waits for exactly that, for scripts, CI and
tools that need the app answering before they go on.

A service's `url` is where to open it: the view shows it as a link the
terminal opens on cmd-click, `dev status` prints it, and `dev` logs it when the
service comes up. Without one, a service with a `health` URL links to that
URL's origin, and any other takes the first local address it prints, as Vite
and Storybook do when they start.

A service can depend on others: with `"dependsOn": ["db"]` it reads *waiting*
until `db` is up, and `dev web` starts `db` too. `"restart": "on-failure"`
starts a service again when it exits with an error, waiting longer each time
it keeps failing; without it a service that exits is left stopped.
`"rebuildOnCheckout": true` rebuilds a server when the checkout's branch
changes, for a build stamped with it; it finds the branch through git, so it
works in a worktree too.

A local database is a service like any other, such as
`{ "name": "db", "run": ["mongod", "--dbpath", "{dir}/mongo", "--port", "{port.db}"], "health": … }`:
`{dir}` is the stack's directory (`.devstack`), where its data stays with the
checkout.

Each service runs in its `dir`, relative to `dev.json`. Each command runs in
its own process group, and stopping one ends everything it started, such as
the Vite under `pnpm`. Unix only.

## Tools and agents

A tool, or an agent working in its own worktree, can run the app without a
terminal: `dev up` starts it in the background and returns once it is up (or
with the services' errors), `dev status --json` gives its URLs and ports,
`dev exec -- make test` runs tests against that checkout's stack, `dev logs`
reads output, and `dev down` stops it. A detached dev also stops itself when
its checkout is deleted, as a finished worktree is, and after `--for`.

`dev mcp` offers the same as tools over the Model Context Protocol: `up`,
`status`, `logs` (with `match` to filter), `start`, `stop`, `restart`, `wait`
and `down`. In an app, an `.mcp.json` at the repository root gives agents that
work in it the tools, for whichever checkout they run in:

```json
{ "mcpServers": { "dev": { "command": "go", "args": ["-C", "tools", "tool", "dev", "mcp"] } } }
```

## Ports

`ports` names the ports the services listen on, with the one each prefers:

```json
"ports": { "server": 8080, "web": 5173 },
"env": { "SHOP_HTTP_ADDR": ":{port.server}", "SHOP_VITE_URL": "http://localhost:{port.web}" },
"services": [
  { "name": "server", "url": "http://localhost:{port.server}", "health": "http://localhost:{port.server}/readyz", … },
  { "name": "web", "run": ["pnpm", "--filter", "web", "dev", "--port", "{port.web}", "--strictPort"] }
]
```

dev gives each its preferred port when nothing holds it, and the next free one
otherwise, logging the move; Postgres and S3 do the same. `{port.<name>}`
stands for the allocated port in `env`, `run`, `build`, `before`, `url` and
`health`, and `{postgres}` and `{s3}` follow theirs, so a second checkout, or
another app, runs beside the first without either changing its config.

## Environment

Every command gets, from lowest to highest precedence: `env` in `dev.json`; the
service's own `env`; `envFile` (default `.env` beside `dev.json`, skipped when
missing); the service's `envFile`, relative to its `dir`; and the real
environment, so `SHOP_LOG_LEVEL=info make dev` overrides everything. Values
in `env` may name the stack: `{postgres}` and `{postgres_test}` are database
URLs, and `{s3}` is the S3 endpoint. `{dir}` is the stack's directory,
`{root}` the checkout's, and `{instance}` names the checkout in a few readable
characters, such as `shop-1a2b`, for anything shared between checkouts that
must not collide, like a queue on a shared server. Keep `.env` for secrets and
personal settings.

`before` commands run once, in order, before anything starts, such as
generating files a server embeds. If one fails, `dev` stops with its error.

## Your own command

An app with development tasks of its own builds its dev on the same base,
loading `dev.json` as `cmd/dev` does and adding its commands:

```go
func main() {
	path, err := dev.FindConfig(".")
	if err != nil {
		log.Fatal(err)
	}
	cfg, err := dev.LoadConfig(path)
	if err != nil {
		log.Fatal(err)
	}
	root := dev.NewRootCmd(cfg)
	root.AddCommand(seedCmd)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := root.ExecuteContext(ctx); err != nil {
		os.Exit(1)
	}
}
```

Then point the global `dev` at it: list the package as a tool in the module it
lives in (`tool example.com/shop/cmd/dev` in `go.mod`), and name the command in
`dev.json`:

```json
"command": ["go", "tool", "dev"]
```

`dev` then runs the app's own dev in its repository, from any directory in it:
`dev seed` reaches the app's command, and `dev --help` lists it beside `up`,
`status` and the rest. `{root}` in `command` stands for the directory of
`dev.json`. A command wins over a pinned tools module.
