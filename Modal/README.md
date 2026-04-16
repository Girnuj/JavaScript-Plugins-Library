# Modal

Plugin nativo para abrir, cerrar y alternar modales sin dependencias externas.

## Requisitos

- JavaScript con sintaxis ECMAScript 2020.

## Como incluirlo

```html
<script src="./modal.js"></script>
```
o su version minificada
```html
<script src="./modal.min.js"></script>
```

## Uso rapido con atributos HTML

```html
<button type="button" data-modal="toggle" data-modal-target="#miModal">
  Abrir modal
</button>

<div id="miModal" data-role="modal" aria-hidden="true">
  <div data-modal="backdrop">
    <div class="modal-content">
      <h3>Mi modal</h3>
      <p>Contenido del modal.</p>
      <button type="button" data-modal="dismiss">Cerrar</button>
    </div>
  </div>
</div>
```

Tambien puedes usar un `<dialog>` nativo:

```html
<button type="button" data-modal="toggle" data-modal-target="#dialogoNativo">
  Abrir dialog
</button>

<dialog id="dialogoNativo" data-modal-focus="true">
  <p>Hola desde dialog.</p>
  <button type="button" data-modal="dismiss">Cerrar</button>
</dialog>
```

## Vista previa del ejemplo

Estado inicial (modal cerrado):

![Modal cerrado](./img/image.png)

Estado abierto:

![Modal abierto](./img/image2.png)

## Atributos soportados

- `data-modal="toggle"`: trigger para alternar abrir/cerrar. Estado: **opcional**.
- `data-modal-target="#selector"`: selector CSS del modal a controlar. Estado: **requerido cuando usas `data-modal="toggle"`**.
- `data-modal="dismiss"`: trigger interno para cerrar el modal. Estado: **opcional**.
- `data-modal="backdrop"`: zona de fondo para cerrar al hacer click (si no es estatico). Estado: **opcional**.
- `data-role="modal"`: marca un contenedor como sujeto modal para auto-init. Estado: **opcional** (tambien detecta `role="dialog"` y `<dialog>`).
- `data-modal-static="true|false"`: si es `true`, evita cerrar con backdrop. Estado: **opcional**.
- `data-modal-focus="true|false"`: enfoca el modal y primer elemento interactivo al abrir. Estado: **opcional**.
- `data-modal-keyboard="true|false"`: permite cerrar con tecla Escape. Estado: **opcional**.
- `data-modal-show="true|false"`: abre automaticamente durante la inicializacion. Estado: **opcional**.

## API publica

```js
const modalElement = document.querySelector('#miModal');

const instance = window.Modal.init(modalElement, {
  static: false,
  keyboard: true,
  focus: true,
  show: false,
});

instance.show();
instance.hide();
instance.toggle();

window.Modal.getInstance(modalElement);
window.Modal.destroy(modalElement);
window.Modal.initAll();
window.Modal.destroyAll();
```

## Eventos custom

El modal dispara eventos sobre su propio elemento:

- `shown.plugin.modal`
- `hidden.plugin.modal`

Cada evento expone en `event.detail.relatedTarget` el elemento relacionado con la accion (si aplica).
