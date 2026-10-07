package dev

import (
	"os"
	"path/filepath"
	"testing"
)

func repo(t *testing.T, toolsMod string) string {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, ConfigFile), `{"name":"app"}`)
	if toolsMod != "" {
		write(t, filepath.Join(root, "tools", "go.mod"), toolsMod)
	}
	return filepath.Join(root, ConfigFile)
}

func TestGlobalDevHandsOffToThePinnedOne(t *testing.T) {
	pins := func(v string) string {
		return "module example.com/app/tools\n\ngo 1.27.0\n\ntool " + devTool + "\n\nrequire " + devModule + " " + v + " // indirect\n"
	}
	cfg := repo(t, pins("v0.0.1"))
	if dir, err := handOffTo(cfg); err != nil || dir != filepath.Join(filepath.Dir(cfg), "tools") {
		t.Errorf("a repository pinning another version: hand off to %q, %v", dir, err)
	}

	if dir, _ := handOffTo(repo(t, pins(version()))); dir != "" {
		t.Errorf("the pinned version is this one, yet it hands off to %q", dir)
	}
	if dir, _ := handOffTo(repo(t, "module example.com/app/tools\n\ngo 1.27.0\n")); dir != "" {
		t.Errorf("a tools module without dev: hand off to %q", dir)
	}
	if dir, _ := handOffTo(repo(t, "")); dir != "" {
		t.Errorf("no tools module: hand off to %q", dir)
	}
	if dir, _ := handOffTo(""); dir != "" {
		t.Errorf("outside any repository: hand off to %q", dir)
	}

	for _, env := range []string{handedOff, forceGlobal} {
		t.Setenv(env, "1")
		if dir, _ := handOffTo(cfg); dir != "" {
			t.Errorf("with %s set: hand off to %q", env, dir)
		}
		_ = os.Unsetenv(env)
	}
}
