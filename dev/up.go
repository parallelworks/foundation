package dev

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// stopGrace bounds a server's or process's graceful shutdown before it is
// killed; servers drain requests on SIGTERM.
const stopGrace = 10 * time.Second

// Up runs the stack and the services until ctx ends: those named, or every
// service not marked Manual. Each service's output is prefixed with its name
// and also written to its log under cfg.Dir.
func Up(ctx context.Context, cfg Config, logger *slog.Logger, out io.Writer, names ...string) error {
	cfg, err := cfg.withDefaults()
	if err != nil {
		return err
	}
	services, err := cfg.selectServices(names)
	if err != nil {
		return err
	}
	env, err := cfg.environ(nil)
	if err != nil {
		return err
	}
	o, err := newOutputs(out, cfg, services)
	if err != nil {
		return err
	}
	defer o.close()
	if err := runBefore(ctx, cfg, env, o.writer("before")); err != nil || ctx.Err() != nil {
		return err
	}

	if cfg.Postgres != nil || cfg.S3 != nil {
		stack, err := StartStack(ctx, cfg, logger)
		if err != nil {
			return err
		}
		defer func() {
			if err := stack.Stop(context.WithoutCancel(ctx)); err != nil {
				logger.ErrorContext(ctx, "stop stack", "error", err)
			}
		}()
	}

	// Compiling every server at once exhausts a laptop's memory.
	builds := make(chan struct{}, 1)
	var wg sync.WaitGroup
	for _, svc := range services {
		env, err := cfg.environ(&svc)
		if err != nil {
			return fmt.Errorf("%s: %w", svc.Name, err)
		}
		w := o.writer(svc.Name)
		log := logger.With("service", svc.Name)
		if len(svc.Build) > 0 {
			wg.Go(func() { runServer(ctx, cfg, svc, env, builds, w, log) })
		} else {
			wg.Go(func() { runProcess(ctx, svc, env, w, log) })
		}
	}
	wg.Wait()
	return nil
}

func (c Config) selectServices(names []string) ([]Service, error) {
	if len(names) == 0 {
		var services []Service
		for _, svc := range c.Services {
			if !svc.Manual {
				services = append(services, svc)
			}
		}
		return services, nil
	}
	services := make([]Service, 0, len(names))
	for _, name := range names {
		i := slices.IndexFunc(c.Services, func(s Service) bool { return s.Name == name })
		if i < 0 {
			return nil, fmt.Errorf("no service named %q", name)
		}
		services = append(services, c.Services[i])
	}
	return services, nil
}

func runBefore(ctx context.Context, cfg Config, env []string, out *lineWriter) error {
	defer out.flush()
	for _, cmd := range cfg.Before {
		p, err := startProc(cmd, cfg.Root, env, out)
		if err != nil {
			return fmt.Errorf("before: %w", err)
		}
		select {
		case <-ctx.Done():
			p.stop()
			return nil
		case <-p.done:
			p.drain()
		}
		if p.err != nil {
			return fmt.Errorf("before: %s: %s", strings.Join(cmd, " "), exitStatus(p.err))
		}
	}
	return nil
}

func runProcess(ctx context.Context, svc Service, env []string, out *lineWriter, logger *slog.Logger) {
	defer out.flush()
	proc, err := startProc(svc.Run, svc.Dir, env, out)
	if err != nil {
		logger.ErrorContext(ctx, "start", "error", err)
		return
	}
	select {
	case <-ctx.Done():
		proc.stop()
	case <-proc.done:
		proc.drain()
		logger.WarnContext(ctx, "exited", "status", exitStatus(proc.err))
	}
}

func runServer(ctx context.Context, cfg Config, svc Service, env []string, builds chan struct{}, out *lineWriter, logger *slog.Logger) {
	defer out.flush()
	// The stack's own data and logs change constantly and are never source.
	w, err := newWatcher(svc.Watch, append([]string{cfg.Dir}, svc.Exclude...), svc.Extensions, logger)
	if err != nil {
		logger.ErrorContext(ctx, "watch", "error", err)
		return
	}
	changed := make(chan struct{}, 1)
	go w.run(ctx, changed)

	var server *proc
	defer func() {
		if server != nil {
			server.stop()
		}
	}()
	for {
		start := time.Now()
		built := build(ctx, svc, env, builds, out)
		if ctx.Err() != nil {
			return
		}
		if server != nil {
			server.stop()
			server = nil
		}
		if built {
			logger.InfoContext(ctx, "built", "in", time.Since(start).Round(time.Millisecond))
			if server, err = startProc(svc.Run, svc.Dir, env, out); err != nil {
				logger.ErrorContext(ctx, "start", "error", err)
			}
		} else {
			logger.ErrorContext(ctx, "build failed; waiting for a change")
		}

		var exited <-chan struct{}
		if server != nil {
			exited = server.done
		}
		select {
		case <-ctx.Done():
			return
		case <-changed:
		case <-exited:
			logger.WarnContext(ctx, "exited; waiting for a change", "status", exitStatus(server.err))
			server = nil
			select {
			case <-ctx.Done():
				return
			case <-changed:
			}
		}
	}
}

func build(ctx context.Context, svc Service, env []string, builds chan struct{}, out io.Writer) bool {
	select {
	case builds <- struct{}{}:
		defer func() { <-builds }()
	case <-ctx.Done():
		return false
	}
	p, err := startProc(svc.Build, svc.Dir, env, out)
	if err != nil {
		fmt.Fprintln(out, err)
		return false
	}
	select {
	case <-ctx.Done():
		p.stop()
		return false
	case <-p.done:
		return p.err == nil
	}
}

// outputs prefixes each source's lines with its name, padded to align, and
// writes them unprefixed to the source's log.
type outputs struct {
	mu    sync.Mutex
	out   io.Writer
	logs  string
	files []*os.File
	width int
	color bool
	next  int
}

func newOutputs(out io.Writer, cfg Config, services []Service) (*outputs, error) {
	logs := filepath.Join(cfg.Dir, "logs")
	if err := os.MkdirAll(logs, 0o750); err != nil {
		return nil, err
	}
	o := &outputs{out: out, logs: logs, width: len("before"), color: colorEnabled(out)}
	for _, svc := range services {
		o.width = max(o.width, len(svc.Name))
	}
	return o, nil
}

// Distinct from tint's level colors, so a line's source and severity differ.
var palette = []string{"36", "35", "34", "33", "32"}

func (o *outputs) writer(name string) *lineWriter {
	prefix := fmt.Sprintf("%-*s │ ", o.width, name)
	if o.color {
		prefix = "\x1b[" + palette[o.next%len(palette)] + "m" + prefix + "\x1b[0m"
		o.next++
	}
	w := &lineWriter{mu: &o.mu, out: o.out, prefix: prefix}
	// Each run starts its logs afresh; a log that cannot be opened only
	// costs the copy, never the terminal output.
	if f, err := os.Create(LogPath(o.logs, name)); err == nil {
		o.files = append(o.files, f)
		w.log = f
	}
	return w
}

func (o *outputs) close() {
	for _, f := range o.files {
		_ = f.Close()
	}
}

// LogPath is where a service's output from the latest run is kept, given the
// directory of a stack's logs.
func LogPath(logs, service string) string {
	return filepath.Join(logs, service+".log")
}
