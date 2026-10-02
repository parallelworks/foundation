package problem

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"net/http"
	"strings"
)

// PagesOptions configure Pages.
type PagesOptions struct {
	// Registries are the application's problem types, documented beside the
	// shared ones.
	Registries []*Registry
	// Localizer picks the reader's language and renders each type's message.
	// Nil uses Accept-Language and the shared messages only.
	Localizer *Localizer
	// Docs hold the application's guidance; SharedDocs is consulted after them.
	Docs []*Docs
}

// Handler serves the problem pages for registries in the reader's language.
// See Pages.
func Handler(registries ...*Registry) http.Handler {
	return Pages(PagesOptions{Registries: registries})
}

// Pages serves the documentation pages problem type URIs resolve to:
// /problems/ lists every type, /problems/<code> documents a shared one, and
// /problems/<name>/<code> a type in the registry called name. Each page is in
// the reader's language (?lang= overrides it, so a shared link keeps its
// language) and shows the message readers see, why it happens, how to fix
// it, and the technical details. Mount it at /problems/ on the API's host.
func Pages(opts PagesOptions) http.Handler {
	if opts.Localizer == nil {
		opts.Localizer = &Localizer{}
	}
	return &pages{opts: opts, docs: append(append([]*Docs(nil), opts.Docs...), SharedDocs)}
}

type pages struct {
	opts PagesOptions
	docs []*Docs
}

type statusRow struct {
	Code   Code
	Status string
}

type indexData struct {
	Lang       string
	T          map[string]string
	Status     []statusRow
	Validation entry
	Rules      []entry
	Registries []registryData
}

type registryData struct {
	Name  string
	Types []entry
}

// entry is a type as the index lists it: its code, link and title.
type entry struct {
	URI    string
	Code   Code
	Status int
	Title  string
}

type typeData struct {
	Lang       string
	T          map[string]string
	Type       *Type
	Title      string
	Doc        Doc
	Message    string
	StatusText string
	Server     bool
	Example    string
}

func (h *pages) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		Write(w, Status(http.StatusMethodNotAllowed, ""))
		return
	}
	_, rest, ok := strings.Cut(r.URL.Path, "/problems/")
	if !ok {
		Write(w, Status(http.StatusNotFound, "not a problem type URI"))
		return
	}
	lang := h.language(r)
	if rest == "" {
		render(w, lang, indexPage, h.index(lang))
		return
	}
	if t := h.lookup(rest); t != nil {
		render(w, lang, typePage, h.typeData(lang, t))
		return
	}
	Write(w, Status(http.StatusNotFound, "no problem type at "+r.URL.Path))
}

// language is ?lang= when the pages speak it, else the Localizer's choice
// when they do, else English.
func (h *pages) language(r *http.Request) string {
	if q := strings.ToLower(r.URL.Query().Get("lang")); pageText[q] != nil {
		return q
	}
	if lang := h.opts.Localizer.Language(r.Header); pageText[lang] != nil {
		return lang
	}
	return "en"
}

func (h *pages) title(lang string, t *Type) string {
	if d := doc(h.docs, lang, t.Code); d.Title != "" {
		return d.Title
	}
	return t.Title
}

func (h *pages) entry(lang string, t *Type) entry {
	return entry{URI: t.URI(), Code: t.Code, Status: t.Status, Title: h.title(lang, t)}
}

func (h *pages) index(lang string) indexData {
	text := pageText[lang]
	d := indexData{Lang: lang, T: text, Validation: h.entry(lang, Validation)}
	for _, row := range statusRows {
		label := row.Status
		if v, ok := text[label]; ok {
			label = v
		}
		d.Status = append(d.Status, statusRow{Code: row.Code, Status: label})
	}
	for _, t := range Rules {
		d.Rules = append(d.Rules, h.entry(lang, t))
	}
	for _, reg := range h.opts.Registries {
		rd := registryData{Name: reg.Name()}
		for _, t := range reg.Types() {
			rd.Types = append(rd.Types, h.entry(lang, t))
		}
		d.Registries = append(d.Registries, rd)
	}
	return d
}

