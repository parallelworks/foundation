package dev

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestHealthMovesAServiceThroughItsStates(t *testing.T) {
	probeStarting, probeReady = 20*time.Millisecond, 20*time.Millisecond
	t.Cleanup(func() { probeStarting, probeReady = time.Second, 5*time.Second })

	var code atomic.Int32
	code.Store(http.StatusServiceUnavailable)
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(int(code.Load()))
	}))
	defer health.Close()

	root := t.TempDir()
	cfg := Config{Root: root, Services: []Service{
		{Name: "api", Run: []string{"sleep", "300"}, Health: health.URL},
		{Name: "web", Run: []string{"sleep", "300"}},
		{Name: "job", Run: []string{"sh", "-c", "sleep 0.2; exit 4"}, Manual: true},
	}}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		_ = Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard)
		close(done)
	}()
	t.Cleanup(func() { cancel(); <-done })

	stateIs := func(name string, want state) func() bool {
		return func() bool {
			s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
			return err == nil && stateOf(s, name) == want
		}
	}
	eventually(t, "api to be starting", stateIs("api", stateStarting))
	eventually(t, "web, with no health URL, to be running", stateIs("web", stateRunning))

	waited := make(chan error, 1)
	go func() { waited <- waitServices(t.Context(), cfg, []string{"api", "web"}, 10*time.Second) }()
	select {
	case err := <-waited:
		t.Fatalf("wait returned before api was ready: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	code.Store(http.StatusOK)
	eventually(t, "api to be ready", stateIs("api", stateReady))
	if err := <-waited; err != nil {
		t.Errorf("wait for api and web: %v", err)
	}

	code.Store(http.StatusInternalServerError)
	eventually(t, "api to be unhealthy", stateIs("api", stateUnhealthy))
	code.Store(http.StatusOK)
	eventually(t, "api to recover", stateIs("api", stateReady))

	if _, err := control(t.Context(), cfg, controlRequest{Command: "start", Service: "job"}); err != nil {
		t.Fatal(err)
	}
	if err := waitServices(t.Context(), cfg, []string{"job"}, 10*time.Second); err == nil || !strings.Contains(err.Error(), "exited") {
		t.Errorf("wait for a service that exits: %v", err)
	}
}

func TestHealthMustBeAnHTTPURL(t *testing.T) {
	cfg := Config{Services: []Service{{Name: "api", Run: []string{"api"}, Health: "localhost:8080/readyz"}}}
	if _, err := cfg.withDefaults(); err == nil {
		t.Error("a health URL without a scheme was accepted")
	}
}
