package dev

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"golang.org/x/mod/modfile"
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

// HandOff runs the dev a repository pins in place of this one, when this is
// a dev installed globally (`go install …/cmd/dev`) and the repository whose
// dev.json is at configPath pins a different version as a tool. Every
// checkout then runs the version it pins, as its CI and teammates do. On
// success it does not return; it returns nil when this dev should run.
func HandOff(configPath string, args []string) error {
	dir, err := handOffTo(configPath)
	if err != nil || dir == "" {
		return err
	}
	goBin, err := exec.LookPath("go")
	if err != nil {
		return err
	}
	argv := append([]string{"go", "-C", dir, "tool", "dev"}, args...)
	return syscall.Exec(goBin, argv, append(os.Environ(), handedOff+"=1")) //nolint:gosec // the go command, running the repository's own pinned dev
}

// handOffTo is the module directory whose pinned dev should run instead of
// this one, or "" when this one should.
func handOffTo(configPath string) (string, error) {
	if configPath == "" || os.Getenv(handedOff) != "" || os.Getenv(forceGlobal) != "" {
		return "", nil
	}
	root := filepath.Dir(configPath)
	for _, dir := range []string{filepath.Join(root, "tools"), root} {
		pinned, ok, err := pinnedDev(filepath.Join(dir, "go.mod"))
		if err != nil {
			return "", err
		}
		if !ok {
			continue
		}
		if pinned == version() {
			return "", nil
		}
		return dir, nil
	}
	return "", nil
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
