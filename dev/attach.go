package dev

import (
	"bufio"
	"context"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"sync"
	"time"

	tea "charm.land/bubbletea/v2"
)

// backend is what the interactive view shows and drives: the supervisor in
// this process, or a dev already running for the checkout.
type backend interface {
	statuses() []status
	lines(name string) []string
	start(ctx context.Context, name string) error
	halt(ctx context.Context, name string) error
	restart(ctx context.Context, name string) error
	stackState() (string, time.Time)
	// use switches dev to other profiles; profileChoices lists them.
	use(ctx context.Context, profiles []string) error
	profileChoices() (all, active []string)
	// stackAddrs is where Postgres and S3 listen; 0 and "" without them.
	stackAddrs() (postgres int, s3 string)
}

// halt is stop, for the view, which passes its context to a remote dev.
func (s *supervisor) halt(_ context.Context, name string) error { return s.stop(name) }

func (s *supervisor) stackAddrs() (int, string) {
	var pg int
	var s3 string
	if s.cfg.Postgres != nil {
		pg = s.cfg.Postgres.Port
	}
	if s.cfg.S3 != nil {
		s3 = s.cfg.S3.Addr
	}
	return pg, s3
}

// remote shows a dev running elsewhere: its states over the control socket,
// its output from the logs it writes.
type remote struct {
	cfg  Config
	logs string

	mu   sync.Mutex
	last controlResponse
}

func newRemote(ctx context.Context, cfg Config) (*remote, error) {
	c, err := cfg.withDefaults()
	if err != nil {
		return nil, err
	}
	r := &remote{cfg: c, logs: filepath.Join(c.Dir, "logs")}
	if err := r.refresh(ctx); err != nil {
		return nil, err
	}
	go func() {
		tick := time.NewTicker(250 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				_ = r.refresh(ctx)
			}
		}
	}()
	return r, nil
}

func (r *remote) refresh(ctx context.Context) error {
	resp, err := controlFull(ctx, r.cfg, controlRequest{Command: "info"})
	if err != nil {
		return err
	}
	r.mu.Lock()
	r.last = resp
	r.mu.Unlock()
	return nil
}

func (r *remote) snapshot() controlResponse {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.last
}

func (r *remote) statuses() []status { return r.snapshot().Services }

func (r *remote) stackState() (string, time.Time) { return r.snapshot().Starting, time.Time{} }

func (r *remote) stackAddrs() (int, string) {
	info := r.snapshot().Info
	if info == nil {
		return 0, ""
	}
	var s3 string
	if port := info.Ports["s3"]; port != 0 {
		s3 = "127.0.0.1:" + strconv.Itoa(port)
	}
	return info.Ports["postgres"], s3
}

func (r *remote) version() string {
	if info := r.snapshot().Info; info != nil {
		return info.Version
	}
	return ""
}

// lines reads the end of a service's log, or of everything's when name is
// empty, as the running dev writes them.
func (r *remote) lines(name string) []string {
	file := "all"
	if name != "" {
		file = name
	}
	f, err := os.Open(LogPath(r.logs, file))
	if err != nil {
		return nil
	}
	defer f.Close()
	keep := serviceLines
	if name == "" {
		keep = allLines
	}
	ring := newRing(keep)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		ring.add(scanner.Text())
	}
	return ring.lines()
}

func (r *remote) start(ctx context.Context, name string) error {
	return r.act(ctx, "start", name)
}

func (r *remote) halt(ctx context.Context, name string) error {
	return r.act(ctx, "stop", name)
}

func (r *remote) restart(ctx context.Context, name string) error {
	return r.act(ctx, "restart", name)
}

func (r *remote) act(ctx context.Context, command, name string) error {
	_, err := controlFull(ctx, r.cfg, controlRequest{Command: command, Service: name})
	_ = r.refresh(ctx)
	return err
}

// runAttached opens the view on the dev already running for the checkout.
// q leaves it running; Q stops it.
func runAttached(ctx context.Context, cfg Config) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	r, err := newRemote(ctx, cfg)
	if err != nil {
		return err
	}
	m := &model{sup: r, ctx: ctx, cancel: cancel, name: r.cfg.Name, attached: true}
	if v := r.version(); v != version() {
		m.notice = fmt.Sprintf("attached to dev %s; this is dev %s", v, version())
	}
	if _, err := tea.NewProgram(m, tea.WithContext(context.WithoutCancel(ctx))).Run(); err != nil {
		return err
	}
	return m.err
}

func (r *remote) use(ctx context.Context, profiles []string) error {
	_, err := controlFull(ctx, r.cfg, controlRequest{Command: "use", Profiles: profiles})
	return err
}

func (r *remote) profileChoices() (all, active []string) {
	if info := r.snapshot().Info; info != nil {
		active = info.Profiles
	}
	return slices.Sorted(maps.Keys(r.cfg.Profiles)), active
}