func (h *pages) typeData(lang string, t *Type) typeData {
	d := typeData{
		Lang: lang, T: pageText[lang], Type: t, Title: h.title(lang, t),
		Doc: doc(h.docs, lang, t.Code), StatusText: http.StatusText(t.Status),
		Server: t.Status >= http.StatusInternalServerError,
	}
	if d.Doc.Why == "" {
		d.Doc.Why = t.Doc
	}
	params := map[string]any{}
	for _, p := range t.Params {
		params[p] = "‹" + p + "›"
	}
	msg, ok := h.opts.Localizer.Message(lang, t.Code, params)
	if !ok {
		// A plural or number param needs a number to show its message.
		for _, p := range t.Params {
			params[p] = 3
		}
		msg, _ = h.opts.Localizer.Message(lang, t.Code, params)
	}
	d.Message = msg
	example := struct {
		Type   string         `json:"type"`
		Title  string         `json:"title"`
		Status int            `json:"status"`
		Code   Code           `json:"code"`
		Detail string         `json:"detail,omitempty"`
		Params map[string]any `json:"params,omitempty"`
	}{t.URI(), t.Title, t.Status, t.Code, msg, nil}
	if len(t.Params) > 0 {
		example.Params = params
	}
	b, _ := json.MarshalIndent(example, "", "  ")
	d.Example = string(b)
	return d
}

func (h *pages) lookup(rest string) *Type {
	name, code, nested := strings.Cut(rest, "/")
	if !nested {
		if Code(name) == Validation.Code {
			return Validation
		}
		for _, t := range Rules {
			if t.Code == Code(name) {
				return t
			}
		}
		for _, row := range statusRows {
			if row.Code == Code(name) {
				return statusType(row.Code)
			}
		}
		return nil
	}
	for _, r := range h.opts.Registries {
		if r.name == name {
			if t, ok := r.Lookup(Code(code)); ok {
				return t
			}
		}
	}
	return nil
}

// statusType describes a code clients derive from an about:blank problem's
// status, so it has a page like any type.
func statusType(c Code) *Type {
	status := http.StatusBadRequest
	for _, s := range []int{401, 403, 404, 409, 429, 500, 503} {
		if CodeForStatus(s) == c {
			status = s
		}
	}
	return &Type{Code: c, Status: status, Title: http.StatusText(status), uri: "/problems/" + string(c)}
}

var statusRows = []statusRow{
	{InvalidRequest, "anyOther4xx"},
	{Unauthenticated, "401"},
	{Forbidden, "403"},
	{NotFound, "404"},
	{Conflict, "409"},
	{RateLimited, "429"},
	{Internal, "anyOther5xx"},
	{Unavailable, "503"},
}

func render(w http.ResponseWriter, lang string, t *template.Template, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Language", lang)
	w.Header().Set("Vary", "Accept-Language, Cookie")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src '"+styleHash+"'")
	_ = t.Execute(w, data)
}

const style = `
:root{color-scheme:light dark;--bg:#fafafa;--fg:#111;--muted:#666;--line:#e5e5e5;--card:#fff;--accent:#0060df;--warn:#b45309;--warnbg:#fef3c7;--err:#b91c1c;--errbg:#fee2e2;--code:#f3f4f6}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--fg:#ededed;--muted:#a1a1aa;--line:#27272a;--card:#141416;--accent:#60a5fa;--warn:#fbbf24;--warnbg:#3a2a06;--err:#f87171;--errbg:#3b0d0d;--code:#1f1f23}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans CJK JP","Noto Sans KR","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:48px 20px 80px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
.eyebrow{font-size:.85rem;color:var(--muted);letter-spacing:.02em;margin-bottom:20px;display:block}
.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.pill{border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:600;background:var(--warnbg);color:var(--warn)}
.pill.server{background:var(--errbg);color:var(--err)}
.chip{border:1px solid var(--line);border-radius:6px;padding:1px 8px;background:var(--code);user-select:all}
h1{font-size:2rem;line-height:1.25;margin:0 0 24px;letter-spacing:-.01em}
h2{font-size:1.1rem;margin:40px 0 12px}
.message{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:8px;padding:16px 20px;font-size:1.05rem}
.message.server{border-left-color:var(--err)}
.label{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
ol.steps{list-style:none;counter-reset:step;padding:0;margin:0}
ol.steps li{counter-increment:step;position:relative;padding:0 0 14px 40px}
ol.steps li::before{content:counter(step);position:absolute;left:0;top:1px;width:26px;height:26px;border-radius:50%;background:var(--code);border:1px solid var(--line);font-size:.8rem;font-weight:600;display:flex;align-items:center;justify-content:center}
details{border:1px solid var(--line);border-radius:8px;background:var(--card);margin-top:40px}
summary{cursor:pointer;padding:12px 16px;font-weight:600}
details>div{padding:0 16px 16px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 16px}dt{color:var(--muted)}dd{margin:0}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:14px;overflow-x:auto;margin:0}
.lead{color:var(--muted);margin:0 0 32px}
.list{border:1px solid var(--line);border-radius:8px;background:var(--card);overflow:hidden}
.list a{display:flex;gap:12px;align-items:baseline;padding:10px 16px;border-top:1px solid var(--line);color:var(--fg)}
.list a:first-child{border-top:0}.list a:hover{background:var(--code);text-decoration:none}
.list code{color:var(--accent);min-width:13em}
.list .status{margin-left:auto;color:var(--muted);font-size:.85rem}
footer{margin-top:48px;font-size:.9rem}
`

