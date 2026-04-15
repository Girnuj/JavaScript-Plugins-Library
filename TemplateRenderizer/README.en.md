# TemplateRenderizer

Native JavaScript plugin to render HTML templates by replacing `{{property}}` placeholders.

## Requirements

- A modern browser with support for `class`, `matchAll`, `Set`, and `querySelector`
- A template node in the DOM reachable through a CSS selector
- Placeholders using `{{name}}` format, including nested paths such as `{{user.name}}`

## Installation

Include only the plugin:

```html
<script src="./templateRenderizer.js"></script>
```

## Basic Usage

```html
<template id="cardTemplate">
  <article>
    <h3>{{title}}</h3>
    <p>Author: {{author.name}}</p>
  </article>
</template>

<div id="result"></div>

<script src="./templateRenderizer.js"></script>
<script>
  const renderer = new templateRenderizer({
    templateSelector: '#cardTemplate'
  });

  const html = renderer.render({
    title: 'Hello world',
    author: { name: 'Samuel' }
  });

  document.getElementById('result').innerHTML = html;
</script>
```

## How It Works

- Finds the DOM node specified by `templateSelector`.
- Detects `{{...}}` placeholders in template HTML.
- Replaces each placeholder with values from `render(data)`.
- Supports nested properties, for example: `{{user.profile.email}}`.
- Missing properties are replaced with an empty string.

## Public API

```html
<script>
  const renderer = new templateRenderizer({
    templateSelector: '#myTemplate'
  });

  const html = renderer.render({
    message: 'Dynamic text'
  });
</script>
```

- `new templateRenderizer(options)`: creates a renderer instance.
- `options.templateSelector`: CSS selector for the source template.
- `options.propertiesNames` (optional): manual placeholder list.
- `renderer.render(data)`: returns final HTML with all replacements.

## Common Errors

- `templateSelector` does not exist in the DOM: throws an error.
- Misspelled placeholder or missing property: replaced by an empty string.

## Demo

You can open the test file included in this project:

- `test-template-renderizer.html`
