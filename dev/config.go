// Package dev runs a web service's local development dependencies without
// Docker, and is the base for an app's own development command.
package dev

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

// ConfigFile is the name the dev command looks for, from the working
// directory up, so that `go -C tools tool dev` still finds the repository's.
const ConfigFile = "dev.json"

// Config describes an app's local stack.
type Config struct {
	// Name is the Postgres user, password and database, and required with
	// Postgres. Tests get Name_test.
	Name string `json:"name"`
	// Root is the directory commands run in and relative paths resolve
	// against. LoadConfig sets it to the config file's directory; otherwise
	// it defaults to the working directory.
	Root string `json:"-"`
	// Dir keeps Postgres data, S3 objects and service logs between runs;
	// defaults to .devstack.
	Dir string `json:"dir,omitempty"`
	// Env is set for every command. Values may name the stack:
	// {postgres} and {postgres_test} are database URLs, {s3} the S3 endpoint.
	Env map[string]string `json:"env,omitempty"`
	// EnvFile is a dotenv file for personal settings and secrets, over Env
	// and under the real environment. Defaults to .env; a missing file is
	// skipped.
	EnvFile string `json:"envFile,omitempty"`
	// Postgres runs when set.
	Postgres *Postgres `json:"postgres,omitempty"`
	// S3 runs when set.
	S3 *S3 `json:"s3,omitempty"`
	// Before lists commands run once, in order, before anything starts, such
	// as generating files a server embeds. A failure stops dev.
	Before [][]string `json:"before,omitempty"`
	// Services run until dev stops: servers rebuilt when their sources
	// change, and processes such as a Vite dev server.
	Services []Service `json:"services,omitempty"`
}

// Postgres configures the local PostgreSQL server.
type Postgres struct {
	// Port defaults to 5432.
	Port int `json:"port,omitempty"`
	// Parameters are server settings, e.g. max_connections for test suites
	// that open pools in parallel.
	Parameters map[string]string `json:"parameters,omitempty"`
}

// Service is a long-running command. With Build it is a server: built, run,
// and rebuilt and restarted when its sources change; a failed build stops it
// until the next change. Without, it runs once and is left stopped if it
// exits, so a startup error is not buried under restarts.
type Service struct {
	// Name prefixes its output, names its log, and selects it on the
	// command line.
	Name string `json:"name"`
	// Dir is where its commands run, relative to the root.
	Dir string `json:"dir,omitempty"`
	// Build compiles a server, e.g. ["go", "build", "-o", "tmp/shop", "./cmd/shop"].
	Build []string `json:"build,omitempty"`
	// Run starts it, e.g. ["tmp/shop", "serve"] or ["pnpm", "--filter", "web", "dev"].
	Run []string `json:"run"`
	// Watch lists the directories, relative to Dir, whose changes rebuild a
	// server; defaults to Dir. Hidden directories and node_modules are skipped.
	Watch []string `json:"watch,omitempty"`
	// Exclude names further directories to skip wherever they appear, such
	// as the frontend or the build output.
	Exclude []string `json:"exclude,omitempty"`
	// Extensions are the file types that rebuild a server; defaults to .go.
	Extensions []string `json:"extensions,omitempty"`
	// Env is set for this service over the config's Env, with the same
	// references to the stack.
	Env map[string]string `json:"env,omitempty"`
	// EnvFile is a dotenv file for this service, relative to Dir, over the
	// config's EnvFile.
	EnvFile string `json:"envFile,omitempty"`
	// Manual services start only when named: `dev web worker`.
	Manual bool `json:"manual,omitempty"`
}

// S3 configures the local S3-compatible server.
type S3 struct {
	// Addr defaults to 127.0.0.1:8333.
	Addr string `json:"addr,omitempty"`
}

// reserved are the dev command's own subcommands, which a service name would
// be unreachable behind.
var reserved = map[string]bool{"stack": true, "wait": true, "reset": true, "logs": true, "help": true, "completion": true}

