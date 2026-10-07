// Command dev runs an app's local development stack as described by the
// nearest dev.json. Apps with their own development tasks build their command
// on dev.NewRootCmd instead.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/parallelworks/foundation/dev"
)

func main() {
	if err := run(); err != nil {
		// dev exec passes on its command's status instead of its own.
		var exit dev.ExitError
		if errors.As(err, &exit) {
			os.Exit(exit.Code)
		}
		fmt.Fprintln(os.Stderr, "dev:", err)
		os.Exit(1)
	}
}

func run() error {
	// SIGHUP too, so closing the terminal stops Postgres cleanly instead of
	// leaving it holding the port.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer stop()

	path, err := dev.FindConfig(".")
	if err != nil {
		return err
	}
	cfg, err := dev.LoadConfig(path)
	if err != nil {
		return err
	}
	return dev.NewRootCmd(cfg).ExecuteContext(ctx)
}
