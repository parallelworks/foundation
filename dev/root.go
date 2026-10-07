package dev

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/lmittmann/tint"
	"github.com/spf13/cobra"
)

// NewRootCmd returns the dev command with the standard subcommands. An app
// with its own development tasks adds them with AddCommand.
func NewRootCmd(cfg Config) *cobra.Command {
	var verbose, plain bool
	logger := func() *slog.Logger {
		level := slog.LevelInfo
		if verbose {
			level = slog.LevelDebug
		}
		return slog.New(tint.NewTextHandler(os.Stderr, &tint.Options{
			Level:      level,
			TimeFormat: time.TimeOnly,
			NoColor:    !colorEnabled(os.Stderr),
		}))
	}

	root := &cobra.Command{
		Use:   "dev [service...]",
		Short: "Run the stack and the app's services, rebuilding servers when their sources change",
		Long: "With no command, dev runs what dev.json describes until interrupted: Postgres and S3, " +
			"and the services named, or every service not marked manual.",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, names []string) error {
			if !plain && interactive() {
				return runTUI(cmd.Context(), cfg, names)
			}
			return Up(cmd.Context(), cfg, logger(), os.Stdout, names...)
		},
	}
	root.Flags().BoolVar(&plain, "plain", false, "print prefixed output instead of the interactive view")
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "log debug output")
	var dir string
	root.PersistentFlags().StringVar(&dir, "dir", "", "directory for Postgres data and S3 objects (default .devstack beside dev.json)")
	root.PersistentPreRunE = func(*cobra.Command, []string) error {
		if dir == "" {
			return nil
		}
		// A flag is relative to where it was typed, not to the root.
		abs, err := filepath.Abs(dir)
		cfg.Dir = abs
		return err
	}

	root.AddCommand(&cobra.Command{
		Use:   "stack",
		Short: "Run Postgres and S3 until interrupted",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			stack, err := StartStack(ctx, cfg, logger())
			if err != nil {
				return err
			}
			<-ctx.Done()
			return stack.Stop(ctx)
		},
	})

	var timeout time.Duration
	wait := &cobra.Command{
		Use:   "wait [service...]",
		Short: "Wait until a running stack accepts connections, or until services are up",
		Long: "With no services, wait until the stack accepts connections. With services, wait until each " +
			"is ready (or running, without a health URL), and fail as soon as one fails, exits or turns unhealthy.",
		RunE: func(cmd *cobra.Command, names []string) error {
			if len(names) > 0 {
				return waitServices(cmd.Context(), cfg, names, timeout)
			}
			return WaitStack(cmd.Context(), cfg, timeout)
		},
	}
	wait.Flags().DurationVar(&timeout, "timeout", 2*time.Minute, "how long to wait")
	root.AddCommand(wait)

	root.AddCommand(&cobra.Command{
		Use:   "status",
		Short: "Show the services of the dev running here",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			resp, err := controlFull(cmd.Context(), cfg, controlRequest{Command: "status"})
			if err != nil {
				return err
			}
			if resp.Starting != "" {
				fmt.Fprintf(cmd.OutOrStdout(), "dev is %s…\n", resp.Starting)
			}
			printStatuses(cmd.OutOrStdout(), resp.Services)
			return nil
		},
	})
	for _, c := range []struct{ name, short string }{
		{"start", "Start a service in the dev running here"},
		{"stop", "Stop a service in the dev running here"},
		{"restart", "Restart a service in the dev running here, rebuilding a server"},
	} {
		root.AddCommand(&cobra.Command{
			Use:   c.name + " service",
			Short: c.short,
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				services, err := control(cmd.Context(), cfg, controlRequest{Command: c.name, Service: args[0]})
				if err != nil {
					return err
				}
				printStatuses(cmd.OutOrStdout(), services)
				return nil
			},
		})
	}

	var follow bool
	logs := &cobra.Command{
		Use:   "logs [service...]",
		Short: "Print services' output from the latest run",
		Long: "Print services' output from the latest run, as dev wrote it to their logs: one service as it is, " +
			"several (or, with none named, every service) with each line prefixed by its service. " +
			"Use it from another terminal, or from a tool, while dev runs.",
		RunE: func(cmd *cobra.Command, names []string) error {
			c, err := cfg.withDefaults()
			if err != nil {
				return err
			}
			if len(names) == 0 {
				for _, svc := range c.Services {
					names = append(names, svc.Name)
				}
			}
			return printLogs(cmd.Context(), filepath.Join(c.Dir, "logs"), names, follow, cmd.OutOrStdout())
		},
	}
	logs.Flags().BoolVarP(&follow, "follow", "f", false, "keep printing new output until interrupted")
	root.AddCommand(logs)

	root.AddCommand(&cobra.Command{
		Use:   "reset",
		Short: "Delete the stack's Postgres and S3 data",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return ResetStack(cmd.Context(), cfg, logger())
		},
	})
	return root
}

// colorEnabled follows the NO_COLOR convention, and keeps escape codes out
// of files and pipes.
func colorEnabled(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok || os.Getenv("NO_COLOR") != "" {
		return false
	}
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

// printLogs prints services' logs, prefixing lines with their service when
// there are several. Following, it interleaves them as they grow.
func printLogs(ctx context.Context, dir string, names []string, follow bool, out io.Writer) error {
	if len(names) == 1 {
		return printLog(ctx, LogPath(dir, names[0]), follow, out)
	}
	width := 0
	for _, n := range names {
		width = max(width, len(n))
	}
	var mu sync.Mutex
	errs := make([]error, len(names))
	var wg sync.WaitGroup
	for i, name := range names {
		w := &lineWriter{mu: &mu, out: out, prefix: fmt.Sprintf("%-*s │ ", width, name)}
		run := func() {
			errs[i] = printLog(ctx, LogPath(dir, name), follow, w)
			w.flush()
		}
		// Without following, keep each service's lines together.
		if follow {
			wg.Go(run)
		} else {
			run()
		}
	}
	wg.Wait()
	return errors.Join(errs...)
}

// printLog copies a log to out and, when following, keeps copying what is
// appended. A new run truncates the log, which starts the copy over.
func printLog(ctx context.Context, path string, follow bool, out io.Writer) error {
	f, err := os.Open(path) //nolint:gosec // a log under the stack's directory
	if err != nil {
		return err
	}
	defer f.Close()
	var offset int64
	for {
		n, err := io.Copy(out, f)
		if err != nil {
			return err
		}
		offset += n
		if !follow {
			return nil
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(250 * time.Millisecond):
		}
		if info, err := f.Stat(); err == nil && info.Size() < offset {
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				return err
			}
			offset = 0
		}
	}
}

// interactive reports whether both ends of the terminal are a person, which
// the full-screen view needs; pipes, CI and tools get prefixed lines.
func interactive() bool {
	for _, f := range []*os.File{os.Stdin, os.Stdout} {
		info, err := f.Stat()
		if err != nil || info.Mode()&os.ModeCharDevice == 0 {
			return false
		}
	}
	return os.Getenv("TERM") != "dumb"
}

func printStatuses(w io.Writer, services []status) {
	width := 0
	for _, s := range services {
		width = max(width, len(s.Name))
	}
	for _, s := range services {
		detail := s.Detail
		if s.State == stateStopped && s.Manual {
			detail = "manual"
		}
		fmt.Fprintf(w, "%-*s  %-9s  %4s  %s\n", width, s.Name, s.State, strings.TrimSpace(since(s.Since)),
			strings.TrimSpace(strings.Join([]string{s.URL, detail}, "  ")))
	}
}
