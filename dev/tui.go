package dev

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/lmittmann/tint"
)

// runTUI runs the supervisor behind a full-screen view of its services: their
// states, each one's output, and keys to start, stop and restart them.
func runTUI(ctx context.Context, cfg Config, names []string) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// dev's own log goes to its own pane; on the terminal it would tear the
	// screen.
	devLog := &tuiLog{}
	logger := slog.New(tint.NewTextHandler(devLog, &tint.Options{TimeFormat: time.TimeOnly, NoColor: true}))
	s, err := newSupervisor(cfg, logger, discard{})
	if err != nil {
		return err
	}
	devLog.w = s.outputs.writer("dev")

	m := &model{sup: s, ctx: ctx, cancel: cancel, name: s.cfg.Name}
	p := tea.NewProgram(m, tea.WithContext(context.WithoutCancel(ctx)))
	runErr := make(chan error, 1)
	go func() {
		err := s.run(ctx, names...)
		runErr <- err
		p.Send(stoppedMsg{err: err})
	}()
	if _, err := p.Run(); err != nil {
		cancel()
		<-runErr
		return err
	}
	return m.err
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

// tuiLog hands dev's own log lines to a writer created once the supervisor
// exists.
type tuiLog struct{ w *lineWriter }

func (l *tuiLog) Write(p []byte) (int, error) {
	if l.w == nil {
		return len(p), nil
	}
	return l.w.Write(p)
}

type (
	tickMsg    struct{}
	stoppedMsg struct{ err error }
	actionMsg  struct{ err error }
)

type view int

const (
	viewHome view = iota
	viewLogs
	viewAll
)

type model struct {
	sup *supervisor
	// ctx is dev's own: services started from here run under it, and q
	// cancels it.
	ctx    context.Context
	cancel context.CancelFunc
	name   string

	view     view
	cursor   int
	scroll   int // lines up from the bottom of a log
	width    int
	height   int
	quitting bool
	notice   string
	err      error
}

func (m *model) Init() tea.Cmd { return tick() }

// The view follows output as it arrives without a message per line.
func tick() tea.Cmd {
	return tea.Tick(250*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} })
}

func (m *model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tickMsg:
		return m, tick()
	case stoppedMsg:
		m.err = msg.err
		return m, tea.Quit
	case actionMsg:
		m.notice = ""
		if msg.err != nil {
			m.notice = msg.err.Error()
		}
	case tea.KeyPressMsg:
		return m.key(msg.String())
	}
	return m, nil
}

func (m *model) key(k string) (tea.Model, tea.Cmd) {
	if k == "ctrl+c" || k == "q" {
		if !m.quitting {
			m.quitting = true
			m.cancel()
		}
		return m, nil
	}
	if m.quitting {
		return m, nil
	}
	services := m.sup.statuses()
	switch m.view {
	case viewHome:
		switch k {
		case "up", "k":
			m.cursor = max(m.cursor-1, 0)
		case "down", "j":
			m.cursor = min(m.cursor+1, len(services)-1)
		case "enter", "l":
			if len(services) > 0 {
				m.view, m.scroll = viewLogs, 0
			}
		case "a":
			m.view, m.scroll = viewAll, 0
		case "r":
			return m, m.act(services, m.restart)
		case "s":
			if m.cursor < len(services) && services[m.cursor].State == stateStopped {
				return m, m.act(services, m.start)
			}
			return m, m.act(services, m.sup.stop)
		}
	case viewLogs, viewAll:
		switch k {
		case "esc", "backspace", "h":
			m.view = viewHome
		case "up", "k":
			m.scroll++
		case "down", "j":
			m.scroll = max(m.scroll-1, 0)
		case "pgup":
			m.scroll += m.pageSize()
		case "pgdown":
			m.scroll = max(m.scroll-m.pageSize(), 0)
		case "end", "G":
			m.scroll = 0
		case "r":
			if m.view == viewLogs {
				return m, m.act(services, m.restart)
			}
		}
	}
	return m, nil
}

// act runs a start, stop or restart off the UI's goroutine: stopping waits
// for the service to exit.
func (m *model) act(services []status, do func(string) error) tea.Cmd {
	if m.cursor >= len(services) {
		return nil
	}
	name := services[m.cursor].Name
	m.notice = "…"
	return func() tea.Msg { return actionMsg{err: do(name)} }
}

func (m *model) start(name string) error   { return m.sup.start(m.ctx, name) }
func (m *model) restart(name string) error { return m.sup.restart(m.ctx, name) }

func (m *model) pageSize() int { return max(m.height-4, 1) }

