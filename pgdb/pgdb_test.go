package pgdb_test

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"testing/fstest"

	"github.com/parallelworks/hopper/hoppermigrate"
	"golang.org/x/sync/errgroup"

	"github.com/parallelworks/foundation/pgdb"
	"github.com/parallelworks/foundation/pgdb/pgdbtest"
)

const urlEnv = "FOUNDATION_TEST_DATABASE_URL"

func migrations() pgdb.Migrations {
	return pgdb.Migrations{FS: os.DirFS("testdata/migrations"), Logger: slog.New(slog.DiscardHandler)}
}

func TestOpenRejectsInvalidSchema(t *testing.T) {
	for _, schema := range []string{"", "App", "app; DROP TABLE x", "1app"} {
		if _, err := pgdb.Open(t.Context(), "postgres://localhost/x", schema); err == nil {
			t.Errorf("Open accepted schema %q", schema)
		}
	}
}

func TestMigrateKeepsEverythingInTheSchema(t *testing.T) {
	ctx := t.Context()
	// A small pool reproduces replicas contending for connections while they
	// wait on the migration lock.
	pool := pgdbtest.Open(t, urlEnv, "pool_max_conns=2")
	schema := pgdb.Schema(pool)

	var g errgroup.Group
	for range 4 {
		g.Go(func() error { return pgdb.Migrate(ctx, pool, migrations()) })
	}
	if err := g.Wait(); err != nil {
		t.Fatalf("concurrent migrate: %v", err)
	}

	for _, table := range []string{"widgets", "goose_db_version", "hopper_jobs", "hopper_periodic"} {
		var where string
		err := pool.QueryRow(ctx,
			"SELECT table_schema FROM information_schema.tables WHERE table_name = $1 AND table_schema = ANY($2)",
			table, []string{schema, "public", "hopper"}).Scan(&where)
		if err != nil {
			t.Errorf("table %s: %v", table, err)
		} else if where != schema {
			t.Errorf("table %s is in schema %s, want %s", table, where, schema)
		}
	}
	if v, err := hoppermigrate.Version(ctx, pgdb.HopperDriver(pool)); err != nil || v != hoppermigrate.Latest() {
		t.Errorf("hopper version = %d, %v; want %d", v, err, hoppermigrate.Latest())
	}
	if _, err := pool.Exec(ctx, "INSERT INTO widgets VALUES (1, 'a')"); err != nil {
		t.Errorf("app table unreachable through the pool: %v", err)
	}
}

func TestTwoSchemasShareADatabase(t *testing.T) {
	a := pgdbtest.Migrated(t, urlEnv, migrations())
	b := pgdbtest.Migrated(t, urlEnv, migrations())
	if _, err := a.Exec(t.Context(), "INSERT INTO widgets VALUES (1, 'a')"); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := b.QueryRow(t.Context(), "SELECT count(*) FROM widgets").Scan(&n); err != nil || n != 0 {
		t.Errorf("schema b sees %d of schema a's widgets (%v)", n, err)
	}
}

func TestSchemaIsDroppedAfterTheTest(t *testing.T) {
	var schema string
	t.Run("inner", func(t *testing.T) {
		schema = pgdb.Schema(pgdbtest.Migrated(t, urlEnv, migrations()))
	})
	if schema == "" {
		t.Skip("no test database")
	}
	pool := pgdbtest.Open(t, urlEnv, "")
	var exists bool
	if err := pool.QueryRow(context.WithoutCancel(t.Context()),
		"SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1)", schema).Scan(&exists); err != nil || exists {
		t.Errorf("schema %s left behind (%v)", schema, err)
	}
}

func TestMigrateOutOfOrder(t *testing.T) {
	ctx := t.Context()
	pool := pgdbtest.Open(t, urlEnv, "")
	migration := func(table string) *fstest.MapFile {
		return &fstest.MapFile{Data: []byte("-- +goose Up\nCREATE TABLE " + table + " (id int);\n-- +goose Down\nDROP TABLE " + table + ";\n")}
	}
	first := fstest.MapFS{"00001_a.sql": migration("a"), "00003_c.sql": migration("c")}
	later := fstest.MapFS{"00001_a.sql": migration("a"), "00002_b.sql": migration("b"), "00003_c.sql": migration("c")}
	quiet := slog.New(slog.DiscardHandler)

	if err := pgdb.Migrate(ctx, pool, pgdb.Migrations{FS: first, Logger: quiet}); err != nil {
		t.Fatal(err)
	}
	// A migration merged after a higher-numbered one is refused by default...
	if err := pgdb.Migrate(ctx, pool, pgdb.Migrations{FS: later, Logger: quiet}); err == nil {
		t.Fatal("migrated a missing lower version without AllowOutOfOrder")
	}
	// ...and applied when the application allows it.
	if err := pgdb.Migrate(ctx, pool, pgdb.Migrations{FS: later, Logger: quiet, AllowOutOfOrder: true}); err != nil {
		t.Fatalf("out of order: %v", err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO b VALUES (1)"); err != nil {
		t.Errorf("version 2 not applied: %v", err)
	}
}
