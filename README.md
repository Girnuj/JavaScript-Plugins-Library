# Plugins

## Introduccion

Todos hemos tenido que resolver alguna vez tareas como abrir un modal, eliminar un elemento del DOM o moverlo de lugar, enviar un form, validar un input.
Este repositorio es una coleccion de plugins utiles en JavaScript nativo para facilitar ese trabajo sin depender de librerias externas ni escribir demasiado codigo repetitivo, la idea es que tomes lo que necesites cuando lo necesites y solo eso.

Cada plugin incluye su version fuente (`.js`) para que puedas adaptarlo a tu gusto, y su version minificada (`.min.js`) para usarla directamente.
Puede servirte para POC, SPA o proyectos empresariales, trabajando solo con JavaScript nativo y atributos HTML.

Si es tu primera vez aqui, te recomiendo revisar al menos el README de cada plugin para conocer rapidamente que problema resuelve y como integrarlo.

Coleccion de plugins JavaScript para manipulacion del DOM organizados por carpeta.
Sin dependencias externas!!.
Estos se inicializan solos al detectar los atributos HTML necesarios, asi que no tienes que preocuparte por escribir JS, tambien puedes optar por la inicializacion manual.

## Plugins Disponibles

- [ChildSelect](ChildSelect/): carga opciones dependientes en un select hijo a partir del valor del select padre.
- [ConfirmAction](ConfirmAction/): solicita confirmacion antes de acciones sensibles o destructivas en botones, links y formularios.
- [FormRequest](FormRequest/): extiende formularios nativos con envio asincrono via `fetch`, manejo de errores por campo, seguridad y control de retries/timeouts.
- [FormValidate](FormValidate/): agrega validaciones extendidas por `data-*` para reglas de negocio y bloquea envio cuando no se cumplen.
- [ImgUploadPreview](ImgUploadPreview/): previsualiza imagenes seleccionadas desde un input file en un elemento `<img>`.
- [InputSwitchFriendly](InputSwitchFriendly/): muestra etiquetas amigables segun el estado de un switch/checkbox.
- [ItemMover](ItemMover/): mueve elementos de una lista hacia arriba o hacia abajo usando triggers con atributos `data-*`.
- [ItemRemover](ItemRemover/): elimina elementos contenedores desde un trigger de borrado.
- [Modal](Modal/): abre y cierra modales usando triggers HTML con atributos `data-*` y API opcional.
- [ModalSteps](ModalSteps/): ejecuta flujos de modal por pasos, con carga remota de contenido, soporte `POST`/`GET` y eventos para controlar cada etapa.
- [NotificationPush](NotificationPush/): dispara notificaciones tipo toast y envia payload dinamico por `data-np-*` a un receptor o endpoint sin cache local.
- [ReplaceMe](ReplaceMe/): reemplaza un trigger por HTML remoto obtenido mediante `POST` o `GET`.
- [RequestState](RequestState/): centraliza estados `idle/loading/success/error` en acciones async, con modo mock para QA y request opcional.
- [TemplateRenderizer](TemplateRenderizer/): renderiza plantillas HTML reemplazando placeholders como `{{propiedad}}` y rutas anidadas.
- [UIState](UIState/): permite previsualizar estados de UI como loading, empty, error o success en componentes para QA y diseno.
- [VideoUrlPreview](VideoUrlPreview/): previsualiza videos de YouTube en un `<iframe>` a partir de una URL.

## Requisitos Generales

- JavaScript con sintaxis ECMAScript 2020 (ECMA-2020)

Plugins funcionales en JavaScript nativo.
ECMAScript 2020 esta soportado por la mayoria de navegadores modernos.

## Versiones Minificadas

Cada plugin incluye su version minificada (`*.min.js`) dentro de su propia carpeta.
Si no necesitas leer o depurar el codigo fuente, usa el archivo minificado para una integracion mas ligera en produccion.

## Patron Recomendado De Observers

Para mantener buen rendimiento cuando varios plugins conviven en una misma vista, el repositorio usa un patron comun de observacion:

- `data-pp-observe-global`: controla si los plugins registran `MutationObserver` automatico.
  - Valor por defecto: activo.
  - Si defines `data-pp-observe-global="false"` en `<html>`, se desactiva la observacion automatica global.
- `data-pp-observe-root`: limita el root observado a un selector CSS especifico.
  - Ejemplo: `data-pp-observe-root="#app"` en `<html>` para observar solo el contenedor principal.
  - Si el selector no existe o es invalido, el plugin usa `document.body` como fallback seguro.

