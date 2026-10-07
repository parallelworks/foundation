package dev

import (
	"context"
	"io"
	"log/slog"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestAnAppExtendsTheView(t *testing.T) {
	cfg := Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	var pressed atomic.Int32
	var ext extension
	for _, o := range []Option{
		WithRows(func(context.Context) []Row {
			return []Row{
				{Name: "tunnel", State: "ok", Detail: ":27017", URL: "http://localhost:27017"},
				{Name: "proxy", State: "error", Detail: "auth key missing"},
			}
		}),
		WithKey(Key{Key: "e", Help: "env", Do: func(context.Context) error { pressed.Add(1); return nil }}),
	} {
		o(&ext)
	}
	m := &model{sup: s, ctx: t.Context(), cancel: func() {}, ext: ext}
	m.Update(tea.WindowSizeMsg{Width: 120, Height: 20})

	// The rows come from a command the tick issues.
	_, cmd := m.Update(tickMsg{})
	batch, ok := cmd().(tea.BatchMsg)
	if !ok {
		t.Fatal("the tick did not fetch the rows")
	}
	for _, c := range batch {
		if msg, ok := c().(rowsMsg); ok {
			m.Update(msg)
		}
	}
	view := ansi.Strip(m.View().Content)
	for _, want := range []string{"tunnel", ":27017", "http://localhost:27017", "proxy", "auth key missing", "e env"} {
		if !strings.Contains(view, want) {
			t.Errorf("view lacks %q:\n%s", want, view)
		}
	}

	_, cmd = m.Update(tea.KeyPressMsg{Code: 'e', Text: "e"})
	if cmd == nil {
		t.Fatal("the app's key did nothing")
	}
	m.Update(cmd())
	if pressed.Load() != 1 {
		t.Errorf("the app's key ran %d times", pressed.Load())
	}
}

func TestAnAppsKeyMayNotTakeTheViewsOwn(t *testing.T) {
	defer func() {
		if msg, _ := recover().(string); !strings.Contains(msg, `"r"`) {
			t.Errorf("WithKey(r) panicked with %q, want a message naming it", msg)
		}
	}()
	NewRootCmd(Config{}, WithKey(Key{Key: "r", Help: "mine", Do: func(context.Context) error { return nil }}))
}

func TestAnAppAddsMCPTools(t *testing.T) {
	type in struct{}
	type out struct {
		Text string `json:"text"`
	}
	var ext extension
	WithMCP(func(s *mcp.Server) {
		mcp.AddTool(s, &mcp.Tool{Name: "query_db", Description: "the app's own"},
			func(context.Context, *mcp.CallToolRequest, in) (*mcp.CallToolResult, out, error) {
				return nil, out{Text: "rows"}, nil
			})
	})(&ext)

	serverT, clientT := mcp.NewInMemoryTransports()
	if _, err := newMCPServer(Config{Root: t.TempDir()}, ext).Connect(t.Context(), serverT, nil); err != nil {
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
	if !slices.Contains(names, "query_db") || !slices.Contains(names, "status") {
		t.Errorf("tools = %v, want the app's beside dev's", names)
	}
}
