package dev

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/mod/modfile"
	"golang.org/x/mod/semver"
)

const (
	devModule = "github.com/parallelworks/foundation/dev"
	devTool   = devModule + "/cmd/dev"
	// handedOff marks a dev a global one started, so it runs itself rather
	// than hand off again.
	handedOff = "DEV_HANDED_OFF"
	// forceGlobal makes a global dev run itself even where a repository pins
	// another version.
	forceGlobal = "DEV_GLOBAL"
)

// Version is this dev's module version.
func Version() string { return version() }

// HandOff runs a repository's own dev in place of this one, when this is a
// dev installed globally (`go install …/cmd/dev`). The repository whose
// dev.json is at configPath says which: its `command`, for an app whose dev
// adds commands of its own, or else the version its tools module pins, when
// that is newer than this one. A newer dev reads an older dev.json as it was
// meant, so an install runs its own commands everywhere until a repository
// needs a later one; CI and agents still run the pin. On success it does not
// return; it returns nil when this dev should run.
func HandOff(configPath string, args []string) error {
	argv, err := handOffTo(configPath)
	if err != nil || argv == nil {
		return err
	}
	bin, err := exec.LookPath(argv[0])
	if err != nil {
		return err
	}
	return syscall.Exec(bin, append(argv, args...), append(os.Environ(), handedOff+"=1")) //nolint:gosec // the repository's own dev, as its dev.json or tools module names it
}

// handOffTo is the command that runs the repository's own dev instead of
// this one, or nil when this one should run.
func handOffTo(configPath string) ([]string, error) {
	if configPath == "" || os.Getenv(handedOff) != "" || os.Getenv(forceGlobal) != "" {
		return nil, nil
	}
	root := filepath.Dir(configPath)
	cfg, err := LoadConfig(configPath)
	if err != nil {
		return nil, err
	}
	if len(cfg.Command) > 0 {
		argv := make([]string, len(cfg.Command))
		for i, a := range cfg.Command {
			argv[i] = strings.ReplaceAll(a, "{root}", root)
		}
		return argv, nil
	}
	for _, dir := range []string{filepath.Join(root, "tools"), root} {
		pinned, ok, err := pinnedDev(filepath.Join(dir, "go.mod"))
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		if !newer(pinned, currentVersion()) {
			return nil, nil
		}
		return []string{"go", "-C", dir, "tool", "dev"}, nil
	}
	return nil, nil
}

// currentVersion is this dev's version, which tests set.
var currentVersion = version

// newer reports whether a repository's pinned version is newer than this
// dev's. A dev that cannot tell its own version, such as one built from a
// checkout, defers to any pin.
func newer(pinned, current string) bool {
	if pinned == current {
		return false
	}
	if !semver.IsValid(current) {
		return true
	}
	return semver.Compare(pinned, current) > 0
}

// pinnedDev reports the version of dev a go.mod pins as a tool.
func pinnedDev(path string) (string, bool, error) {
	data, err := os.ReadFile(path) //nolint:gosec // a go.mod in the repository being worked on
	if errors.Is(err, fs.ErrNotExist) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	f, err := modfile.Parse(path, data, nil)
	if err != nil {
		return "", false, err
	}
	tool := false
	for _, t := range f.Tool {
		if t.Path == devTool {
			tool = true
		}
	}
	if !tool {
		return "", false, nil
	}
	for _, r := range f.Require {
		if r.Mod.Path == devModule {
			return r.Mod.Version, true, nil
		}
	}
	return "", false, nil
}
