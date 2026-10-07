package dev

import (
	"slices"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPToolsDriveTheRunningDev(t *testing.T) {
	cfg := testServices(t.TempDir())
	runUp(t, cfg)
	eventually(t, "api and web to run", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "api") == stateRunning && stateOf(s, "web") == stateRunning
	})

	serverT, clientT := mcp.NewInMemoryTransports()
	if _, err := newMCPServer(cfg).Connect(t.Context(), serverT, nil); err != nil {
		t.Fatal(err)
	}
	session, err := mcp.NewClient(&mcp.Implementation{Name: "test"}, nil).Connect(t.Context(), clientT, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	tools, err := session.ListTools(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, tool := range tools.Tools {
		names = append(names, tool.Name)
	}
	for _, want := range []string{"status", "logs", "start", "stop", "restart", "wait", "up", "down"} {
		if !slices.Contains(names, want) {
			t.Errorf("tools %v lack %s", names, want)
		}
	}

	call := func(name string, args map[string]any) string {
		t.Helper()
		res, err := session.CallTool(t.Context(), &mcp.CallToolParams{Name: name, Arguments: args})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		var b strings.Builder
		for _, c := range res.Content {
			if tc, ok := c.(*mcp.TextContent); ok {
				b.WriteString(tc.Text)
			}
		}
		if res.IsError {
			t.Fatalf("%s failed: %s", name, b.String())
		}
		return b.String()
	}

	if out := call("status", nil); !strings.Contains(out, "api") || !strings.Contains(out, "http://localhost:8080") {
		t.Errorf("status = %q, want services and api's URL", out)
	}
	eventually(t, "web's output in its log", func() bool {
		return strings.Contains(call("logs", map[string]any{"service": "web"}), "web up")
	})
	if out := call("logs", map[string]any{"match": "api"}); strings.Contains(out, "web up") {
		t.Errorf("logs matching api returned web's line: %q", out)
	}

	call("stop", map[string]any{"service": "web"})
	if s, _ := control(t.Context(), cfg, controlRequest{Command: "status"}); stateOf(s, "web") != stateStopped {
		t.Errorf("web after stop = %s", stateOf(s, "web"))
	}
	call("start", map[string]any{"service": "web"})
	call("restart", map[string]any{"service": "api"})
	if out := call("wait", map[string]any{"services": []string{"api", "web"}, "timeout_seconds": 30}); !strings.Contains(out, "up") {
		t.Errorf("wait = %q", out)
	}

	res, err := session.CallTool(t.Context(), &mcp.CallToolParams{Name: "stop", Arguments: map[string]any{"service": "nope"}})
	if err != nil {
		t.Fatal(err)
	}
	if !res.IsError {
		t.Error("stopping an unknown service did not report an error")
	}
}