- `data-pp-observe-root-{plugin}`: permite marcar directamente el elemento root para un plugin especifico (sin selector string en `<html>`).
  - Ejemplo: `<main data-pp-observe-root-form-validate>` para `FormValidate`.
  - Tiene prioridad sobre `data-pp-observe-root` cuando ambos existen.

### Uso Rapido (4 Casos)

1. Default (sin configurar nada)
   - No agregues atributos.
   - Resultado: fallback a `document.body`.

2. Root compartido por selector (SPA)

```html
<html data-pp-observe-root="#app"></html>
```

3. Root directo por plugin (recomendado cuando mezclas plugins)

```html
<section data-pp-observe-root-form-request>...</section>
<section data-pp-observe-root-request-state>...</section>
<section data-pp-observe-root-notification-push>...</section>
```

4. Sin observer global (init manual)

```html
<html data-pp-observe-global="false"></html>
<script>
  window.FormValidate.initAll(document);
  window.FormRequest.initAll(document);
  window.Modal.initAll(document);
</script>
```

Regla de prioridad: root directo por plugin > root por selector en `<html>` > `document.body`.

### Atributos Por Plugin (Root Directo)

- `Modal`: `data-pp-observe-root-modal`
- `ModalSteps`: `data-pp-observe-root-modal-steps`
- `FormRequest`: `data-pp-observe-root-form-request`
- `FormValidate`: `data-pp-observe-root-form-validate`
- `RequestState`: `data-pp-observe-root-request-state`
- `NotificationPush`: `data-pp-observe-root-notification-push`
- `UIState`: `data-pp-observe-root-ui-state`
- `ChildSelect`: `data-pp-observe-root-child-select`
- `ConfirmAction`: `data-pp-observe-root-confirm-action`
- `ImgUploadPreview`: `data-pp-observe-root-img-upload-preview`
- `VideoUrlPreview`: `data-pp-observe-root-video-url-preview`
- `ItemMover`: `data-pp-observe-root-item-mover`
- `ItemRemover`: `data-pp-observe-root-item-remover`
- `ReplaceMe`: `data-pp-observe-root-replace-me`
- `InputSwitchFriendly`: `data-pp-observe-root-input-switch-friendly`

Nota de arquitectura: cuando combines plugins de red (por ejemplo `FormRequest` con `RequestState`), define un solo "owner" del request real para evitar doble envio y eventos duplicados.


## Estructura del Repositorio

Cada plugin vive en su propia carpeta y debe incluir su documentacion:

```text
PluginsPublicos/
  NombreDelPlugin/
    plugin.js
    plugin.min.js
    README.md
    test-pluginName.html
```

Ejemplo actual:

```text
PluginsPublicos/
  VideoUrlPreview/
    VideoUrlPreview.js
    VideoUrlPreview.min.js
    README.md
    README.en.md
    test-video-url-preview.html
```

## Convencion Recomendada Para Nuevos Plugins

En cada carpeta de plugin:

1. Archivo principal del plugin (`.js`).
2. `README.md` explicando:
   - Que hace el plugin.
   - Que viene a solucionar.
   - Beneficios.
   - Requisitos.
   - Como incluirlo en HTML.
   - Ejemplo minimo de uso.
   - Opciones y `data-*` disponibles (si aplica).
3. Un archivo de prueba HTML opcional para validar rapidamente el funcionamiento.

## Objetivo

Mantener una biblioteca de plugins simple, reutilizable y bien documentada para que cualquier persona pueda integrarlos rapido en sus proyectos copiando solamente el JS(pluginName.js) o su version .min e incorporandolos en sus proyectos o vistas necesarias de una forma muy simple y liviana.

## Como Contribuir

Si quieres contribuir con mejoras o un nuevo plugin:

1. Crea (o actualiza) la carpeta del plugin siguiendo la estructura del repositorio.
2. Implementa el archivo fuente (`plugin.js`) manteniendo inicializacion por `data-*` y API publica cuando aplique.
3. Agrega/actualiza documentacion en `README.md` y `README.en.md` del plugin.
4. Incluye un HTML de prueba (`test-pluginName.html`) con ejemplos reales de uso.
5. Genera la version minificada (`plugin.min.js`) antes de publicar cambios.
6. Verifica que no haya errores y que los ejemplos funcionen en navegador.
7. Actualiza `README.md` y `README.en.md` raiz para listar el plugin (o documentar el cambio).

Buenas practicas sugeridas:

- Mantener compatibilidad con ECMAScript 2020.
- Evitar dependencias externas innecesarias.
- No romper API publica existente sin documentar claramente el cambio.
