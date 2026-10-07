package dev

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"
)

// A running dev answers on a Unix socket, so that another terminal or a tool
// can see and drive its services: `dev status`, `dev restart api`.

type controlRequest struct {
	Command string `json:"command"` // status, start, stop or restart
	Service string `json:"service,omitempty"`
}

type controlResponse struct {
	Services []status `json:"services,omitempty"`
	// Starting says what dev is doing before its services start, such as
	// starting the stack; until then every service reads stopped.
	Starting string `json:"starting,omitempty"`
	Error    string `json:"error,omitempty"`
}

// socketPath is the control socket of the dev whose stack lives in dir. It
// sits in a directory only this user can enter, since a request makes dev
// run the app's commands, and is named by a hash so that it stays under the
// platform's limit on socket paths however deep the checkout is.
func socketPath(dir string) (string, error) {
	sockets, err := socketDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(sockets, 0o700); err != nil {
		return "", err
	}
	// MkdirAll leaves an existing directory as it is; one others can enter
	// would let them drive this user's dev.
	info, err := os.Stat(sockets)
	if err != nil {
		return "", err
	}
	if info.Mode().Perm()&0o077 != 0 {
		return "", fmt.Errorf("%s is open to other users (mode %v); make it 0700", sockets, info.Mode().Perm())
	}
	sum := sha256.Sum256([]byte(dir))
	return filepath.Join(sockets, hex.EncodeToString(sum[:8])+".sock"), nil
}

// socketDir holds every running dev's socket, which is how one dev finds
// another. It is runtime state, so not a cache directory, which the system
// may clear while dev runs: $XDG_RUNTIME_DIR where the system provides one,
// otherwise ~/.local/state.
func socketDir() (string, error) {
	if run := os.Getenv("XDG_RUNTIME_DIR"); run != "" {
		return filepath.Join(run, "foundation-dev"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "state", "foundation-dev"), nil
}

// serveControl answers control requests until ctx ends. It fails when
// another dev already answers for the same stack.
func (s *supervisor) serveControl(ctx context.Context) (func(), error) {
	path, err := socketPath(s.cfg.Dir)
	if err != nil {
		return nil, err
	}
	if conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "unix", path); err == nil {
		_ = conn.Close()
		return nil, fmt.Errorf("dev is already running in %s; see `dev status`", s.cfg.Root)
	}
	// A socket left by a dev that was killed answers nothing; replace it.
	_ = os.Remove(path)
	ln, err := (&net.ListenConfig{}).Listen(ctx, "unix", path)
	if err != nil {
		return nil, fmt.Errorf("control socket: %w", err)
	}
	// Services started here run under ctx, dev's own, and outlive the
	// request that started them.
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go s.answer(ctx, conn)
		}
	}()
	return func() {
		_ = ln.Close()
		_ = os.Remove(path)
	}, nil
}

func (s *supervisor) answer(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(stopGrace + 5*time.Second))
	var req controlRequest
	if err := json.NewDecoder(conn).Decode(&req); err != nil {
		return
	}
	var err error
	switch req.Command {
	case "status":
	case "start":
		err = s.start(ctx, req.Service)
	case "stop":
		err = s.stop(req.Service)
	case "restart":
		err = s.restart(ctx, req.Service)
	default:
		err = fmt.Errorf("unknown command %q", req.Command)
	}
	resp := controlResponse{Services: s.statuses(), Starting: s.starting()}
	if err != nil {
		resp.Error = err.Error()
	}
	_ = json.NewEncoder(conn).Encode(resp)
}

var errNotRunning = errors.New("dev is not running")

// control sends a request to the dev running for cfg's stack.
func control(ctx context.Context, cfg Config, req controlRequest) ([]status, error) {
	resp, err := controlFull(ctx, cfg, req)
	return resp.Services, err
}

func controlFull(ctx context.Context, cfg Config, req controlRequest) (controlResponse, error) {
	c, err := cfg.withDefaults()
	if err != nil {
		return controlResponse{}, err
	}
	path, err := socketPath(c.Dir)
	if err != nil {
		return controlResponse{}, err
	}
	conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "unix", path)
	if err != nil {
		return controlResponse{}, fmt.Errorf("%w in %s", errNotRunning, c.Root)
	}
	defer conn.Close()
	if err := json.NewEncoder(conn).Encode(req); err != nil {
		return controlResponse{}, err
	}
	var resp controlResponse
	if err := json.NewDecoder(conn).Decode(&resp); err != nil {
		return controlResponse{}, err
	}
	if resp.Error != "" {
		return resp, errors.New(resp.Error)
	}
	return resp, nil
}
