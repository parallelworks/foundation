package dev

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

// logBackend is a backend with one service and fixed output; the log view
// reads only its statuses and lines.
type logBackend struct {
	backend
	out []string
}

func (b logBackend) statuses() []status              { return []status{{Name: "api", State: stateRunning}} }
func (b logBackend) lines(string) []string           { return b.out }
func (b logBackend) stackState() (string, time.Time) { return "", time.Time{} }

func TestWLongLinesWrapInALog(t *testing.T) {
	link := "http://localhost:8080/verify?token=" + strings.Repeat("x", 150)
	out := []string{"short", "\x1b[32mINF\x1b[0m email text=\"open " + link + " to verify\"", "last"}
	m := &model{sup: logBackend{out: out}, ctx: t.Context(), cancel: func() {}}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 20})
	press := func(k string) { m.Update(tea.KeyPressMsg{Code: rune(k[0]), Text: k}) }
	view := func() string { return ansi.Strip(m.View().Content) }

	press("l")
	if strings.Contains(strings.ReplaceAll(view(), "\n", ""), link) {
		t.Fatalf("a long line is whole before w:\n%s", view())
	}
	if !strings.Contains(view(), "w wrap") {
		t.Errorf("help lacks w:\n%s", view())
	}

	press("w")
	v := view()
	for _, row := range strings.Split(v, "\n") {
		if ansi.StringWidth(row) > 100 {
			t.Errorf("a wrapped row is wider than the screen: %q", row)
		}
	}
	if !strings.Contains(strings.ReplaceAll(v, "\n", ""), link) {
		t.Errorf("the wrapped line lost text:\n%s", v)
	}
	if !strings.Contains(v, "short") || !strings.Contains(v, "last") || !strings.Contains(v, "w unwrap") {
		t.Errorf("wrapped view:\n%s", v)
	}
	// Scrolling counts rows: the top is as far up as the wrapped log is tall.
	press("g")
	if rows := len(m.screenRows(out)); m.scroll != max(rows-m.pageSize(), 0) || rows <= len(out) {
		t.Errorf("g scrolled to %d of %d rows", m.scroll, rows)
	}

	press("w")
	if strings.Contains(strings.ReplaceAll(view(), "\n", ""), link) {
		t.Errorf("w again did not cut the line:\n%s", view())
	}
}
