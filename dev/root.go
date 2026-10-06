package dev

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/lmittmann/tint"
	"github.com/spf13/cobra"
)

// NewRootCmd returns the dev command with the standard subcommands. An app
// with its own development tasks adds them with AddCommand.
func NewRootCmd(cfg Config) *cobra.Command {
	var verbose bool
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
			return Up(cmd.Context(), cfg, logger(), os.Stdout, names...)
		},
	}
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
		Use:   "wait",
		Short: "Wait until a running stack accepts connections",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return WaitStack(cmd.Context(), cfg, timeout)
		},
	}
	wait.Flags().DurationVar(&timeout, "timeout", 2*time.Minute, "how long to wait")
	root.AddCommand(wait)

	var follow bool
	logs := &cobra.Command{
		Use:   "logs service",
		Short: "Print a service's output from the latest run",
		Long: "Print a service's output from the latest run, as dev wrote it to its log. " +
			"Use it from another terminal, or from a tool, while dev runs.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := cfg.withDefaults()
			if err != nil {
				return err
			}
			return printLog(cmd.Context(), LogPath(filepath.Join(c.Dir, "logs"), args[0]), follow, cmd.OutOrStdout())
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
