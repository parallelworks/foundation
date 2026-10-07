package dev

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// environ is the environment for a command: from lowest to highest, the
// config's Env, the service's Env, the config's EnvFile, the service's
// EnvFile, and the real environment, so that `NAME=value go tool dev`
// overrides everything. svc is nil for before commands.
func (c Config) environ(svc *Service) ([]string, error) {
	vars, err := c.vars(svc)
	if err != nil {
		return nil, err
	}
	return underEnviron(vars), nil
}

// underEnviron is the real environment, with vars added where it has none.
func underEnviron(vars map[string]string) []string {
	env := os.Environ()
	for _, k := range slices.Sorted(maps.Keys(vars)) {
		if _, isSet := os.LookupEnv(k); !isSet {
			env = append(env, k+"="+vars[k])
		}
	}
	return env
}

// vars is what dev itself sets for a command: dev.json's env and the env
// files, without the real environment.
func (c Config) vars(svc *Service) (map[string]string, error) {
	vars := map[string]string{}
	set := func(env map[string]string) error {
		for k, v := range env {
			expanded, err := c.expand(v)
			if err != nil {
				return fmt.Errorf("env %s: %w", k, err)
			}
			vars[k] = expanded
		}
		return nil
	}
	files := []string{c.EnvFile}
	if err := set(c.Env); err != nil {
		return nil, err
	}
	if svc != nil {
		if err := set(svc.Env); err != nil {
			return nil, err
		}
		if svc.EnvFile != "" {
			files = append(files, svc.EnvFile)
		}
	}
	for _, f := range files {
		kvs, err := readDotenv(f)
		if err != nil {
			return nil, err
		}
		for _, kv := range kvs {
			k, v, _ := strings.Cut(kv, "=")
			vars[k] = v
		}
	}
	return vars, nil
}

// expand replaces the stack's names and {port.<name>} in a value with where
// they listen.
func (c Config) expand(v string) (string, error) {
	var missing error
	out := stackRef.ReplaceAllStringFunc(v, func(ref string) string {
		if name, ok := strings.CutPrefix(strings.Trim(ref, "{}"), "port."); ok {
			port, ok := c.ports[name]
			if !ok {
				port, ok = c.Ports[name]
			}
			if !ok {
				missing = fmt.Errorf("%s names no port in ports", ref)
				return ref
			}
			return strconv.Itoa(port)
		}
		var val string
		switch ref {
		case "{postgres}":
			val = c.DatabaseURL()
		case "{postgres_test}":
			val = c.TestDatabaseURL()
		case "{s3}":
			if c.S3 != nil {
				val = "http://" + c.S3.Addr
			}
		}
		if val == "" {
			missing = fmt.Errorf("%s needs %s configured", ref, strings.TrimSuffix(strings.Trim(ref, "{}"), "_test"))
		}
		return val
	})
	return out, missing
}

var stackRef = regexp.MustCompile(`\{(postgres|postgres_test|s3|port\.[a-z][a-z0-9_-]*)\}`)

// readDotenv reads KEY=value lines, skipping blanks and # comments. Values
// may be quoted; nothing is expanded.
func readDotenv(path string) ([]string, error) {
	f, err := os.Open(path) //nolint:gosec // the developer's own env file
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var env []string
	scanner := bufio.NewScanner(f)
	for n := 1; scanner.Scan(); n++ {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(strings.TrimPrefix(line, "export "), "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return nil, fmt.Errorf("%s:%d: want KEY=value", path, n)
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		env = append(env, key+"="+value)
	}
	return env, scanner.Err()
}
