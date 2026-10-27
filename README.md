# A wiki for Luccet

The wiki turns a folder of [Luccet](https://luccet.dev) notes into a wiki: a front page that lists the notes, a search box over them, and a glossary of the terms they define, each linked to where it is defined. Nothing is built ahead: [`luccet index`](https://luccet.dev/docs/tools.html#index) writes three files beside the notes, and the pages read them when they open. Each part is one file, loaded on its own: a site can take only the list, or only the search.

| File | Gives | Reads |
|---|---|---|
| [`notes.js`](#notes) | `::notes`, a list of the folder's notes: title, date and description | `notes.json` |
| [`search.js`](#search) | `::search`, a search box over the notes, with hits that land on the section or block | the notes themselves, or `search.json` |
| [`glossary.js`](#glossary) | `::glossary`, the terms the notes define, and `:term[…]`, a use of one, linked to its entry | `glossary.json` |

## A wiki in a folder

```text
notes/
  index.html                          the front page: ::search and ::notes
  glossary.html                       ::glossary
  *.html                              the notes: :dfn[…] defines a term, :term[…] uses one
  notes.json search.json glossary.json  written by luccet index
```

```html
<!doctype html><meta charset="utf-8"><script src="luccet.js" data-use="https://cdn.jsdelivr.net/gh/Luccet/wiki@1/notes.js https://cdn.jsdelivr.net/gh/Luccet/wiki@1/search.js"></script>

# My notes

::search{index=search.json}

::notes
```

Run `luccet index` in the folder whenever the notes change ([keeping the files current](https://luccet.dev/docs/tools.html#index-hook)), and the pages follow.

## Loading it

It needs Luccet 2, the [add-on API](https://luccet.dev/docs/addon-api.html) 2 (`luccet.api`). List the parts a page uses in `data-use` on the luccet.js tag, as above, or in a `:::use` block, one entry per line, which must come first in the note (after `:::meta` at most):

```html
<!doctype html><meta charset="utf-8"><script src="luccet.js"></script>

:::use
https://cdn.jsdelivr.net/gh/Luccet/wiki@1/notes.js
:::
```

- **From jsDelivr,** `https://cdn.jsdelivr.net/gh/Luccet/wiki@1/` followed by `notes.js`, `search.js` or `glossary.js`. `@1` is the newest 1.x release of the wiki.
- **A copy of your own:** put the files beside your notes and list them by their paths, `data-use="notes.js search.js"`.
  - `luccet check` and `luccet build` run a copy of your own, so they know `::notes`, `::search`, `::glossary` and `:term`.
  - They do not load one from jsDelivr ([`addon.remote`](https://luccet.dev/docs/schema.html#addon-failed)), so to them those are names with no schema.
  - For the glossary that matters: with it from jsDelivr, a missing glossary page is not reported, and a page `luccet build` writes has no link for a use. Use a copy of `glossary.js` with the command line.
- **The files it reads:** run `luccet index` in the folder of the notes; it writes `notes.json`, `search.json` and `glossary.json` there ([what is written](https://luccet.dev/docs/tools.html#index-files)).
- **The pages need to be served over HTTP:** browsers refuse the fetches from a `file:` URL.

How add-ons load, and how to write one: [Add-ons](https://luccet.dev/docs/schema.html#addons).

## Notes

`notes.js` declares a `::notes` leaf: a list of the notes in a folder, read from the catalogue `luccet index` writes, `notes.json`. Each note shows its title, linked, its date and its description. It is the front page of a wiki, or of a site that lists what it holds. Nothing is fetched but that one file.

### The leaf

```html
::notes
::notes{from=../notes.json in=BookOfProof/ sort=title limit=10}
```

- **Which notes.** `::notes` alone reads `notes.json` next to the page; `from=PATH` names the catalogue, an `http(s)` URL, relative to the page.
  - The page itself is left out, also when it is reached as its folder (`blog/` for `blog/index.html`) or without its extension (`blog/post` for `blog/post.html`).
  - `in=FOLDER` keeps the notes under a folder, a prefix of their path in the catalogue.
  - An entry's URL resolves against the catalogue and must be a page on its origin, as `luccet index` writes them. Any other, a `javascript:` or `data:` URL or another site, is left out, with a warning in the console.
- **The order.**
  - `sort=date`, the default, puts the newest first and undated notes last, by path. A note whose date is not one (`YYYY-MM-DD`, a time after it allowed) sorts with them and is shown as written, without a `<time>`.
  - `sort=title` sorts by title; `sort=path` keeps the catalogue's order, the folder's.
  - `limit=N` caps the list (`limit=0` lists none).
- **What a note shows:** its title, linked, its date in a `<time>`, and its description, as `luccet index` found them in the head and the `:::meta` of each note.
- **Options** go on the leaf, on the add-on (`notes.js?from=notes.json`), or in `window.LUCCET = {use: {notes: {…}}}`; the leaf's win.
- **When the catalogue cannot be loaded,** or `from=` is not a URL, the leaf says so in place, with the reason in the console.

### The element

A `<nav aria-label="Notes">` with the classes `t-notes`, `t-notes-list` (a `<ul role="list">`), `t-notes-title`, `t-notes-date`, `t-notes-desc` and `t-notes-status`, styled from the theme's custom properties; a stylesheet add-on, or your own CSS, can restyle them.

Its words come from [`window.LUCCET.strings`](https://luccet.dev/docs/api.html#strings) when the page sets them:

| Key | Default |
|---|---|
| `notes` | Notes (the list's label) |
| `noNotes` | No notes. |
| `notesFailed` | `The list of notes could not be loaded ({from}).` |
| `notesStale` | `The list of notes was written by luccet {version}; run luccet index again.` |

## Search

`search.js` declares a `::search` leaf: a search box over a set of notes, built in the browser when the page opens.
- **By default,** the notes are fetched and parsed by the engine, with the page's own vocabulary. They are split into entries: every heading's section, and every named block with an id, an exercise or a theorem. So a hit links straight to its place on its page.
- **Nothing is built ahead, and nothing leaves the browser.** It suits a wiki of notes published as they are.
- **With `index=`,** the box reads the index `luccet index` wrote instead: one file and no note fetched, for a site with many notes.

### The leaf

```html
::search
::search{from=index.html}
::search{notes="algebra/chapter1.html algebra/chapter2.html" limit=10 placeholder="Find an exercise"}
::search{index=search.json}
```

- **Which notes.**
  - `::search` alone covers the notes this page links to: every same-origin link to an `.html` file. The page itself is left out, also when the link reaches it as its folder (`blog/` for `blog/index.html`) or without its extension (`blog/post` for `blog/post.html`).
  - `from=PAGE` covers the notes another page links to, such as an index page, so a search page needs no list of its own.
  - `notes="A B"` lists them.
  - A link to something that is not a note (no `luccet.js` tag), or that cannot be fetched, is skipped, with a warning in the console, and counted in the status line.
- **A prebuilt index.** `index=search.json` loads the [`search.json`](https://luccet.dev/docs/tools.html#index-files) that `luccet index` wrote, relative to the page: one request and no parsing, with the same ranking. The hits resolve from the file's folder.
  - **When the index can't be used,** the notes are indexed here instead, from `notes`, `from` or the page's links, and the reason is reported in the console. That happens for an index that cannot be loaded, one that is not an index, and one of another format than this luccet.js reads (its `format`, which changes only in a major release).
  - **An entry's URL** resolves against the file and must be a page on its origin, as `luccet index` writes them. Any other, a `javascript:` or `data:` URL or another site, is left out, with a warning in the console.
  - **Write the file again** when the notes change.
- **The vocabulary.** Load the notes' own add-ons on the search page too, so their `:::exercise` and `:::theorem` blocks parse as they do on their own pages, with their labels and numbers. An index written by `luccet index` was built with them already.
- **Options** go on the leaf, on the add-on (`search.js?from=index.html`), or in `window.LUCCET = {use: {search: {…}}}`; the leaf's win. `limit` caps the results (20; `limit=0` lists none, and the status still counts them); `placeholder` sets the box's.
- **A link to a search.** `?q=WORD` in the page's URL fills the box, and typing keeps the URL up to date, so a search can be linked to.

### A hit

- **What it shows:** the entry's label and title ("Exercise 3 II.1", or a heading's text), the page it is on, and a snippet with the matching words marked. The link lands on the block's id.
- **The keys.**
  - Enter opens the first hit of the query as typed, running it first if the box had not caught up.
  - The arrow keys walk the results: down from the box to the first hit and along them, up back to the box.
  - Escape returns to the box from any hit, and Tab works as usual.
- **Matching is lexical.** The pipeline is the engine's: [`luccet.search`](https://luccet.dev/docs/api.html#search).
  - Words are folded, so `cafe` finds `Café` in either Unicode form and `istanbul` finds `İstanbul`. They are stemmed lightly, so `triangle` finds `triangles`.
  - A query word stands for every word it begins: `pythag` finds Pythagoras and Pythagorean.
  - Chinese, Japanese and Korean are searched by pairs of characters, so `東京` finds 東京タワー with no spaces in the text.
  - Entries are ranked BM25-style; a word in an entry's title counts for more than one in its text.
  - TeX is searched as written: `sqrt` finds `\sqrt`.
  - A word the notes never use finds nothing.

### The element

A `<search role="search">` with the classes `t-search`, `t-search-box`, `t-search-status` and `t-search-results`, styled from the theme's custom properties; a stylesheet add-on, or your own CSS, can restyle them. The status line is the one live region (`role="status"`), so a screen reader hears the count, not every hit. The results are an `<ol role="list">`, a list even without its bullets.

Its words come from [`window.LUCCET.strings`](https://luccet.dev/docs/api.html#strings) when the page sets them:

| Key | Default |
|---|---|
| `searchPlaceholder` | Search the notes |
| `indexing` | Indexing… |
| `notesCount` | `{n} note\|{n} notes` |
| `entriesCount` | `{n} entry\|{n} entries` |
| `unreadable` | `; {n} could not be read` |
| `results` | `{n} result\|{n} results` |
| `noneListed` | `, none listed` |
| `noResults` | No results |
| `searchFailed` | `The search could not be set up ({why}).` |

```html
<!doctype html><meta charset="utf-8"><script>
window.LUCCET = { lang: 'de', strings: { searchPlaceholder: 'Notizen durchsuchen', noResults: 'Keine Treffer', results: '{n} Treffer|{n} Treffer' } };
</script><script src="luccet.js" data-use="https://cdn.jsdelivr.net/gh/Luccet/wiki@1/search.js"></script>
```

### Privacy

Only the notes listed or linked are fetched, from the page's own origin; a note that no page links to is never read. `index=` and `from=` name `http(s)` URLs. Anything else is refused, and a box that cannot be set up says so in place.

## Glossary

`glossary.js` declares a `::glossary` leaf: the terms the notes of a folder define, read from the glossary `luccet index` writes, `glossary.json`. Each term is linked to where it is defined, with its definition as it reads on its own page. It also declares a `:term[…]` inline, a use of a term, linked to the glossary page's entry. List it on the glossary page and on the notes that use `:term`:

```html
<!doctype html><meta charset="utf-8"><script src="luccet.js" data-use="glossary.js"></script>

A :dfn[truism] is a claim so obviously true that it goes without saying.

:::definition[Kernel]{#ker}
The set of vectors $v$ with $T(v) = 0$.
:::

Every :term[truism], and the :term[kernels]{title=kernel} too, link to the glossary page.
```

and on the glossary page, `glossary.html` beside the notes:

```html
<!doctype html><meta charset="utf-8"><script src="luccet.js" data-use="glossary.js"></script>

# Glossary

::glossary
```

### Defining a term

A term is defined where the word is explained ([`luccet.glossary`](https://luccet.dev/docs/api.html#glossary)):

- **`:dfn[truism]`** in the sentence that explains it, HTML's element for the defining instance of a word; its paragraph is the definition.
  - `title=` gives the canonical form when the text is not it (`:dfn[truisms]{title=truism}`), as HTML's rule says.
  - A `dfn` in a heading is defined by the paragraph after it.
- **A titled `:::definition` block,** `:::definition[Kernel]`, defines its title by its body, as math notes do.
- **The same word defined in two notes** is listed twice, and `luccet index` says so.

### The leaf

```html
::glossary
::glossary{from=../wiki/glossary.json in=algebra/}
```

- **Which terms.**
  - `::glossary` alone reads `glossary.json` next to the page; `from=PATH` names the file, an `http(s)` URL, relative to the page.
  - `in=FOLDER` keeps the terms of the notes under a folder, a prefix of their path in the file.
  - A note's URL resolves against the file and must be a page on its origin, as `luccet index` writes them; any other is left out, with a warning in the console.
- **What an entry shows.** The terms come in the order of their folded key (`Café` with `cafe`).
  - Each is a `<dt>` whose id is the term's slug (`glossary-truism`, or `glossary-truism-2` for a second definition), and whose text links to the definition in its note.
  - Then comes a `<dd>` with the definition, rendered as on its page:
    - its links lead back to the note;
    - its formulas are math as the page shows it (MathML, or KaTeX with the [KaTeX add-on](https://github.com/Luccet/katex));
    - a line names the note;
    - raw HTML in a definition is escaped, as in a note rendered `safe`.
- **When the file cannot be loaded,** or is of another format than this luccet.js reads (its `format`, which changes only in a major release), the leaf says so in place, with the reason in the console; run `luccet index` again.

### Uses

- **`:term[truism]`** is a link to the glossary page.
  - The page is `glossary.html` beside the note unless `page=` says otherwise (`glossary.js?page=/wiki/glossary.html` for notes in several folders).
  - `title=` gives the term when the text is inflected: `:term[kernels]{title=kernel}`.
- **The link is in the tree,** so `luccet check` reports a page that is not there as [`link.missing`](https://luccet.dev/docs/diagnostics.html#link-missing) at the use, and `luccet build` writes it. The entry's `#` is added when the page shows, since the entries exist once the list is built.
- **It is drawn** with a dotted underline.

### Options

- **`from` and `in`** go on the leaf, on the add-on (`glossary.js?from=…`), or in `window.LUCCET = {use: {glossary: {…}}}`; the leaf's win.
- **`page`,** which the uses read, goes on the add-on (`glossary.js?page=/wiki/glossary.html`) or in `window.LUCCET = {use: {glossary: {page: …}}}`.

### The element

A `<div role="region" aria-label="Glossary">` with the classes `t-glossary`, `t-glossary-list` (a `<dl>`), `t-glossary-source` and `t-glossary-status`; a use is a `<span class="term">` around its link. A stylesheet add-on, or your own CSS, can restyle them.

Its words come from [`window.LUCCET.strings`](https://luccet.dev/docs/api.html#strings) when the page sets them:

| Key | Default |
|---|---|
| `glossary` | Glossary (the region's label) |
| `noTerms` | No terms. |
| `glossaryFrom` | `From {title}` |
| `glossaryFailed` | `The glossary could not be loaded ({from}).` |
| `glossaryStale` | `The glossary was written by luccet {version}; run luccet index again.` |

## Without the page

`luccet check` and `luccet build` know the three leaves and do nothing with them: the list, the box and the glossary are built when `luccet.js` runs. A `:term`'s link is theirs: it is in the tree, so it is checked and written. The same search over files, with lines, is [`luccet search`](https://luccet.dev/docs/tools.html#search).

## Tests

`npm test` runs the wiki's tests. Each part's are in `test/<part>/`:
- `node.js` runs under Node, with the engine's command line;
- `browser.js` runs in Chromium and Firefox, through [Playwright](https://playwright.dev);
- `pages/` holds the notes they open.

They run against a checkout of the engine, [Luccet/luccet](https://github.com/Luccet/luccet): `LUCCET_ROOT` names it, else `../luccet` beside this repository.

```sh
npm install && npx playwright install chromium firefox
LUCCET_ROOT=../luccet npm test
node test/search/browser.js --browsers=firefox --filter=WORDS   # some of them
```

CI runs them on every push and every Monday, against the engine's `main` and its latest release. `test/harness.js`, `tools/npm.js` and `.github/workflows/test.yml` are the same in every add-on's repository.

## License

MIT, as [LICENSE](LICENSE) says.