// The name lands in connection URLs and is the default for credentials, so
// keep it to characters that need no escaping anywhere.
var validName = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// FindConfig returns the path of the nearest dev.json in dir or its parents.
func FindConfig(dir string) (string, error) {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	for d := dir; ; d = filepath.Dir(d) {
		path := filepath.Join(d, ConfigFile)
		if _, err := os.Stat(path); err == nil {
			return path, nil
		} else if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		if filepath.Dir(d) == d {
			return "", fmt.Errorf("no %s in %s or its parents", ConfigFile, dir)
		}
	}
}

// LoadConfig reads a dev.json, rooted at its directory.
func LoadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path) //nolint:gosec // the developer's own config
	if err != nil {
		return Config{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	// A misspelled key would otherwise quietly fall back to a default.
	dec.DisallowUnknownFields()
	var cfg Config
	if err := dec.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("%s: %w", path, err)
	}
	cfg.Root, err = filepath.Abs(filepath.Dir(path))
	return cfg, err
}

func (c Config) withDefaults() (Config, error) {
	if (c.Postgres != nil || c.Name != "") && !validName.MatchString(c.Name) {
		return c, fmt.Errorf("name %q must be lowercase letters, digits and underscores, starting with a letter", c.Name)
	}
	root, err := filepath.Abs(c.Root)
	if err != nil {
		return c, err
	}
	c.Root = root
	if c.Dir == "" {
		c.Dir = ".devstack"
	}
	c.Dir = c.path(c.Dir)
	if c.EnvFile == "" {
		c.EnvFile = ".env"
	}
	c.EnvFile = c.path(c.EnvFile)
	for i, cmd := range c.Before {
		if len(cmd) == 0 {
			return c, fmt.Errorf("before %d is empty", i)
		}
	}
	services := make([]Service, len(c.Services))
	seen := map[string]bool{}
	for i, svc := range c.Services {
		switch {
		case svc.Name == "" || len(svc.Run) == 0:
			return c, fmt.Errorf("service %d needs a name and run", i)
		case seen[svc.Name]:
			return c, fmt.Errorf("two services are named %q", svc.Name)
		case reserved[svc.Name]:
			return c, fmt.Errorf("service %q would be shadowed by the dev %s command", svc.Name, svc.Name)
		}
		seen[svc.Name] = true
		svc.Dir = c.path(svc.Dir)
		if svc.EnvFile != "" && !filepath.IsAbs(svc.EnvFile) {
			svc.EnvFile = filepath.Join(svc.Dir, svc.EnvFile)
		}
		if len(svc.Build) > 0 {
			if len(svc.Watch) == 0 {
				svc.Watch = []string{"."}
			}
			watch := make([]string, len(svc.Watch))
			for i, w := range svc.Watch {
				watch[i] = w
				if !filepath.IsAbs(w) {
					watch[i] = filepath.Join(svc.Dir, w)
				}
			}
			svc.Watch = watch
			if len(svc.Extensions) == 0 {
				svc.Extensions = []string{".go"}
			}
		}
		services[i] = svc
	}
	c.Services = services
	if c.Postgres != nil {
		pg := *c.Postgres
		if pg.Port == 0 {
			pg.Port = 5432
		}
		if pg.Port < 1 || pg.Port > 65535 {
			return c, fmt.Errorf("invalid postgres port %d", pg.Port)
		}
		c.Postgres = &pg
	}
	if c.S3 != nil {
		s3 := *c.S3
		if s3.Addr == "" {
			s3.Addr = "127.0.0.1:8333"
		}
		c.S3 = &s3
	}
	return c, nil
}

func (c Config) path(p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(c.Root, p)
}

// DatabaseURL is the URL of the app's database, or "" without Postgres.
func (c Config) DatabaseURL() string {
	return c.databaseURL(c.Name)
}

// TestDatabaseURL is the URL of the database for tests, or "" without Postgres.
func (c Config) TestDatabaseURL() string {
	return c.databaseURL(c.Name + "_test")
}

func (c Config) databaseURL(db string) string {
	c, err := c.withDefaults()
	if err != nil || c.Postgres == nil {
		return ""
	}
	return fmt.Sprintf("postgres://%s:%s@localhost:%d/%s?sslmode=disable", c.Name, c.Name, c.Postgres.Port, db)
}
