package dev

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

// pidOf reads the pid a test service wrote, once it has.
func pidOf(t *testing.T, path string) int {
	t.Helper()
	var pid int
	eventually(t, "a pid in "+filepath.Base(path), func() bool {
		b, err := os.ReadFile(path)
		pid, _ = strconv.Atoi(strings.TrimSpace(string(b)))
		return err == nil && pid > 0
	})
	return pid
}

func stateOf(services []status, name string) state {
	for _, s := range services {
		if s.Name == name {
			return s.State
		}
	}
	return ""
}

func testServices(root string) Config {
	write := func(name string) []string {
		return []string{"sh", "-c", "echo $$ > " + name + ".pid; echo " + name + " up; exec sleep 300"}
	}
	return Config{Root: root, Services: []Service{
		{Name: "api", Build: []string{"true"}, Run: write("api"), Watch: []string{"."}},
		{Name: "web", Run: write("web")},
		{Name: "worker", Run: write("worker"), Manual: true},
	}}
}

func TestControlDrivesARunningDev(t *testing.T) {
	root := t.TempDir()
	cfg := testServices(root)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard) }()
	t.Cleanup(func() { cancel(); <-done })

	status := func() []status {
		t.Helper()
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	eventually(t, "api and web to run", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "api") == stateRunning && stateOf(s, "web") == stateRunning
	})
	if got := stateOf(status(), "worker"); got != stateStopped {
		t.Errorf("manual worker = %s, want stopped until started", got)
	}

	web := pidOf(t, filepath.Join(root, "web.pid"))
	if _, err := control(t.Context(), cfg, controlRequest{Command: "stop", Service: "web"}); err != nil {
		t.Fatal(err)
	}
	if alive(web) || stateOf(status(), "web") != stateStopped {
		t.Errorf("after stop: web alive=%v state=%s", alive(web), stateOf(status(), "web"))
	}
	if stateOf(status(), "api") != stateRunning {
		t.Error("stopping web stopped api")
	}

	if _, err := control(t.Context(), cfg, controlRequest{Command: "start", Service: "worker"}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "worker to run", func() bool { return stateOf(status(), "worker") == stateRunning })
	if _, err := control(t.Context(), cfg, controlRequest{Command: "start", Service: "worker"}); err == nil {
		t.Error("starting a running service succeeded")
	}

	api := pidOf(t, filepath.Join(root, "api.pid"))
	_ = os.Remove(filepath.Join(root, "api.pid"))
	if _, err := control(t.Context(), cfg, controlRequest{Command: "restart", Service: "api"}); err != nil {
		t.Fatal(err)
	}
	if next := pidOf(t, filepath.Join(root, "api.pid")); next == api || alive(api) {
		t.Errorf("restart kept api: old %d (alive %v), new %d", api, alive(api), next)
	}

	if _, err := control(t.Context(), cfg, controlRequest{Command: "stop", Service: "nope"}); err == nil {
		t.Error("an unknown service was accepted")
	}
	if err := Up(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Errorf("a second dev in the same place: %v", err)
	}

	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	done <- nil
	if _, err := control(t.Context(), cfg, controlRequest{Command: "status"}); err == nil || !strings.Contains(err.Error(), "not running") {
		t.Errorf("status after dev stopped: %v", err)
	}
}

func TestTUIKeysDriveServices(t *testing.T) {
	root := t.TempDir()
	cfg := testServices(root)
	s, err := newSupervisor(cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- s.run(ctx) }()
	t.Cleanup(func() { cancel(); <-done })
	eventually(t, "web to run", func() bool { return stateOf(s.statuses(), "web") == stateRunning })

	m := &model{sup: s, ctx: ctx, cancel: cancel, name: "shop"}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 20})
	press := func(k string) tea.Cmd {
		var msg tea.KeyPressMsg
		switch k {
		case "down":
			msg = tea.KeyPressMsg{Code: tea.KeyDown}
		case "enter":
			msg = tea.KeyPressMsg{Code: tea.KeyEnter}
		case "esc":
			msg = tea.KeyPressMsg{Code: tea.KeyEscape}
		default:
			msg = tea.KeyPressMsg{Code: rune(k[0]), Text: k}
		}
		_, cmd := m.Update(msg)
		if cmd != nil {
			if done, ok := cmd().(actionMsg); ok {
				m.Update(done)
			}
		}
		return cmd
	}

	home := m.View().Content
	for _, want := range []string{"dev · shop", "api", "web", "worker", "manual"} {
		if !strings.Contains(home, want) {
			t.Errorf("home view lacks %q:\n%s", want, home)
		}
	}

	press("down") // web
	press("s")
	if got := stateOf(s.statuses(), "web"); got != stateStopped {
		t.Errorf("s on a running service: web = %s, want stopped", got)
	}
	press("s")
	eventually(t, "web to run again", func() bool { return stateOf(s.statuses(), "web") == stateRunning })

	press("enter")
	eventually(t, "web's output in its view", func() bool { return strings.Contains(m.View().Content, "web up") })
	if strings.Contains(m.View().Content, "api up") {
		t.Error("web's view shows api's output")
	}
	press("esc")
	press("a")
	eventually(t, "every service in all output", func() bool {
		v := m.View().Content
		return strings.Contains(v, "api") && strings.Contains(v, "api up") && strings.Contains(v, "web up")
	})

	press("q")
	if !m.quitting || ctx.Err() == nil {
		t.Error("q did not stop dev")
	}
}
