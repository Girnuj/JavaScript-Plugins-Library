# PluginsPublicos

Coleccion de plugins JavaScript/jQuery organizados por carpeta.

## Requisitos Generales

- jQuery 3.x (cualquier version en adelante)
- JavaScript con sintaxis ECMAScript 2020 (ECMA-2020)

ECMAScript 2020 esta soportado por la mayoria de navegadores modernos.

## Estructura del Repositorio

Cada plugin vive en su propia carpeta y debe incluir su documentacion:

```text
PluginsPublicos/
  NombreDelPlugin/
    plugin.js
    README.md
```

Ejemplo actual:

```text
PluginsPublicos/
  VideoUrlPreview/
    yVideoUrlPreview.js
    README.md
    test-video-url-preview.html
```

## Convencion Recomendada Para Nuevos Plugins

En cada carpeta de plugin:

1. Archivo principal del plugin (`.js`).
2. `README.md` explicando:
   - Que hace el plugin.
   - Requisitos.
   - Como incluirlo en HTML.
   - Ejemplo minimo de uso.
   - Opciones y `data-*` disponibles (si aplica).
3. Un archivo de prueba HTML opcional para validar rapidamente el funcionamiento.

## Objetivo

Mantener una biblioteca de plugins simple, reutilizable y bien documentada para que cualquier persona pueda integrarlos rapido en sus proyectos.
