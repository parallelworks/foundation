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
// overrides everything. A ${NAME} in dev.json's env reads the env files and
// the real environment. svc is nil for before commands.
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
	files := []string{c.EnvFile}
	if svc != nil && svc.EnvFile != "" {
		files = append(files, svc.EnvFile)
	}
	fromFiles := map[string]string{}
	for _, f := range files {
		kvs, err := readDotenv(f)
		if err != nil {
			return nil, err
		}
		for _, kv := range kvs {
			k, v, _ := strings.Cut(kv, "=")
			fromFiles[k] = v
		}
	}
	// ${NAME} reads what the command would see without dev.json, so a value
	// dev.json composes, such as a URL, can hold a secret kept in an env file.
	lookup := func(name string) (string, bool) {
		if v, ok := os.LookupEnv(name); ok {
			return v, true
		}
		v, ok := fromFiles[name]
		return v, ok
	}

	vars := map[string]string{}
	set := func(env map[string]string) error {
		for k, v := range env {
			expanded, err := c.expand(v)
			if err == nil {
				expanded, err = expandRefs(expanded, lookup)
			}
			if err != nil {
				return fmt.Errorf("env %s: %w", k, err)
			}
			vars[k] = expanded
		}
		return nil
	}
	if err := set(c.Env); err != nil {
		return nil, err
	}
	if svc != nil {
		if err := set(svc.Env); err != nil {
			return nil, err
		}
	}
	maps.Copy(vars, fromFiles)
	return vars, nil
}

var envRef = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

// expandRefs replaces each ${NAME} in v with lookup's value for NAME.
func expandRefs(v string, lookup func(string) (string, bool)) (string, error) {
	var missing []string
	out := envRef.ReplaceAllStringFunc(v, func(ref string) string {
		name := ref[2 : len(ref)-1]
		val, ok := lookup(name)
		if !ok {
			missing = append(missing, name)
		}
		return val
	})
	if len(missing) > 0 {
		return "", fmt.Errorf("${%s} is set in no env file and not in the environment", strings.Join(missing, "}, ${"))
	}
	return out, nil
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
		case "{dir}":
			val = c.Dir
		case "{root}":
			val = c.Root
		case "{instance}":
			val = c.instance()
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

var stackRef = regexp.MustCompile(`\{(postgres|postgres_test|s3|dir|root|instance|port\.[a-z][a-z0-9_-]*)\}`)

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
