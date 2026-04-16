# ChildSelect

Plugin JavaScript nativo para selects dependientes (parent-child) con carga dinamica de opciones via `fetch`.

## Requisitos

- Un navegador moderno con soporte para `fetch`, `MutationObserver`, `WeakMap` y `URL`
- Un `<select>` padre con `data-role="parent-select"`
- Un selector al `<select>` hijo con `data-child-select`
- Una URL de datos con `data-children-url`

## Instalacion

Incluye solo el plugin:

```html
<script src="./childSelect.js"></script>
```

Para uso en produccion, si no necesitas leer el codigo fuente, puedes incluir la version minificada:

```html
<script src="./childSelect.min.js"></script>
```

## Uso 1: Parent-Child simple con `fetch`

```html
<select
  id="categorySelect"
  data-role="parent-select"
  data-child-select="#subcategorySelect"
  data-children-url="/api/subcategories"
  data-value-property="id"
  data-text-property="name">
  <option value="">Seleccione categoria</option>
  <option value="frontend">Frontend</option>
  <option value="backend">Backend</option>
</select>

<select id="subcategorySelect">
  <option value="">-------</option>
</select>
```

## Uso 2: Parent-Child encadenado (3 niveles)

```html
<select
  id="categorySelect"
  data-role="parent-select"
  data-child-select="#subcategorySelect"
  data-children-url="/api/subcategories"
  data-value-property="id"
  data-text-property="name">
  <option value="">Seleccione categoria</option>
  <option value="frontend">Frontend</option>
  <option value="backend">Backend</option>
</select>

<select
  id="subcategorySelect"
  data-role="parent-select"
  data-child-select="#technologySelect"
  data-children-url="/api/technologies"
  data-value-property="id"
  data-text-property="name">
  <option value="">-------</option>
</select>

<select id="technologySelect">
  <option value="">-------</option>
</select>
```

En ambos casos, el plugin usa `fetch` para cargar datos y se inicializa automaticamente al cargar el DOM.

## Como Funciona

- Escucha cambios en el select padre (`data-role="parent-select"`).
- Llama `fetch` a `data-children-url` con los parametros devueltos por `getParamsForChildren(parentValue)`.
- Limpia y reconstruye el select hijo.
- Permite encadenar multiples niveles (ejemplo: categoria -> subcategoria -> tecnologia).
- Soporta listas planas y agrupadas (`grouped`).
- Puede retener valor previo del hijo, auto-seleccionar cuando solo hay una opcion y deshabilitar si queda vacio.

## Atributos `data-*` soportados

- `data-role="parent-select"`: marca el `<select>` como padre para activar el plugin.
- `data-role="parent-select"`: marca el `<select>` como padre para activar el plugin por auto-init. Estado: **requerido en auto-inicializacion**.
- `data-child-select`: selector CSS del `<select>` hijo que sera rellenado. Estado: **requerido**.
- `data-children-url`: endpoint que devuelve opciones para el hijo segun el valor del padre. Estado: **requerido**.
- `data-value-property`: nombre de la propiedad usada como `value` en cada `<option>`. Estado: **opcional**.
- `data-text-property`: nombre de la propiedad usada como texto visible en cada `<option>`. Estado: **opcional**.
- `data-group-options-property`: propiedad que contiene la lista interna cuando el resultado viene agrupado. Estado: **opcional**.
- `data-group-text-property`: propiedad usada como etiqueta del grupo (`<optgroup label="...">`). Estado: **opcional**.
- `data-grouped`: habilita modo de datos agrupados (true/false). Estado: **opcional**.
- `data-empty-text`: texto de la opcion vacia inicial del select hijo. Estado: **opcional**.
- `data-auto-select-single`: si solo llega una opcion, la selecciona automaticamente (true/false). Estado: **opcional**.
- `data-disable-when-empty`: deshabilita el select hijo cuando no hay opciones (true/false). Estado: **opcional**.
- `data-loading-class`: clase CSS temporal aplicada al select hijo durante la carga. Estado: **opcional**.

## Inicializacion Manual (opcional)

```html
<script>
  ChildSelect.init(document.querySelector('#countrySelect'));
  ChildSelect.initAll(document.querySelector('#formFilters'));
</script>
```

## API publica

```html
<script>
  const parentSelect = document.querySelector('#countrySelect')
      , instance = ChildSelect.init(parentSelect, {
          childrenUrl: '/api/cities',
          childSelectSelector: '#citySelect'
        });

  ChildSelect.getInstance(parentSelect);
  ChildSelect.destroy(parentSelect);
  ChildSelect.destroyAll(document.querySelector('#formFilters'));

  instance.destroy();
</script>
```

- `ChildSelect.init(element, options)`: crea o reutiliza una instancia.
- `ChildSelect.getInstance(element)`: devuelve la instancia actual o `null`.
- `ChildSelect.destroy(element)`: desmonta una instancia concreta.
- `ChildSelect.destroyAll(root)`: desmonta todas las instancias dentro de un contenedor.
- `instance.destroy()`: elimina listeners de la instancia actual.

## Errores comunes

- Falta `data-child-select`: se lanza error.
- Falta `data-children-url`: se lanza error.
- El selector hijo no existe en el DOM: muestra warning y no procesa cambios.

## Demo

Puedes abrir el archivo de prueba incluido en este proyecto:

- `test-child-select.html`

## Vista previa del ejemplo

Estado inicial del ejemplo (sin seleccionar en el primer select):

![ChildSelect ejemplo inicial](./img/image.png)

Estado cuando se selecciona un valor en el primer select:

![ChildSelect con primer select elegido](./img/image2.png)

Estado cuando se selecciona un valor en el segundo y tercer select:

![ChildSelect con segundo y tercer select elegidos](./img/image3.png)

