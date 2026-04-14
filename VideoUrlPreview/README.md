# VideoUrlPreview

Plugin jQuery para previsualizar videos de YouTube en un `<iframe>` a partir de una URL ingresada en un `<input>`.

## Requisitos

- jQuery 3.x o superior
- Un `<input>` con el atributo `data-video-preview-target-frame`
- Un `<iframe>` de destino

## Instalacion

Incluye jQuery y luego el plugin:

```html
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="./yVideoUrlPreview.js"></script>
```

## Uso Basico

```html
<input
  type="text"
  data-role="video-preview"
  data-video-preview-target-frame="#previewFrame1"
  placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />

<iframe id="previewFrame1" allowfullscreen></iframe>
```

Con eso basta. El plugin se inicializa automaticamente al cargar el DOM.

## Como Funciona

- Lee el selector del iframe desde `data-video-preview-target-frame`.
- En evento `input`: actualiza la vista previa solo si detecta un ID valido de YouTube.
- En evento `change` (blur/enter): si el valor queda invalido, limpia el `src` del iframe.
- Si el input ya tiene valor al inicializar, intenta renderizar la vista previa.

## Inicializacion Automatica

El plugin se auto-inicializa sobre:

- `input[data-role="video-preview"]`
- `input[data-video-preview-target-frame]`

Ademas, usa `MutationObserver` para inicializar inputs agregados dinamicamente al DOM.

## Inicializacion Manual (opcional)

Si necesitas inicializar manualmente un bloque concreto:

```html
<script>
  $('#miInput').videoUrlPreview();
  // o por selector
  $('input[data-video-preview-target-frame]').videoUrlPreview();
</script>
```

## Formatos de URL soportados

Se aceptan formatos comunes de YouTube, por ejemplo:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

## Errores comunes

- Falta `data-video-preview-target-frame`: se lanza error.
- El selector no existe: muestra `console.warn`.
- El selector no apunta a un `<iframe>`: se lanza error.

## Demo

Puedes abrir el archivo de prueba incluido en este proyecto:

- `test-video-url-preview.html`
