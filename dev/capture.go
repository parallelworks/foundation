package dev

import (
	"context"
	"io"
	"log"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/unix"
)

// captureOutput sends Go's global logger and anything written to this
// process's stderr, by dev or a library it uses, to w, so that nothing
// writes over the full-screen view. restore undoes it.
func captureOutput(w io.Writer) (restore func(), err error) {
	r, pw, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	saved, err := unix.Dup(int(os.Stderr.Fd()))
	if err != nil {
		_ = r.Close()
		_ = pw.Close()
		return nil, err
	}
	if err := unix.Dup2(int(pw.Fd()), int(os.Stderr.Fd())); err != nil {
		_ = unix.Close(saved)
		_ = r.Close()
		_ = pw.Close()
		return nil, err
	}
	_ = pw.Close() // stderr now holds the pipe's write end
	copied := make(chan struct{})
	go func() {
		_, _ = io.Copy(w, r)
		close(copied)
	}()
	log.SetOutput(w)
	return func() {
		log.SetOutput(os.Stderr)
		_ = unix.Dup2(saved, int(os.Stderr.Fd()))
		_ = unix.Close(saved)
		<-copied // the last write end closed with Dup2 above
		_ = r.Close()
	}, nil
}

// problems keeps dev's latest warning or error for the view's status line;
// what goes well is in dev's log, and in each row.
type problems struct {
	slog.Handler
	mu    *sync.Mutex
	last  *problem
	attrs []slog.Attr
}

type problem struct {
	text string
	at   time.Time
}

func newProblems(inner slog.Handler) *problems {
	return &problems{Handler: inner, mu: &sync.Mutex{}, last: &problem{}}
}

// Enabled takes every problem, whatever the handler it wraps would take.
func (p *problems) Enabled(ctx context.Context, l slog.Level) bool {
	return l >= slog.LevelWarn || p.Handler.Enabled(ctx, l)
}

func (p *problems) Handle(ctx context.Context, r slog.Record) error {
	if r.Level >= slog.LevelWarn {
		var service, detail []string
		add := func(a slog.Attr) bool {
			switch a.Key {
			case "service":
				service = append(service, a.Value.String())
			default:
				detail = append(detail, a.Value.String())
			}
			return true
		}
		for _, a := range p.attrs {
			add(a)
		}
		r.Attrs(add)
		text := r.Message
		if len(service) > 0 {
			text = service[0] + ": " + text
		}
		if len(detail) > 0 {
			text += ", " + strings.Join(detail, ", ")
		}
		p.mu.Lock()
		*p.last = problem{text: text, at: r.Time}
		p.mu.Unlock()
	}
	if !p.Handler.Enabled(ctx, r.Level) {
		return nil
	}
	return p.Handler.Handle(ctx, r)
}

func (p *problems) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &problems{Handler: p.Handler.WithAttrs(attrs), mu: p.mu, last: p.last, attrs: append(p.attrs[:len(p.attrs):len(p.attrs)], attrs...)}
}

func (p *problems) WithGroup(name string) slog.Handler {
	return &problems{Handler: p.Handler.WithGroup(name), mu: p.mu, last: p.last, attrs: p.attrs}
}

// recent is the latest problem, for a minute after it happened.
func (p *problems) recent() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	if time.Since(p.last.at) > time.Minute {
		return ""
	}
	return p.last.text
}
