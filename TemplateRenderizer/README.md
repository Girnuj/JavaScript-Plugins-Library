# TemplateRenderizer

Plugin JavaScript nativo para renderizar plantillas HTML con reemplazo de variables usando `{{propiedad}}`.

## Requisitos

- Un navegador moderno con soporte para `class`, `matchAll`, `Set` y `querySelector`
- Un template en el DOM accesible por selector CSS
- Placeholders en formato `{{nombre}}` o anidados como `{{user.name}}`

## Instalacion

Incluye solo el plugin:

```html
<script src="./templateRenderizer.js"></script>
```

Para uso en produccion, si no necesitas leer el codigo fuente, puedes incluir la version minificada:

```html
<script src="./templateRenderizer.min.js"></script>
```

## Uso Basico

```html
<template id="cardTemplate">
  <article>
    <h3>{{title}}</h3>
    <p>Autor: {{author.name}}</p>
  </article>
</template>

<div id="result"></div>

<script src="./templateRenderizer.js"></script>
<script>
  const renderer = new templateRenderizer({
    templateSelector: '#cardTemplate'
  });

  const html = renderer.render({
    title: 'Hola mundo',
    author: { name: 'Samuel' }
  });

  document.getElementById('result').innerHTML = html;
</script>
```

## Como Funciona

- Busca el nodo indicado en `templateSelector`.
- Detecta placeholders `{{...}}` dentro del HTML del template.
- Reemplaza cada propiedad con datos del objeto enviado a `render(data)`.
- Soporta propiedades anidadas, por ejemplo: `{{user.profile.email}}`.
- Si una propiedad no existe, reemplaza por cadena vacia.

## Atributos `data-*` soportados

Este plugin no depende de atributos `data-*` para funcionar.
Su configuracion se realiza por JavaScript mediante `templateSelector` y opciones de instancia.

## API publica

```html
<script>
  const renderer = new templateRenderizer({
    templateSelector: '#myTemplate'
  });

  const html = renderer.render({
    message: 'Texto dinamico'
  });
</script>
```

- `new templateRenderizer(options)`: crea una instancia del renderizador.
- `options.templateSelector`: selector CSS del template origen.
- `options.propertiesNames` (opcional): lista manual de placeholders a reemplazar.
- `renderer.render(data)`: devuelve el HTML final con reemplazos.

## Errores comunes

- `templateSelector` no existe en el DOM: lanza error.
- Placeholder mal escrito o propiedad inexistente: se reemplaza por cadena vacia.

## Demo

Puedes abrir el archivo de prueba incluido en este proyecto:

- `test-template-renderizer.html`