var styleHash = func() string {
	sum := sha256.Sum256([]byte(style))
	return "sha256-" + base64.StdEncoding.EncodeToString(sum[:])
}()

const head = `<!doctype html>
<html lang="{{.Lang}}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>` + style + `</style>
`

var indexPage = template.Must(template.New("index").Parse(head + `<title>{{.T.reference}}</title>
<main>
<h1>{{.T.reference}}</h1>
<p class="lead">{{.T.intro}}</p>

<h2>{{.T.statusOnly}}</h2>
<p>{{.T.statusOnlyDoc}}</p>
<div class="list">
{{range .Status}}<a href="/problems/{{.Code}}"><code>{{.Code}}</code><span class="status">{{.Status}}</span></a>
{{end}}</div>

<h2>{{.T.validation}}</h2>
<div class="list"><a href="{{.Validation.URI}}"><code>{{.Validation.Code}}</code><span>{{.Validation.Title}}</span><span class="status">{{.Validation.Status}}</span></a></div>
<p>{{.T.rulesDoc}}</p>
<div class="list">
{{range .Rules}}<a href="{{.URI}}"><code>{{.Code}}</code><span>{{.Title}}</span></a>
{{end}}</div>
{{range .Registries}}
<h2>{{.Name}}</h2>
<div class="list">
{{range .Types}}<a href="{{.URI}}"><code>{{.Code}}</code><span>{{.Title}}</span><span class="status">{{.Status}}</span></a>
{{end}}</div>
{{end}}
</main>`))

var typePage = template.Must(template.New("type").Parse(head + `<title>{{.Title}} · {{.Type.Code}}</title>
<main>
<a class="eyebrow" href="/problems/">← {{.T.reference}}</a>
<div class="meta"><span class="pill{{if .Server}} server{{end}}">{{.Type.Status}} {{.StatusText}}</span><code class="chip">{{.Type.Code}}</code></div>
<h1>{{.Title}}</h1>
{{with .Message}}<div class="message{{if $.Server}} server{{end}}"><div class="label">{{$.T.message}}</div>{{.}}</div>{{end}}
{{with .Doc.Why}}<h2>{{$.T.why}}</h2>
<p>{{.}}</p>{{end}}
{{with .Doc.Fix}}<h2>{{$.T.fix}}</h2>
<ol class="steps">{{range .}}<li>{{.}}</li>{{end}}</ol>{{end}}
{{with .Doc.Links}}<h2>{{$.T.links}}</h2>
<ul>{{range .}}<li><a href="{{.Href}}">{{.Title}}</a></li>{{end}}</ul>{{end}}
<details>
<summary>{{.T.technical}}</summary>
<div>
<dl>
<dt>{{.T.type}}</dt><dd><code>{{.Type.URI}}</code></dd>
<dt>{{.T.code}}</dt><dd><code>{{.Type.Code}}</code></dd>
<dt>{{.T.status}}</dt><dd>{{.Type.Status}}</dd>
{{with .Type.Params}}<dt>{{$.T.params}}</dt><dd>{{range $i, $p := .}}{{if $i}}, {{end}}<code>{{$p}}</code>{{end}}</dd>{{end}}
</dl>
<div class="label">{{.T.example}}</div>
<pre>{{.Example}}</pre>
</div>
</details>
<footer><a href="/problems/">{{.T.allTypes}} →</a></footer>
</main>`))
