package dev

import (
	"os"
	"path/filepath"
	"slices"
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

func TestGlobalDevRunsTheRepositorysOwnCommand(t *testing.T) {
	root := t.TempDir()
	cfg := filepath.Join(root, ConfigFile)
	write(t, cfg, `{"name":"app","command":["go","run","{root}/cmd/dev"]}`)
	// A command wins over a pinned tool: the app's dev is its own.
	write(t, filepath.Join(root, "tools", "go.mod"), "module example.com/app/tools\n\ngo 1.27.0\n\ntool "+devTool+"\n\nrequire "+devModule+" v0.0.1 // indirect\n")
	argv, err := handOffTo(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"go", "run", root + "/cmd/dev"}; !slices.Equal(argv, want) {
		t.Errorf("hand off to %v, want %v", argv, want)
	}
	t.Setenv(handedOff, "1")
	if argv, _ := handOffTo(cfg); argv != nil {
		t.Errorf("a handed-off dev handed off again, to %v", argv)
	}
}

func TestGlobalDevHandsOffToThePinnedOne(t *testing.T) {
	pins := func(v string) string {
		return "module example.com/app/tools\n\ngo 1.27.0\n\ntool " + devTool + "\n\nrequire " + devModule + " " + v + " // indirect\n"
	}
	installed := "v0.5.0"
	currentVersion = func() string { return installed }
	t.Cleanup(func() { currentVersion = version })

	cfg := repo(t, pins("v0.6.0"))
	if argv, err := handOffTo(cfg); err != nil || !slices.Equal(argv, []string{"go", "-C", filepath.Join(filepath.Dir(cfg), "tools"), "tool", "dev"}) {
		t.Errorf("a repository pinning a newer version: hand off to %v, %v", argv, err)
	}
	for _, pin := range []string{"v0.5.0", "v0.4.2"} {
		if argv, _ := handOffTo(repo(t, pins(pin))); argv != nil {
			t.Errorf("v0.5.0 installed, %s pinned: hand off to %v; the newer dev should run", pin, argv)
		}
	}
	// One built from a checkout cannot tell how new it is.
	installed = "(devel)"
	if argv, _ := handOffTo(repo(t, pins("v0.4.2"))); argv == nil {
		t.Error("a dev of unknown version should defer to the pin")
	}
	installed = "v0.5.0"
	if argv, _ := handOffTo(repo(t, "module example.com/app/tools\n\ngo 1.27.0\n")); argv != nil {
		t.Errorf("a tools module without dev: hand off to %v", argv)
	}
	if argv, _ := handOffTo(repo(t, "")); argv != nil {
		t.Errorf("no tools module: hand off to %v", argv)
	}
	if argv, _ := handOffTo(""); argv != nil {
		t.Errorf("outside any repository: hand off to %v", argv)
	}

	for _, env := range []string{handedOff, forceGlobal} {
		t.Setenv(env, "1")
		if argv, _ := handOffTo(cfg); argv != nil {
			t.Errorf("with %s set: hand off to %v", env, argv)
		}
		_ = os.Unsetenv(env)
	}
}
