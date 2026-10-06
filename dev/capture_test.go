package dev

import (
	"fmt"
	"log"
	"log/slog"
	"os"
	"strings"
	"testing"
)

func TestCaptureOutputKeepsStrayWritesOffTheScreen(t *testing.T) {
	var got syncBuffer
	restore, err := captureOutput(&got)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Fprintln(os.Stderr, "a library writing to stderr")
	log.Print("a library using the global logger")
	restore()

	for _, want := range []string{"a library writing to stderr", "a library using the global logger"} {
		if !strings.Contains(got.String(), want) {
			t.Errorf("captured %q, missing %q", got.String(), want)
		}
	}
	// stderr is the terminal's again: this would block or vanish otherwise.
	if _, err := fmt.Fprint(os.Stderr, ""); err != nil {
		t.Errorf("stderr after restore: %v", err)
	}
}

func TestStatusLineShowsOnlyProblems(t *testing.T) {
	p := newProblems(slog.DiscardHandler)
	logger := slog.New(p)
	logger.Info("up", "service", "web", "url", "http://localhost:5173/")
	if got := p.recent(); got != "" {
		t.Errorf("an info line reached the status line: %q", got)
	}
	logger.With("service", "web").Warn("exited", "status", "exit status 1")
	if got, want := p.recent(), "web: exited, exit status 1"; got != want {
		t.Errorf("status line = %q, want %q", got, want)
	}
}
