# Plugins

A collection of JavaScript plugins for DOM manipulation, organized by folder.
No external dependencies.

## General Requirements

- JavaScript using ECMAScript 2020 (ECMA-2020) syntax

Functional plugins in native JavaScript.
ECMAScript 2020 is supported by most modern browsers.

## Repository Structure

Each plugin lives in its own folder and should include its documentation:

```text
PluginsPublicos/
  PluginName/
    plugin.js
    README.md
```

Current example:

```text
PluginsPublicos/
  VideoUrlPreview/
    VideoUrlPreview.js
    README.md
    test-video-url-preview.html
```

## Recommended Convention For New Plugins

Inside each plugin folder:

1. Main plugin file (`.js`).
2. `README.md` explaining:
   - What the plugin does.
   - Requirements.
   - How to include it in HTML.
   - Minimal usage example.
   - Available options and `data-*` attributes (if applicable).
3. Optional test HTML file for quick validation.

## Goal

Maintain a simple, reusable, and well-documented plugin library so that anyone can quickly integrate them into their projects by simply copying the JS and incorporating them into their projects or necessary views.
