# ConfirmAction

Plugin JavaScript nativo para pedir confirmacion antes de ejecutar acciones destructivas o sensibles.

## Que viene a solucionar

En paneles admin, eCommerce o backoffice hay acciones con impacto alto (eliminar, cancelar, resetear, publicar).
Sin confirmacion, un click accidental puede generar perdida de datos o cambios no deseados.

## Beneficios

- Estandariza confirmaciones en toda la app con `data-*`.
- Evita confirmaciones duplicadas o logica repetida por vista.
- Funciona en botones, links y formularios.
- Permite desactivar/activar por atributo y escuchar eventos.
- Soporta confirmacion personalizada con contenedor propio o adapter async.

## Requisitos

- Navegador moderno con soporte para `CustomEvent` y `MutationObserver`.

## Instalacion

```html
<script src="./confirmAction.min.js"></script>
```

Para produccion, usa `confirmAction.min.js`. Para depurar, usa `confirmAction.js`.

## Uso Basico

### En un boton o link

```html
<button
  data-confirm-action
  data-ca-title="Eliminar producto"
  data-ca-message="Esta accion no se puede deshacer."
>
  Eliminar
</button>
```

### En un formulario

```html
<form
  data-confirm-action
  data-ca-title="Publicar cambios"
  data-ca-message="Se publicara el contenido en vivo."
  action="/api/publish"
  method="post"
>
  <button type="submit">Publicar</button>
</form>
```

## Atributos `data-*` soportados

- `data-confirm-action`: activa el plugin. Estado: **requerido**.
- `data-ca-title="Texto"`: titulo opcional mostrado en la confirmacion. Estado: **opcional**.
- `data-ca-message="Texto"`: mensaje principal de confirmacion. Estado: **opcional**.
- `data-ca-enabled="true|false"`: habilita o deshabilita la confirmacion. Estado: **opcional**.
- `data-ca-dialog="#selector"`: contenedor/dialog personalizado para confirmar. Estado: **opcional**.

## API publica

```html
<script>
  const subject = document.querySelector('[data-confirm-action]');

  const instance = window.ConfirmAction.init(subject, {
    title: 'Eliminar registro',
    message: 'Esta accion no se puede deshacer.',
    enabled: true,
    dialogSelector: '#confirmDialog',
    confirmAdapter: function (detail) {
      return window.confirm(detail.message);
    },
    beforeConfirm: function (detail, element) {
      console.log('before', detail.actionType, element);
    },
    onConfirm: function (detail, element) {
      console.log('confirmed', detail.actionType, element);
    },
    onCancel: function (detail, element) {
      console.log('cancelled', detail.actionType, element);
    }
  });

  window.ConfirmAction.getInstance(subject);
  window.ConfirmAction.destroy(subject);
  window.ConfirmAction.initAll(document);
  window.ConfirmAction.destroyAll(document);
</script>
```

## Confirmacion personalizada

Si defines `data-ca-dialog`, el plugin usa ese contenedor en vez de `window.confirm`.

El contenedor debe incluir:

- `[data-ca-dialog-title]`: titulo (opcional).
- `[data-ca-dialog-message]`: mensaje de confirmacion.
- `[data-ca-confirm]`: boton confirmar.
- `[data-ca-cancel]`: boton cancelar.

Si no existe o falla, el plugin vuelve a `window.confirm` como fallback.

## Eventos

- `before.plugin.confirmAction`: antes de mostrar confirmacion (cancelable).
- `confirmed.plugin.confirmAction`: cuando el usuario confirma.
- `cancelled.plugin.confirmAction`: cuando el usuario cancela.

## Casos recomendados

- Eliminar producto, categoria o usuario.
- Cancelar pedido o reembolso.
- Resetear configuracion o datos.
- Publicar contenido en produccion.

## Demo

- `test-confirm-action.html`
