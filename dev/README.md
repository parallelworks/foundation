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
go -C tools tool dev            # everything
go -C tools tool dev web        # only the web service
go -C tools tool dev logs api   # another terminal: the api service's output
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
      "extensions": [".go", ".sql"]
    },
    { "name": "web", "run": ["pnpm", "--filter", "web", "dev"] }
  ]
}
```

| Command | |
| --- | --- |
| `dev [service...]` | Run the stack and the services named, or every service not marked `manual`, until interrupted. Each line is prefixed with its source |
| `dev logs service [-f]` | Print a service's output from the latest run, and with `-f` keep following it |
| `dev stack` | Run Postgres on `:5432` and S3 on `127.0.0.1:8333` until interrupted. User, password and database are `name` (required with Postgres); tests get `name_test` |
| `dev wait` | Block until a stack started elsewhere accepts connections |
| `dev reset` | Delete the stack's data |

Data and each service's latest log live in `.devstack/` beside `dev.json`, or
`--dir`. The command finds `dev.json` from the working directory up, which is
how `go -C tools tool dev` finds it from `tools/`. A Postgres left running by a stack that was
killed is stopped on the next start.

## Services

A service with `build` is a server: built, run, and rebuilt and restarted when
a file with one of its `extensions` (default `.go`) changes under its `watch`
directories (default its `dir`). A build that fails stops it until the next
change, so nothing runs stale code, and only one service builds at a time, so
several servers do not exhaust a laptop's memory. A service without `build`
runs once; if it exits, it is left stopped so its error is not buried under
restarts.

Each service runs in its `dir`, relative to `dev.json`. Each command runs in
its own process group, and stopping one ends everything it started, such as
the Vite under `pnpm`. Unix only.

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
