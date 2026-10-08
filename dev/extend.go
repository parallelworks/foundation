package dev

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// An app's own dev, built on NewRootCmd, extends the view and the MCP server
// with options; its own commands it adds with AddCommand.

// Option extends the dev command NewRootCmd builds.
type Option func(*extension)

type extension struct {
	rows func(context.Context) []Row
	keys []Key
	mcp  []func(*mcp.Server)
}

// Row is a line the view shows above the services, for something the app
// runs beside them, such as a tunnel to a shared database.
type Row struct {
	Name string
	// State colors the row: "ok", "busy", "error" or "off".
	State string
	// Detail is a short note, such as a port or an error.
	Detail string
	// URL, if any, is shown as a link.
	URL string
}

// Key is a key the view's main screen answers, beside its own.
type Key struct {
	// Key is as the view reads it, such as "e" or "ctrl+e"; it must not be one
	// of the view's own.
	Key string
	// Help is the few words the help line shows for it.
	Help string
	// Do runs off the view's goroutine; its error is shown on the status line.
	Do func(context.Context) error
}

// WithRows shows rows above the services, refreshed every second. rows runs
// off the view's goroutine and should answer quickly.
func WithRows(rows func(context.Context) []Row) Option {
	return func(e *extension) { e.rows = rows }
}

// WithKey adds a key to the view's main screen.
func WithKey(k Key) Option {
	return func(e *extension) { e.keys = append(e.keys, k) }
}

// WithMCP adds tools, or anything else, to the server `dev mcp` answers with.
func WithMCP(add func(*mcp.Server)) Option {
	return func(e *extension) { e.mcp = append(e.mcp, add) }
}

// viewKeys are the main screen's own keys, which an app's may not take.
var viewKeys = map[string]bool{
	"up": true, "down": true, "k": true, "j": true, "enter": true, "l": true, "a": true,
	"r": true, "s": true, "p": true, "q": true, "Q": true, "ctrl+c": true,
}
