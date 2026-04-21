# FormDraft

## Que hace

FormDraft guarda y restaura automaticamente borradores de formularios en `localStorage` o `sessionStorage` usando atributos `data-*`.

## Que viene a solucionar

En formularios largos (CRM, checkout, onboarding), los usuarios pueden cerrar la pestaña, recargar la pagina o abandonar temporalmente el flujo.

Sin borrador, se pierde informacion y sube el abandono.

## Beneficios

- Guardado automatico por `input/change/blur`.
- Restauracion automatica al volver a la vista.
- Soporte `localStorage` y `sessionStorage`.
- Limpieza de borrador al exito de `FormRequest`.
- Clave configurable por formulario para separar contextos.
- Eventos custom para integraciones (`before/saved/restored/cleared/error`).

## Requisitos

- JavaScript ECMAScript 2020.
- Navegador con `localStorage` o `sessionStorage`.

## Incluir en HTML

```html
<script src="./formDraft.min.js"></script>
```

## Uso basico

```html
<form
  data-form-draft
  data-fd-storage="local"
  data-fd-key="checkout-v1"
>
  <input name="name" />
  <input name="email" />
</form>
```

## Atributos principales

- `data-form-draft`: activa plugin en formularios.
- `data-fd-storage="local|session"`: motor de almacenamiento.
- `data-fd-key="clave"`: clave explicita de borrador.
- `data-fd-key-prefix="prefijo"`: prefijo para clave generada.
- `data-fd-debounce="350"`: debounce de guardado en ms.
- `data-fd-save-on-input="true|false"`: guarda en `input`.
- `data-fd-save-on-change="true|false"`: guarda en `change`.
- `data-fd-save-on-blur="true|false"`: guarda en `blur`.
- `data-fd-restore-on-init="true|false"`: restaura al inicializar.
- `data-fd-clear-on-submit="true|false"`: limpia borrador al `submit`.
- `data-fd-clear-on-form-request-success="true|false"`: limpia al evento `success.plugin.formRequest`.
- `data-fd-max-age="86400000"`: tiempo maximo del borrador en ms.
- `data-fd-include="selector"`: campos permitidos (whitelist).
- `data-fd-exclude="selector"`: campos excluidos (blacklist).

## Compatibilidad con FormRequest

FormDraft es compatible con `FormRequest`.

Patron recomendado:

- `FormRequest` como owner del request real.
- `FormDraft` para persistir progreso del usuario.
- Activar `data-fd-clear-on-form-request-success="true"` para limpiar borrador cuando el backend responde exito.

Nota: `FormDraft` limpia el borrador persistido (storage). Si tambien quieres limpiar los valores visibles del formulario al exito, usa `data-form-reset-on-success="true"` en `FormRequest`.

## API publica

```html
<script>
  const form = document.querySelector('form[data-form-draft]');

  const instance = window.Plugins.FormDraft.init(form, {
    storage: 'local',
    key: 'checkout-v1',
    debounceMs: 300,
    restoreOnInit: true,
    clearOnFormRequestSuccess: true
  });

  instance.saveNow();
  instance.restoreNow();
  instance.clearDraft();

  window.Plugins.FormDraft.getInstance(form);
  window.Plugins.FormDraft.destroy(form);
  window.Plugins.FormDraft.initAll(document);
  window.Plugins.FormDraft.destroyAll(document);
</script>
```

## Eventos

- `before.plugin.formDraft`: antes de guardar (cancelable).
- `saved.plugin.formDraft`: borrador guardado.
- `restored.plugin.formDraft`: borrador restaurado.
- `cleared.plugin.formDraft`: borrador eliminado.
- `error.plugin.formDraft`: error de almacenamiento.

## Demo

- `test-form-draft.html`

## Configuracion Del Observer Del Plugin

Si quieres limitar el `MutationObserver` de este plugin a un contenedor especifico, define un root directo:

```html
<section data-pp-observe-root-form-draft>...</section>
```

Prioridad de root para el plugin:

1. `data-pp-observe-root-form-draft`
2. `data-pp-observe-root` en `<html>`
3. `document.body`

#### ℹ️ Para detalles sobre el patrón de observers y cómo optimizar la inicialización automática de plugins, revisa la sección [Patrón Recomendado De Observers](../README.md#patron-recomendado-de-observers) en el README principal.

## Licencia

Este plugin se distribuye bajo la licencia MIT.
Consulta el archivo LICENSE en la raíz del repositorio para los términos completos.

Copyright (c) 2026 Samuel Montenegro