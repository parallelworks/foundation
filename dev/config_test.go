package dev

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, dir, body string) string {
	t.Helper()
	path := filepath.Join(dir, ConfigFile)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestFindConfigWalksUp(t *testing.T) {
	root := t.TempDir()
	want := writeConfig(t, root, `{"name":"app"}`)
	nested := filepath.Join(root, "tools", "cmd")
	if err := os.MkdirAll(nested, 0o750); err != nil {
		t.Fatal(err)
	}

	got, err := FindConfig(nested)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("FindConfig = %s, want %s", got, want)
	}
}

func TestFindConfigMissing(t *testing.T) {
	if _, err := FindConfig(t.TempDir()); err == nil || !strings.Contains(err.Error(), ConfigFile) {
		t.Errorf("FindConfig error = %v, want one naming %s", err, ConfigFile)
	}
}

func TestLoadConfigResolvesPathsAgainstFile(t *testing.T) {
	root := t.TempDir()
	loaded, err := LoadConfig(writeConfig(t, root, `{"name":"app","postgres":{},"s3":{"addr":"127.0.0.1:9000"}}`))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := loaded.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(root, ".devstack"); cfg.Dir != want {
		t.Errorf("Dir = %s, want %s", cfg.Dir, want)
	}
	if want := filepath.Join(root, ".env"); cfg.EnvFile != want {
		t.Errorf("EnvFile = %s, want %s", cfg.EnvFile, want)
	}
	if cfg.Postgres == nil || cfg.S3 == nil || cfg.S3.Addr != "127.0.0.1:9000" {
		t.Errorf("services = %+v, %+v", cfg.Postgres, cfg.S3)
	}
}

func TestLoadConfigRejectsUnknownKeys(t *testing.T) {
	if _, err := LoadConfig(writeConfig(t, t.TempDir(), `{"name":"app","postgress":{}}`)); err == nil {
		t.Error("LoadConfig accepted a misspelled key")
	}
}

func TestConfigRequiresCommands(t *testing.T) {
	for name, cfg := range map[string]Config{
		"service without run":  {Services: []Service{{Name: "api", Build: []string{"go", "build"}}}},
		"service without name": {Services: []Service{{Run: []string{"vite"}}}},
		"two with one name":    {Services: []Service{{Name: "web", Run: []string{"a"}}, {Name: "web", Run: []string{"b"}}}},
		"a subcommand's name":  {Services: []Service{{Name: "logs", Run: []string{"a"}}}},
	} {
		if _, err := cfg.withDefaults(); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestServicePathsResolveAgainstTheirDir(t *testing.T) {
	cfg, err := Config{Root: "/repo", Services: []Service{{
		Name: "api", Dir: "cmd/api", Build: []string{"go", "build"}, Run: []string{"tmp/api"},
		EnvFile: ".env", Watch: []string{".", "/shared"},
	}}}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	svc := cfg.Services[0]
	if svc.Dir != "/repo/cmd/api" || svc.EnvFile != "/repo/cmd/api/.env" {
		t.Errorf("Dir, EnvFile = %s, %s", svc.Dir, svc.EnvFile)
	}
	if want := []string{"/repo/cmd/api", "/shared"}; !slices.Equal(svc.Watch, want) {
		t.Errorf("Watch = %v, want %v", svc.Watch, want)
	}
	if want := []string{".go"}; !slices.Equal(svc.Extensions, want) {
		t.Errorf("Extensions = %v, want %v", svc.Extensions, want)
	}
}

func TestSelectServices(t *testing.T) {
	cfg := Config{Services: []Service{{Name: "api"}, {Name: "web"}, {Name: "worker", Manual: true}}}
	names := func(svcs []Service) []string {
		var n []string
		for _, s := range svcs {
			n = append(n, s.Name)
		}
		return n
	}
	if got, _ := cfg.selectServices(nil); !slices.Equal(names(got), []string{"api", "web"}) {
		t.Errorf("by default = %v, want every service not marked manual", names(got))
	}
	if got, _ := cfg.selectServices([]string{"worker", "api"}); !slices.Equal(names(got), []string{"worker", "api"}) {
		t.Errorf("named = %v, want those named", names(got))
	}
	if _, err := cfg.selectServices([]string{"nope"}); err == nil {
		t.Error("an unknown service was accepted")
	}
}

func TestConfigRejectsUnsafeName(t *testing.T) {
	for _, name := range []string{"", "App", "my-app", "1app", "a b"} {
		if _, err := (Config{Name: name, Postgres: &Postgres{}}).withDefaults(); err == nil {
			t.Errorf("name %q accepted", name)
		}
	}
	if _, err := (Config{}).withDefaults(); err != nil {
		t.Errorf("a config without Postgres needs no name: %v", err)
	}
}

func TestDatabaseURLs(t *testing.T) {
	cfg := Config{Name: "app", Postgres: &Postgres{Port: 5433}}
	if got, want := cfg.DatabaseURL(), "postgres://app:app@localhost:5433/app?sslmode=disable"; got != want {
		t.Errorf("DatabaseURL = %s, want %s", got, want)
	}
	if got, want := cfg.TestDatabaseURL(), "postgres://app:app@localhost:5433/app_test?sslmode=disable"; got != want {
		t.Errorf("TestDatabaseURL = %s, want %s", got, want)
	}
	if got := (Config{Name: "app"}).DatabaseURL(); got != "" {
		t.Errorf("DatabaseURL without Postgres = %s, want empty", got)
	}
}
