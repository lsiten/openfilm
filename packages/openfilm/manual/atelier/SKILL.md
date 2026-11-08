---
name: atelier
description: Ready-made scenes for an OpenFilm film — data-viz (bar, line, pie, kpi, progress), a shared theme, screen scenes (a synthetic screenshot, a terminal), a typed catalog and a validator. Read it before you make a chart, a title, a screen or a terminal shot, or add a scene, and before you look at or validate a film that uses them.
---

# The atelier

A kit of ready scenes you drop into a film. A skill never changes OpenFilm: this one brings
templates, a theme, a catalog and a validator, and you make them by copying a scene into the project
and wiring it into `film.html`, like anything else you write. When you make a chart, a title, a
screen or a terminal, take a ready one here rather than drawing it from scratch; when you make a
kind you have not, add it as a new scene (the end of this file).

The five in it are:
- **Data-viz scenes** — `bar`, `line`, `pie`, `kpi`, `progress`, in `charts/`.
- **A theme** — `theme/theme.css`, the palette and fonts a film shares; `theme/title.html` shows a
  scene that loads it.
- **A catalog and a validator** — `catalog.json` names every scene and what it takes; `scripts/validate.mjs`
  checks a film and its scenes before you say it is done.
- **Screen scenes** — `screenshot` and `terminal`, in `screens/`, a screen drawn without a capture.
- **A way to add a scene** — the checklist at the end, so a new scene comes out that the catalog, the
  validator and the next agent all find and trust.

## The one contract

A scene is a page, and a page obeys the rule in the editing skill: **the picture depends only on
`t`** — the same `t` draws the same picture, whatever was drawn before. Two more things every scene
here keeps, because the host checks them and a frame that misses them reports *"a `frame()`
function did not appear"*:

```
window.film = { frame: (t) => {/* draw the whole picture at t */}, duration: N };
if (!window.filmHost) {                         /* the preview-fallback loop: keep it in every scene */
  const t0 = performance.now();
  const loop = () => { const t = (performance.now() - t0) / 1000; window.film.frame(t % window.film.duration); requestAnimationFrame(loop); };
  loop();
}
```

- **Colors come from CSS variables** — `getComputedStyle(document.documentElement).getPropertyValue('--color')`.
  A scene does not hard-code its palette; it reads `--color`, `--accent`, `--ink`, `--muted`, `--bg`
  (and `--font`) from the theme, so the theme changes them everywhere at once.
- **A chart draws into a real `<svg>`, not a `<div>`** — `<div id="chart"><svg id="c"></svg></div>`,
  the `<svg>` at `width:100%; height:100%`; read the width and height from the **`<div>`**
  (`box.clientWidth`, `box.clientHeight`) and set `svg.innerHTML`. Bars and lines put into a `<div>`
  never paint.
- **A picture a scene is only a part of** sets `width` and `height` on `window.film` (a chart in a
  corner); a full-frame scene does not, and lays itself out to the stage.

## The theme

`theme/theme.css` is the palette and fonts of a film. A scene loads it in its `<head>` and reads the
colors from it, so a film has one look:

```
<link rel="stylesheet" href="theme.css">
```

`theme/title.html` is a scene that does exactly this — it lays out and animates only its own text and
restates not a single color. To set a film's look, edit `theme.css` once; every scene that loads it
changes with it. Keep each text color legible on its background: the validator checks the contrast of
`--ink`, `--color` and `--muted` on `--bg`, so a theme that looks right in the editor is not shipped
dark.

## The scenes

The scenes in `catalog.json`, each a file that takes nothing and draws on the theme's colors:

| scene | draws | you edit |
|---|---|---|
| `title` (theme) | a title card that loads the theme | the text |
| `bar` (charts) | an animated bar chart, the last bar the accent | the `data` (label, value) |
| `line` (charts) | a line chart that grows left to right | the `data` |
| `pie` (charts) | a donut that sweeps in, with a percentage | the `data` (normalized) |
| `kpi` (charts) | a 2×2 grid of numbers, counting up, with a green or red delta | the values and deltas |
| `progress` (charts) | progress bars that fill to 100% | the labels and percentages |
| `screenshot` (screens) | a screen — a background with a cursor, clicks, highlights and typed text | the `events` (0–1 coords), or a real screenshot in `--bg-image` |
| `terminal` (screens) | a terminal that types commands and shows their output, with a blinking cursor | the `steps` (prompt, cmd, out, dur) |

## Using a scene

A scene is a page; use it as the editing skill says a page is used. Copy the file into the project
(beside `film.html`, or in the folder it lives in so a `theme.css` it loads still resolves), and put
it on a track in `film.html`:

```
<section>
  <iframe src="charts/bar.html" at="3" style="left:120px; top:90px; width:640px; height:360px"></iframe>
</section>
```

Then check it, the way the editing skill says: `openfilm look` the film, and **look at the frames** —
a picture is a PNG, and reading only the text a command prints is not seeing it. A chart you made is
not a chart until you have seen it.

## The validator

`scripts/validate.mjs` is a static check, run before you say a film is done. It catches what
`openfilm look` does not: a scene with no `frame`, a page without the fallback loop (so the host
reports *"a `frame()` function did not appear"*), an impossible `#t` trim, a referenced file that is
not there, and text that is too close to its background to read.

```
node <atelier>/scripts/validate.mjs <film.html>
```

It reads the files; it does not render. For black frames, white flashes and sound, that is
`openfilm look --full`. A warning is still a pass; a failure is not. Fix a failure before you say it
is done.

## Adding a scene (the rule)

The scenes in this kit are the whole point only if a new one comes out that the catalog, the
validator and the next agent all find and trust. When you add one — a map, a quote, a table, a
countdown, a scene you have not — do these five, in order:

1. **One function is enough.** Write the scene as a page: a `window.film` with a `frame(t)` and the
   preview-fallback loop, the picture a function of `t` alone. Colors from the CSS variables. A chart
   into a real `<svg>`.
2. **Load the theme.** Put `<link rel="stylesheet" href="theme.css">` in the `<head>` and read the
   colors from it, so the new scene shares the film's look.
3. **Name it in the catalog.** Add an entry to `catalog.json`: its name, file, kind, what it draws,
   the colors it reads, and what you edit. A scene not in the catalog is a scene the next agent will
   not find.
4. **Look at it.** Copy it into the project, put it on a track, `openfilm look` it, and see the frame
   for yourself — not the text a command prints.
5. **Validate it.** Run `scripts/validate.mjs` on the film. A failure is a stop; a warning you keep
   is a choice you make on purpose.

A scene that misses any of the five is not in the kit.