var (
	titleStyle = lipgloss.NewStyle().Bold(true)
	dimStyle   = lipgloss.NewStyle().Faint(true)
	cursorBar  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12"))
	stateStyle = map[state]lipgloss.Style{
		stateRunning:   lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
		stateBuilding:  lipgloss.NewStyle().Foreground(lipgloss.Color("3")),
		stateFailed:    lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
		stateExited:    lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
		stateStopped:   lipgloss.NewStyle().Faint(true),
		stateStarting:  lipgloss.NewStyle().Foreground(lipgloss.Color("3")),
		stateReady:     lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
		stateUnhealthy: lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
	}
	stateMark = map[state]string{
		stateRunning: "●", stateBuilding: "◐", stateFailed: "✗", stateExited: "✗", stateStopped: "○",
		stateStarting: "◐", stateReady: "●", stateUnhealthy: "✗",
	}
)

func (m *model) View() tea.View {
	var b strings.Builder
	switch m.view {
	case viewHome:
		m.home(&b)
	case viewLogs:
		services := m.sup.statuses()
		name := services[min(m.cursor, len(services)-1)].Name
		m.log(&b, name, m.sup.lines(name), "esc back · r restart · ↑↓ pgup pgdn scroll · end follow · q quit")
	case viewAll:
		m.log(&b, "all output", m.sup.lines(""), "esc back · ↑↓ pgup pgdn scroll · end follow · q quit")
	}
	v := tea.NewView(b.String())
	v.AltScreen = true
	v.WindowTitle = "dev · " + m.name
	return v
}

func (m *model) home(b *strings.Builder) {
	title := "dev"
	if m.name != "" {
		title += " · " + m.name
	}
	b.WriteString(titleStyle.Render(title))
	if stack := m.stackLine(); stack != "" {
		b.WriteString(dimStyle.Render("   " + stack))
	}
	b.WriteString("\n\n")

	services := m.sup.statuses()
	width := 0
	for _, s := range services {
		width = max(width, len(s.Name))
	}
	for i, s := range services {
		bar := "  "
		if i == m.cursor {
			bar = cursorBar.Render("▌ ")
		}
		st := stateStyle[s.State]
		detail := s.Detail
		if s.State == stateStopped && s.Manual {
			detail = "manual"
		}
		fmt.Fprintf(b, "%s%s %-*s  %s  %s  %s\n", bar, st.Render(stateMark[s.State]), width, s.Name,
			st.Render(fmt.Sprintf("%-9s", s.State)), dimStyle.Render(since(s.Since)), dimStyle.Render(detail))
	}
	if len(services) == 0 {
		b.WriteString(dimStyle.Render("  no services in dev.json") + "\n")
	}

	b.WriteString("\n")
	if m.notice != "" {
		b.WriteString(m.notice + "\n")
	} else if devLines := m.sup.lines("dev"); len(devLines) > 0 {
		b.WriteString(dimStyle.Render(truncate(devLines[len(devLines)-1], m.width)) + "\n")
	} else {
		b.WriteString("\n")
	}
	if m.quitting {
		b.WriteString(dimStyle.Render("stopping…"))
	} else {
		b.WriteString(dimStyle.Render("↑↓ select · enter output · a all output · r restart · s start/stop · q quit"))
	}
}

func (m *model) stackLine() string {
	if what := m.sup.stackState(); what != "" {
		return what + "…"
	}
	var parts []string
	if m.sup.cfg.Postgres != nil {
		parts = append(parts, fmt.Sprintf("postgres :%d", m.sup.cfg.Postgres.Port))
	}
	if m.sup.cfg.S3 != nil {
		parts = append(parts, "s3 "+m.sup.cfg.S3.Addr)
	}
	return strings.Join(parts, " · ")
}

func (m *model) log(b *strings.Builder, title string, lines []string, help string) {
	b.WriteString(titleStyle.Render(title))
	if m.scroll > 0 {
		b.WriteString(dimStyle.Render(fmt.Sprintf("   %d lines up", m.scroll)))
	}
	b.WriteString("\n")
	page := m.pageSize()
	m.scroll = min(m.scroll, max(len(lines)-page, 0))
	end := len(lines) - m.scroll
	for _, line := range lines[max(end-page, 0):end] {
		b.WriteString(truncate(line, m.width) + "\n")
	}
	for range page - min(page, end) {
		b.WriteString("\n")
	}
	if m.quitting {
		help = "stopping…"
	} else if m.notice != "" {
		help = m.notice
	}
	b.WriteString(dimStyle.Render(help))
}

func since(t time.Time) string {
	d := time.Since(t).Round(time.Second)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%4ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%4dm", int(d.Minutes()))
	default:
		return fmt.Sprintf("%4dh", int(d.Hours()))
	}
}

// truncate keeps a line to the terminal's width; a wrapped line would push
// the view off the screen.
func truncate(s string, width int) string {
	if width <= 0 {
		return s
	}
	return lipgloss.NewStyle().MaxWidth(width).Render(s)
}
