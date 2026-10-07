package dev

import (
	"bytes"
	"slices"
	"strings"
	"testing"
)

func profiledConfig(root string) Config {
	return Config{
		Root: root,
		Env:  map[string]string{"MONGO_URI": "unset", "LOG": "debug"},
		Profiles: map[string]Profile{
			"local-mongo":  {Env: map[string]string{"MONGO_URI": "mongodb://localhost:{port.mongo}"}},
			"canary-mongo": {Env: map[string]string{"MONGO_URI": "mongodb://localhost:27017"}},
			"local-vault":  {Env: map[string]string{"VAULT": "local"}},
			"local":        {Description: "everything on this machine", Include: []string{"local-mongo", "local-vault"}},
		},
		DefaultProfiles: []string{"local"},
		Ports:           map[string]int{"mongo": 27018},
		Services: []Service{
			{Name: "mongo", Run: []string{"mongod"}, Profiles: []string{"local-mongo"}},
			{Name: "api", Run: []string{"api"}, DependsOn: []string{"mongo"}},
		},
	}
}

func TestProfilesChooseEnvAndServices(t *testing.T) {
	names := func(svcs []Service) []string {
		var n []string
		for _, s := range svcs {
			n = append(n, s.Name)
		}
		return n
	}

	cfg, err := profiledConfig(t.TempDir()).withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"local-mongo", "local-vault", "local"}; !slices.Equal(cfg.active, want) {
		t.Errorf("default active = %v, want the preset's includes then itself: %v", cfg.active, want)
	}
	if cfg.Env["MONGO_URI"] != "mongodb://localhost:{port.mongo}" || cfg.Env["LOG"] != "debug" || cfg.Env["VAULT"] != "local" {
		t.Errorf("env = %v, want profiles over the base", cfg.Env)
	}
	if got := names(cfg.Services); !slices.Equal(got, []string{"mongo", "api"}) {
		t.Errorf("services = %v", got)
	}

	remote := profiledConfig(t.TempDir())
	remote.Active = []string{"canary-mongo", "local-vault"}
	cfg, err = remote.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if got := names(cfg.Services); !slices.Equal(got, []string{"api"}) {
		t.Errorf("with canary mongo, services = %v, want only api", got)
	}
	if len(cfg.Services[0].DependsOn) != 0 {
		t.Errorf("api still waits for %v, which the remote setup provides", cfg.Services[0].DependsOn)
	}
	if cfg.Env["MONGO_URI"] != "mongodb://localhost:27017" {
		t.Errorf("MONGO_URI = %q", cfg.Env["MONGO_URI"])
	}
}

func TestACheckoutKeepsTheProfilesItChose(t *testing.T) {
	root := t.TempDir()
	base := profiledConfig(root)
	chosen := base
	chosen.Active = []string{"canary-mongo"}
	c, err := chosen.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if err := c.chooseProfiles(chosen.Active); err != nil {
		t.Fatal(err)
	}
	later, err := base.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(later.active, []string{"canary-mongo"}) {
		t.Errorf("a later run uses %v, want the checkout's choice", later.active)
	}
}

func TestProfilesAreChecked(t *testing.T) {
	for name, mutate := range map[string]func(*Config){
		"unknown chosen":  func(c *Config) { c.Active = []string{"nope"} },
		"unknown include": func(c *Config) { c.Profiles["bad"] = Profile{Include: []string{"nope"}} },
		"include cycle": func(c *Config) {
			c.Profiles["a"] = Profile{Include: []string{"b"}}
			c.Profiles["b"] = Profile{Include: []string{"a"}}
			c.Active = []string{"a"}
		},
		"service names unknown": func(c *Config) { c.Services[0].Profiles = []string{"nope"} },
	} {
		cfg := profiledConfig(t.TempDir())
		mutate(&cfg)
		if _, err := cfg.withDefaults(); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestProfileFlagAndList(t *testing.T) {
	cfg := profiledConfig(t.TempDir())
	run := func(args ...string) string {
		t.Helper()
		var out bytes.Buffer
		root := NewRootCmd(cfg)
		root.SetArgs(args)
		root.SetOut(&out)
		if err := root.ExecuteContext(t.Context()); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}
	if out := run("profiles"); !strings.Contains(out, "* local (local-mongo + local-vault): everything on this machine") || !strings.Contains(out, "  canary-mongo") {
		t.Errorf("profiles =\n%s", out)
	}
	run("profiles", "--profile", "canary-mongo")
	if out := run("profiles"); !strings.Contains(out, "* canary-mongo") || strings.Contains(out, "* local ") {
		t.Errorf("after --profile canary-mongo, profiles =\n%s", out)
	}
}
