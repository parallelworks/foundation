package dev

import (
	"context"
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

// hold keeps a port busy until the test ends, as another checkout's server
// would.
func hold(t *testing.T, addr string) int {
	t.Helper()
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	return ln.Addr().(*net.TCPAddr).Port //nolint:forcetypeassert // a tcp listener
}

func TestAllocateMovesOnlyWhatIsTaken(t *testing.T) {
	busy := hold(t, "127.0.0.1:0")
	free := freePort(t)
	var logged syncBuffer
	cfg, err := Config{
		Name:     "app",
		Root:     t.TempDir(),
		Ports:    map[string]int{"server": busy, "web": free, "also": free},
		Postgres: &Postgres{Port: busy},
		S3:       &S3{Addr: "127.0.0.1:" + strconv.Itoa(busy)},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	cfg, err = cfg.allocate(t.Context(), slog.New(slog.NewTextHandler(&logged, nil)))
	if err != nil {
		t.Fatal(err)
	}

	got := []int{cfg.ports["server"], cfg.ports["web"], cfg.ports["also"], cfg.Postgres.Port}
	seen := map[int]bool{}
	for _, p := range got {
		if p == busy || seen[p] {
			t.Errorf("ports = %v: %d is busy or given twice", got, p)
		}
		seen[p] = true
	}
	if cfg.ports["also"] != free && cfg.ports["web"] != free {
		t.Errorf("neither web nor also kept the free preferred port %d: %v", free, cfg.ports)
	}
	if strings.HasSuffix(cfg.S3.Addr, ":"+strconv.Itoa(busy)) {
		t.Errorf("s3 kept its busy port: %s", cfg.S3.Addr)
	}
	if !strings.Contains(logged.String(), "port taken; using another") {
		t.Error("moving a port was not logged")
	}
}

func TestPortsReachEverythingThatNamesThem(t *testing.T) {
	cfg, err := Config{
		Name:     "app",
		Root:     t.TempDir(),
		Ports:    map[string]int{"server": freePort(t)},
		Postgres: &Postgres{Port: freePort(t)},
		Env:      map[string]string{"ADDR": ":{port.server}", "DB": "{postgres}"},
		Services: []Service{{
			Name:   "server",
			Build:  []string{"go", "build", "-o", "bin/{port.server}"},
			Run:    []string{"serve", "--port", "{port.server}"},
			URL:    "http://localhost:{port.server}",
			Health: "http://localhost:{port.server}/readyz",
		}},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if cfg, err = cfg.allocate(t.Context(), slog.New(slog.DiscardHandler)); err != nil {
		t.Fatal(err)
	}
	if cfg, err = cfg.expandCommands(); err != nil {
		t.Fatal(err)
	}
	p := strconv.Itoa(cfg.ports["server"])
	svc := cfg.Services[0]
	if svc.Run[2] != p || svc.Build[3] != "bin/"+p || svc.URL != "http://localhost:"+p || svc.Health != "http://localhost:"+p+"/readyz" {
		t.Errorf("service = %+v, want port %s throughout", svc, p)
	}
	env, err := cfg.environ(&svc)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(env, "\n")
	if !strings.Contains(joined, "ADDR=:"+p) || !strings.Contains(joined, "DB=postgres://app:app@localhost:"+strconv.Itoa(cfg.Postgres.Port)+"/") {
		t.Errorf("env lacks the allocated ports")
	}

	if _, err := (Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"vite", "--port", "{port.web}"}}}}).expandCommands(); err == nil {
		t.Error("{port.web} with no such port was accepted")
	}
	for _, ports := range []map[string]int{{"Web": 5173}, {"web": 0}, {"web": 70000}} {
		if _, err := (Config{Ports: ports}).withDefaults(); err == nil {
			t.Errorf("ports %v accepted", ports)
		}
	}
}

func TestWaitLooksForADevThatIsStarting(t *testing.T) {
	cfg := Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	waited := make(chan error, 1)
	go func() { waited <- waitServices(t.Context(), cfg, []string{"web"}, 20*time.Second) }()

	time.Sleep(time.Second) // wait asks before dev has opened its socket
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		_ = Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard)
		close(done)
	}()
	t.Cleanup(func() { cancel(); <-done })

	if err := <-waited; err != nil {
		t.Errorf("wait for a dev that started after it: %v", err)
	}
}
