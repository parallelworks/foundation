# dev

`dev` runs an app's whole development setup in one terminal: Postgres 18 and
an S3-compatible server natively, with data kept between runs; its Go servers,
rebuilt and restarted when their sources change; and processes beside them,
such as Vite.

It belongs in the app's tools module, not the service's: built under the
service module's `godebug fips140=only`, the S3 emulator's MD5 ETags would
panic. So from the repository root it runs as `go -C tools tool dev`, not
`go tool dev`, which only finds the root module's tools. Apps usually wrap it,
as `make dev` or `pnpm dev`; every example below works the same way with
`go -C tools tool` in front.

```sh
go -C tools get -tool github.com/parallelworks/foundation/dev/cmd/dev
go -C tools tool dev                # everything
go -C tools tool dev web            # only the web service
go -C tools tool dev restart api    # another terminal: rebuild and restart api
go -C tools tool dev logs api web   # another terminal: their output
```

Describe the app in `dev.json` at the repository root:

```json
{
  "name": "shop",
  "postgres": { "parameters": { "max_connections": "300" } },
  "s3": {},
  "env": {
    "SHOP_DATABASE_URL": "{postgres}",
    "SHOP_TEST_DATABASE_URL": "{postgres_test}",
    "SHOP_S3_ENDPOINT": "{s3}",
    "SHOP_VITE_URL": "http://localhost:5173"
  },
  "services": [
    {
      "name": "server",
      "build": ["go", "build", "-o", "tmp/shop", "./cmd/shop"],
      "run": ["tmp/shop", "serve"],
      "exclude": ["tmp", "web", "tools"],
      "extensions": [".go", ".sql"],
      "url": "http://localhost:8080",
      "health": "http://localhost:8080/readyz"
    },
    { "name": "web", "run": ["pnpm", "--filter", "web", "dev"] }
  ]
}
```

| Command | |
| --- | --- |
| `dev [service...]` | Run the stack and the services named, or every service not marked `manual`, until interrupted. In a terminal it shows the interactive view; piped, in CI or with `--plain` it prints each line prefixed with its source |
| `dev status` | Show the running dev's services and their states |
| `dev start`, `stop`, `restart` *service* | Drive one service of the running dev; `restart` rebuilds a server |
| `dev logs [service...] [-f]` | Print services' output from the latest run (all of them when none is named), and with `-f` keep following it |
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
| `q` | Stop everything and quit |

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

Each service runs in its `dir`, relative to `dev.json`. Each command runs in
its own process group, and stopping one ends everything it started, such as
the Vite under `pnpm`. Unix only.

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
URLs, and `{s3}` is the S3 endpoint. Keep `.env` for secrets and personal
settings.

`before` commands run once, in order, before anything starts, such as
generating files a server embeds. If one fails, `dev` stops with its error.

## Your own command

An app with its own development tasks builds its command on the same base:

```go
func main() {
	root := dev.NewRootCmd(dev.Config{Name: "shop", Postgres: &dev.Postgres{}, S3: &dev.S3{}})
	root.AddCommand(seedCmd)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := root.ExecuteContext(ctx); err != nil {
		os.Exit(1)
	}
}
```
