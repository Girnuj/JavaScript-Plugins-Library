/**
 * @fileoverview Plugin nativo para selects dependientes (parent-child) con carga dinamica via fetch.
 * @version 3.0
 * @since 2026
 * @author Samuel Montenegro
 * @module ChildSelect
 */
(function () {
	'use strict';

	/**
	 * Selector declarativo del select padre que dispara la carga de opciones.
	 * @type {string}
	 */
	const SELECTOR_PARENT = '[data-role="parent-select"]'
		/**
		 * Defaults de configuracion de ChildSelect.
		 * @type {Object}
		 */
		, CHILD_SELECT_DEFAULTS = Object.freeze({
			childSelectSelector: '',
			childrenUrl: '',
			valuePropertyName: 'Key',
			textPropertyName: 'Value',
			groupTextPropertyName: null,
			groupOptionsPropertyName: null,
			grouped: false,
			emptyValueText: '-------',
			autoSelectWhenSingle: true,
			disableWhenEmpty: false,
			loadingClass: 'loading',
			retainChildValue: true,
			responseObjectToChildProperty: null,
			getDisplay: function (dataObj) {
				return dataObj ? dataObj[this.textPropertyName] : '';
			},
			getGroupDisplay: function (dataObj) {
				return dataObj ? dataObj[this.groupTextPropertyName] : '';
			},
			getParamsForChildren: function (parentValue) {
				return { id: parentValue };
			},
			getOptionEnabled: function () {
				return true;
			},
			getOptionSelected: function () {
				return false;
			}
		})
		/**
		 * Registro de instancias por elemento padre.
		 * @type {WeakMap<HTMLElement, ChildSelect>}
		 */
		, INSTANCES = new WeakMap()
		/**
		 * Nodos removidos pendientes de limpieza diferida.
		 * @type {Set<Element>}
		 */
		, PENDING_REMOVALS = new Set();

	/**
	 * Normaliza valores declarativos a booleanos.
	 * @param {unknown} value Valor fuente.
	 * @returns {boolean}
	 */
	const parseBoolean = (value) => {
		if (value === true) return true;
		if (value === false) return false;
		if (typeof value === 'string') {
			return value.trim().toLowerCase() === 'true';
		}
		return false;
	};

	/**
	 * Obtiene todos los elementos padre compatibles dentro de un root.
	 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
	 * @returns {HTMLElement[]}
	 */
	const getSubjects = (root = document) => {
		const subjects = [];

		if (root.nodeType === 1 && root.matches(SELECTOR_PARENT)) {
			subjects.push(root);
		}

		if (typeof root.querySelectorAll === 'function') {
			subjects.push(...root.querySelectorAll(SELECTOR_PARENT));
		}

		return subjects;
	};

	/**
	 * Resuelve el select hijo por selector CSS.
	 * @param {string} selector Selector configurado.
	 * @returns {HTMLSelectElement|null}
	 */
	const getTargetElement = (selector) => selector ? document.querySelector(selector) : null;

	/**
	 * Dispara evento change con bubbling para sincronizar integraciones externas.
	 * @param {HTMLElement} element Elemento destino del evento.
	 * @returns {void}
	 */
	const triggerChange = (element) => {
		element.dispatchEvent(new Event('change', { bubbles: true }));
	};

	/**
	 * Obtiene el valor actual de un select, soportando modo simple y multiple.
	 *
	 * @param {HTMLSelectElement} selectElement Select a inspeccionar.
	 * @returns {string|string[]|null} Valor actual o `null` cuando no hay seleccion.
	 */
	const getSelectCurrentValue = (selectElement) => {
		if (selectElement.multiple) {
			const selectedValues = Array.from(selectElement.selectedOptions).map((option) => option.value);
			return selectedValues.length ? selectedValues : null;
		}
		return selectElement.value || null;
	};

	/**
	 * Aplica valor(es) al select hijo soportando modo simple y multiple.
	 * @param {HTMLSelectElement} selectElement Select a actualizar.
	 * @param {string|string[]|null|undefined} value Valor objetivo.
	 * @returns {void}
	 */
	const setSelectValue = (selectElement, value) => {
		if (selectElement.multiple) {
			const values = Array.isArray(value) ? value.map(String) : [];
			Array.from(selectElement.options).forEach((option) => {
				option.selected = values.includes(option.value);
			});
			return;
		}
		selectElement.value = value != null ? String(value) : '';
	};

	/**
	 * Lee opciones declarativas desde dataset del select padre.
	 * @param {HTMLElement} element Elemento padre.
	 * @returns {Object}
	 */
	const getOptionsFromData = (element) => {
		const {
			childSelect,
			childrenUrl,
			valueProperty,
			textProperty,
			groupOptionsProperty,
			groupTextProperty,
			grouped,
			emptyText,
			autoSelectSingle,
			disableWhenEmpty,
			loadingClass
		} = element.dataset;

		const dataOptions = {};

		childSelect && (dataOptions.childSelectSelector = childSelect);
		childrenUrl && (dataOptions.childrenUrl = childrenUrl);
		valueProperty && (dataOptions.valuePropertyName = valueProperty);
		textProperty && (dataOptions.textPropertyName = textProperty);
		groupOptionsProperty && (dataOptions.groupOptionsPropertyName = groupOptionsProperty);
		groupTextProperty && (dataOptions.groupTextPropertyName = groupTextProperty);
		grouped && (dataOptions.grouped = grouped);
		emptyText && (dataOptions.emptyValueText = emptyText);
		autoSelectSingle && (dataOptions.autoSelectWhenSingle = autoSelectSingle);
		disableWhenEmpty && (dataOptions.disableWhenEmpty = disableWhenEmpty);
		loadingClass && (dataOptions.loadingClass = loadingClass);

		return dataOptions;
	};

	/**
	 * Mezcla, valida y normaliza opciones efectivas de instancia.
	 * @param {HTMLElement} element Select padre.
	 * @param {Object} [options={}] Overrides por API.
	 * @returns {Object}
	 */
	const getValidatedOptions = (element, options = {}) => {
		const mergedOptions = { ...getOptionsFromData(element), ...options };

		if (!mergedOptions.childSelectSelector) {
			throw new Error("Error: No se especifico el selector 'data-child-select'.");
		}

		const target = getTargetElement(mergedOptions.childSelectSelector);
		if (!target) {
			console.warn(`Warning: No se encontro ningun elemento para el selector '${mergedOptions.childSelectSelector}'.`);
		}

		if (!mergedOptions.childrenUrl) {
			throw new Error("Error: No se especifico la URL 'data-children-url'.");
		}

		mergedOptions.autoSelectWhenSingle = parseBoolean(mergedOptions.autoSelectWhenSingle);
		mergedOptions.disableWhenEmpty = parseBoolean(mergedOptions.disableWhenEmpty);
		mergedOptions.grouped = parseBoolean(mergedOptions.grouped);
		mergedOptions.retainChildValue = mergedOptions.retainChildValue === undefined
			? true
			: parseBoolean(mergedOptions.retainChildValue);

		return mergedOptions;
	};

	/**
	 * Destruye instancias asociadas a nodos realmente removidos del DOM.
	 * @returns {void}
	 */
	const flushPendingRemovals = () => {
		PENDING_REMOVALS.forEach((node) => {
			if (!node.isConnected) {
				ChildSelect.destroyAll(node);
			}
			PENDING_REMOVALS.delete(node);
		});
	};

	/**
	 * Agenda una comprobacion diferida para evitar destruir nodos temporalmente movidos.
	 * @param {Element} node Nodo removido en la mutacion.
	 * @returns {void}
	 */
	const scheduleRemovalCheck = (node) => {
		PENDING_REMOVALS.add(node);
		queueMicrotask(flushPendingRemovals);
	};

	/**
	 * Maneja la relacion parent-child entre selects con carga remota de opciones.
	 *
	 * Flujo resumido:
	 * 1. Escucha cambios del select padre.
	 * 2. Solicita opciones del hijo al endpoint configurado.
	 * 3. Renderiza opciones, conserva valor cuando aplica y sincroniza estado disabled.
	 * 4. Persiste ultimo valor del hijo para escenarios de recarga dependiente.
	 * @class ChildSelect
	 */
	class ChildSelect {
		/**
		 * Crea una instancia del plugin para un select padre.
		 * @param {HTMLSelectElement} element - Select padre que dispara la carga.
		 * @param {Object} options - Opciones de configuración de la instancia.
		 */
		constructor(element, options) {
			this.subject = element;
			this.options = { ...CHILD_SELECT_DEFAULTS, ...options };
			this.target = getTargetElement(this.options.childSelectSelector);
			this.isBound = false;
			this.handleParentChange = this.handleParentChange.bind(this);
			this.handleChildChange = this.handleChildChange.bind(this);
		}

		/**
		 * Construye la opcion vacia reutilizable del select hijo.
		 * @returns {HTMLOptionElement|null}
		 */
		getEmptyValueOption() {
			const txt = this.options.emptyValueText;
			if (!txt) return null;
			if (this._cachedEmptyText === txt && this._cachedEmptyOption) {
				return this._cachedEmptyOption.cloneNode(true);
			}

			const option = document.createElement('option');
			option.value = '';
			option.textContent = txt;
			option.setAttribute('data-empty', 'true');

			this._cachedEmptyText = txt;
			this._cachedEmptyOption = option;
			return option.cloneNode(true);
		}

		/**
		 * Limpia el select hijo, agrega opcion vacia y dispara change.
		 * @returns {void}
		 */
		clearTarget() {
			if (!this.target) return;

			const emptyOpt = this.getEmptyValueOption();
			this.target.innerHTML = '';
			if (emptyOpt) this.target.appendChild(emptyOpt);

			if (this.target.multiple) {
				setSelectValue(this.target, []);
			} else {
				setSelectValue(this.target, '');
			}

			triggerChange(this.target);
		}

		/**
		 * Guarda la respuesta JSON en una propiedad data-* del select hijo si esta configurado.
		 *
		 * @param {Array|Object|null} data Respuesta recibida del endpoint.
		 * @returns {void}
		 */
		setResponseProperty(data) {
			if (!this.target) return;
			if (typeof this.options.responseObjectToChildProperty !== 'string') return;
			if (!this.options.responseObjectToChildProperty) return;

			this.target.dataset[this.options.responseObjectToChildProperty] = JSON.stringify(data);
		}

		/**
		 * Agrega clase de carga al select hijo mientras se consulta el endpoint.
		 *
		 * @returns {void}
		 */
		addLoadingClass() {
			if (!this.target || !this.options.loadingClass) return;
			this.target.classList.add(this.options.loadingClass);
		}

		/**
		 * Quita clase de carga del select hijo al finalizar la consulta.
		 *
		 * @returns {void}
		 */
		removeLoadingClass() {
			if (!this.target || !this.options.loadingClass) return;
			this.target.classList.remove(this.options.loadingClass);
		}

		/**
		 * Compara valor(es) entre opcion candidata y valor actual del hijo.
		 *
		 * @param {string|string[]} childValue Valor de opcion candidata.
		 * @param {string|string[]} currentValue Valor actual del select hijo.
		 * @returns {boolean}
		 */
		isSameValue(childValue, currentValue) {
			if (Array.isArray(childValue) && Array.isArray(currentValue)) {
				return childValue.some((value) => currentValue.includes(String(value)));
			}
			return String(childValue) === String(currentValue);
		}

		/**
		 * Genera opciones (planas o agrupadas) para el select hijo.
		 * @param {Array|Object} children - Respuesta normalizada del endpoint.
		 * @param {string|string[]|null} previousValue - Valor previo para retencion.
		 * @returns {{fragment: DocumentFragment, valueContained: boolean, valueSelected: *}}
		 */
		buildOptions(children, previousValue) {
			let valueContained = false
				, valueSelected = null;

			const fragment = document.createDocumentFragment();

			if (!this.options.grouped) {
				(children || []).forEach((child) => {
					const v = child[this.options.valuePropertyName]
						, selected = this.options.getOptionSelected(child)
						, enabled = this.options.getOptionEnabled(child)
						, option = document.createElement('option');

					option.value = v != null ? String(v) : '';
					option.textContent = this.options.getDisplay.call(this.options, child);
					if (!enabled) option.disabled = true;
					if (selected) valueSelected = v;
					fragment.appendChild(option);

					if (previousValue != null) {
						valueContained = valueContained || this.isSameValue(v, previousValue);
					}
				});

				return { fragment, valueContained, valueSelected };
			}

			const groups = new Map();
			if (this.options.groupOptionsPropertyName === null || this.options.groupTextPropertyName === null) {
				Object.keys(children || {}).forEach((key) => {
					groups.set(key, children[key] || []);
				});
			} else {
				(children || []).forEach((item) => {
					groups.set(item[this.options.groupTextPropertyName] || '', item[this.options.groupOptionsPropertyName] || []);
				});
			}

			for (const [groupName, groupChildren] of groups.entries()) {
				const optgroup = document.createElement('optgroup');
				optgroup.label = groupName || '';

				(groupChildren || []).forEach((child) => {
					const v = child[this.options.valuePropertyName]
						, selected = this.options.getOptionSelected(child)
						, enabled = this.options.getOptionEnabled(child)
						, option = document.createElement('option');

					option.value = v != null ? String(v) : '';
					option.textContent = this.options.getDisplay.call(this.options, child);
					if (!enabled) option.disabled = true;
					if (selected) valueSelected = v;
					optgroup.appendChild(option);

					if (previousValue != null) {
						valueContained = valueContained || this.isSameValue(v, previousValue);
					}
				});

				fragment.appendChild(optgroup);
			}

			return { fragment, valueContained, valueSelected };
		}

		/**
		 * Solicita opciones hijas para el valor seleccionado del padre.
		 * @param {string} parentValue - Valor actual del select padre.
		 * @returns {Promise<Array|Object>}
		 */
		async fetchChildren(parentValue) {
			const params = this.options.getParamsForChildren(parentValue) || {}
				, url = new URL(this.options.childrenUrl, window.location.href);

			Object.entries(params).forEach(([key, value]) => {
				if (value === undefined || value === null) return;
				url.searchParams.set(key, value);
			});

			const response = await fetch(url.toString(), {
				method: 'GET',
				headers: {
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`Error al obtener hijos (${response.status}).`);
			}

			return response.json();
		}

		/**
		 * Maneja el cambio del select padre, descarga datos y actualiza el hijo.
		 * @returns {Promise<void>}
		 */
		async handleParentChange() {
			if (!this.target) return;

			const parentValue = this.subject.value
				, currentChildValue = getSelectCurrentValue(this.target)
				, previousValue = currentChildValue || this.target.dataset.childselectPreValue || null;

			if (previousValue) {
				this.target.dataset.childselectPreValue = Array.isArray(previousValue)
					? JSON.stringify(previousValue)
					: String(previousValue);
			}

			if (!parentValue) {
				this.clearTarget();
				if (this.options.disableWhenEmpty) this.target.disabled = true;
				return;
			}

			this.addLoadingClass();

			try {
				const children = await this.fetchChildren(parentValue);
				this.clearTarget();

				const hasChildren = Array.isArray(children)
					? children.length > 0
					: Boolean(children && Object.keys(children).length);

				if (!hasChildren) {
					if (this.options.disableWhenEmpty) this.target.disabled = true;
					this.setResponseProperty(null);
					return;
				}

				this.setResponseProperty(children);
				this.target.disabled = false;

				const { fragment, valueContained, valueSelected } = this.buildOptions(children, previousValue);
				this.target.appendChild(fragment);

				if (this.options.autoSelectWhenSingle && Array.isArray(children) && children.length === 1) {
					setSelectValue(this.target, children[0][this.options.valuePropertyName]);
					triggerChange(this.target);
					return;
				}

				if (this.options.retainChildValue && valueContained && previousValue != null) {
					setSelectValue(this.target, previousValue);
					triggerChange(this.target);
					return;
				}

				if (!this.options.retainChildValue && valueSelected != null) {
					setSelectValue(this.target, valueSelected);
					triggerChange(this.target);
				}
			} catch (error) {
				console.warn(error && error.message ? error.message : 'Error al cargar children para ChildSelect.');
			} finally {
				this.removeLoadingClass();
			}
		}

		/**
		 * Persiste el ultimo valor del hijo para intentar retenerlo.
		 * @returns {void}
		 */
		handleChildChange() {
			if (!this.target) return;
			const childValue = getSelectCurrentValue(this.target);
			if (!childValue) return;
			this.target.dataset.childselectPreValue = Array.isArray(childValue)
				? JSON.stringify(childValue)
				: String(childValue);
		}

		/**
		 * Registra listeners para sincronizar parent y child.
		 * @returns {void}
		 */
		bind() {
			if (this.isBound) return;
			this.applyListeners('addEventListener');
			this.isBound = true;
		}

		/**
		 * Elimina listeners registrados para la instancia.
		 * @returns {void}
		 */
		unbind() {
			if (!this.isBound) return;
			this.applyListeners('removeEventListener');
			this.isBound = false;
		}

		/**
		 * Construye la lista de listeners del plugin.
		 * @returns {Array<[string, Function]>}
		 */
		getListeners() {
			return [
				['change', this.handleParentChange],
				[this.target ? 'change' : '', this.handleChildChange]
			].filter(([eventName]) => Boolean(eventName));
		}

		/**
		 * Aplica addEventListener/removeEventListener en lote.
		 * @param {'addEventListener'|'removeEventListener'} method - Metodo del EventTarget a ejecutar.
		 * @returns {void}
		 */
		applyListeners(method) {
			this.getListeners().forEach(([eventName, handler]) => {
				if (handler === this.handleChildChange) {
					this.target && this.target[method](eventName, handler);
					return;
				}
				this.subject[method](eventName, handler);
			});
		}

		/**
		 * Elimina listeners y desmonta la instancia actual.
		 * @returns {void}
		 */
		destroy() {
			this.unbind();
			INSTANCES.delete(this.subject);
		}

		/**
		 * Inicializa una instancia en un select padre.
		 * @param {HTMLElement} element - Select padre a inicializar.
		 * @param {Object} [options={}] - Opciones que sobreescriben data-*.
		 * @returns {ChildSelect}
		 */
		static init(element, options = {}) {
			if (!(element instanceof HTMLSelectElement)) {
				throw new Error('Error: ChildSelect.init requiere un <select> padre.');
			}

			const currentInstance = INSTANCES.get(element);
			if (currentInstance) return currentInstance;

			const validatedOptions = getValidatedOptions(element, options)
				, instance = new ChildSelect(element, validatedOptions);

			INSTANCES.set(element, instance);
			instance.bind();
			return instance;
		}

		/**
		 * Obtiene la instancia asociada a un select padre.
		 * @param {HTMLElement} element - Select padre.
		 * @returns {ChildSelect|null}
		 */
		static getInstance(element) {
			if (!(element instanceof HTMLSelectElement)) return null;
			return INSTANCES.get(element) || null;
		}

		/**
		 * Destruye la instancia de un select padre.
		 * @param {HTMLElement} element - Select padre.
		 * @returns {boolean}
		 */
		static destroy(element) {
			const instance = ChildSelect.getInstance(element);
			if (!instance) return false;
			instance.destroy();
			return true;
		}

		/**
		 * Inicializa todos los selects padre dentro de una raiz.
		 * @param {ParentNode|Element|Document} [root=document] - Nodo raiz de busqueda.
		 * @param {Object} [options={}] - Opciones compartidas.
		 * @returns {ChildSelect[]}
		 */
		static initAll(root = document, options = {}) {
			return getSubjects(root).map((element) => ChildSelect.init(element, options));
		}

		/**
		 * Destruye todas las instancias encontradas en una raiz.
		 * @param {ParentNode|Element|Document} [root=document] - Nodo raiz de busqueda.
		 * @returns {number}
		 */
		static destroyAll(root = document) {
			return getSubjects(root).reduce((destroyedCount, element) => {
				return ChildSelect.destroy(element) ? destroyedCount + 1 : destroyedCount;
			}, 0);
		}
	}

	/**
	 * Inicializa automaticamente instancias del plugin y observa cambios en el DOM.
	 *
	 * @returns {void}
	 */
	const startAutoInit = () => {
		ChildSelect.initAll(document);

		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					PENDING_REMOVALS.delete(node);
					ChildSelect.initAll(node);
				});

				mutation.removedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					scheduleRemovalCheck(node);
				});
			});
		});

		const observeGlobal = (document.documentElement.getAttribute('data-pp-observe-global') || '').trim().toLowerCase();
		if (!['false', '0', 'off', 'no'].includes(observeGlobal)) {
			const observeRootSelector = (document.documentElement.getAttribute('data-pp-observe-root') || '').trim()
				, observeRootElement = document.querySelector('[data-pp-observe-root-child-select]');
			let observeRoot = observeRootElement || document.body || document.documentElement;

			if (observeRootSelector && !observeRootElement) {
				try {
					observeRoot = document.querySelector(observeRootSelector) || observeRoot;
				} catch (_error) {
					observeRoot = document.body || document.documentElement;
				}
			}

			observer.observe(observeRoot, { childList: true, subtree: true });
		}
	};

	document.readyState === 'loading'
		? document.addEventListener('DOMContentLoaded', startAutoInit, { once: true })
		: startAutoInit();

	window.ChildSelect = ChildSelect;
})();
