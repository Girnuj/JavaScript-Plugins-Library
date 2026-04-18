/**
 * @fileoverview Plugin nativo para reemplazar un elemento por HTML remoto al hacer clic.
 * @version 3.0
 * @since 2026
 * @author Samuel Montenegro
 * @module ReplaceMe
 */
(function () {
	'use strict';

	/**
	 * Selector declarativo de triggers ReplaceMe.
	 * @type {string}
	 */
	const SELECTOR_REPLACE_ME = '[data-role="replace-me"]'
		/**
		 * Defaults de configuracion para ReplaceMe.
		 * @type {Object}
		 */
		, REPLACE_ME_DEFAULTS = Object.freeze({
			replaceSourceUrl: '',
			requestMethod: 'POST',
		})
		/**
		 * Registro de instancias por trigger.
		 * @type {WeakMap<HTMLElement, ReplaceMe>}
		 */
		, INSTANCES = new WeakMap()
		/**
		 * Nodos removidos pendientes de limpieza diferida.
		 * @type {Set<Element>}
		 */
		, PENDING_REMOVALS = new Set();

	/**
	 * Normaliza y valida metodo HTTP permitido por ReplaceMe.
	 * @param {unknown} value Metodo solicitado.
	 * @returns {'GET'|'POST'}
	 */
	const getValidatedRequestMethod = (value) => {
		const requestMethod = `${value || ''}`.trim().toUpperCase() || REPLACE_ME_DEFAULTS.requestMethod;

		if (!['GET', 'POST'].includes(requestMethod)) {
			throw new Error("Error: 'requestMethod' solo permite 'GET' o 'POST'.");
		}
		return requestMethod;
	};

	/**
	 * Lee opciones declarativas desde dataset (`data-replace-me-*`).
	 * @param {HTMLElement} element Trigger.
	 * @returns {{replaceSourceUrl:string|undefined,requestMethod:string|undefined}|Object}
	 */
	const getOptionsFromData = (element) => {
		const replaceSourceUrl = element.dataset.replaceMeSrc
			, requestMethod = element.dataset.replaceMeMethod;

		if (!replaceSourceUrl && !requestMethod) return {};	
		return {
			replaceSourceUrl, // data-replace-me-src
			requestMethod, // data-replace-me-method
		};
	};

	/**
	 * Mezcla y valida opciones efectivas de la instancia.
	 * @param {HTMLElement} element Trigger del plugin.
	 * @param {Object} [options={}] Overrides por API.
	 * @returns {Object}
	 */
	const getValidatedOptions = (element, options = {}) => {
		const mergedOptions = { ...REPLACE_ME_DEFAULTS, ...getOptionsFromData(element), ...options }
			, { replaceSourceUrl } = mergedOptions;

		if (!replaceSourceUrl) {
			throw new Error("Error: No se especificó la URL 'data-replace-me-src'.");
		}
		mergedOptions.requestMethod = getValidatedRequestMethod(mergedOptions.requestMethod);
		return mergedOptions;
	};

	/**
	 * Obtiene triggers compatibles en un root.
	 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
	 * @returns {HTMLElement[]}
	 */
	const getSubjects = (root = document) => {
		const subjects = [];
		if (root.nodeType === 1 && root.matches(SELECTOR_REPLACE_ME)) {
			subjects.push(root);
		}

		if (typeof root.querySelectorAll === 'function') {
			subjects.push(...root.querySelectorAll(SELECTOR_REPLACE_ME));
		}
		return subjects;
	};

	/**
	 * Limpia instancias asociadas a nodos removidos del DOM.
	 * @returns {void}
	 */
	const flushPendingRemovals = () => {
		PENDING_REMOVALS.forEach((node) => {
			if (!node.isConnected) {
				ReplaceMe.destroyAll(node);
			}
			PENDING_REMOVALS.delete(node);
		});
	};

	/**
	 * Agenda chequeo diferido para destruccion segura de instancias.
	 * @param {Element} node Nodo removido por mutacion.
	 * @returns {void}
	 */
	const scheduleRemovalCheck = (node) => {
		PENDING_REMOVALS.add(node);
		queueMicrotask(flushPendingRemovals);
	};

	/**
	 * Opciones publicas de ReplaceMe.
	 * @typedef {Object} ReplaceMeOptions
	 * @property {string} replaceSourceUrl URL del HTML remoto a inyectar.
	 * @property {'GET'|'POST'} [requestMethod='POST'] Metodo HTTP permitido.
	 */

	/**
	 * Clase principal del plugin ReplaceMe.
	 *
	 * Flujo:
	 * 1. Intercepta click en el trigger.
	 * 2. Solicita HTML remoto con fetch.
	 * 3. Reemplaza el nodo actual con el HTML recibido.
	 * @class ReplaceMe
	 */
	class ReplaceMe {
		/**
		 * Crea una instancia de ReplaceMe.
		 * @param {HTMLElement} element - Elemento sobre el que se inicializa el plugin.
		 * @param {ReplaceMeOptions} options - Opciones de configuración del plugin.
		 */
		constructor(element, options) {
			this.subject = element;
			this.options = { ...REPLACE_ME_DEFAULTS, ...options };
			this.isBound = false;
			this.handleClick = this.handleClick.bind(this);
		}

		/**
		 * Vincula el evento click al elemento para reemplazarlo por HTML remoto.
		 * @returns {void}
		 */
		bind() {
			if (this.isBound) return;
			this.subject.addEventListener('click', this.handleClick);
			this.isBound = true;
		}

		/**
		 * Desmonta la instancia y libera sus listeners.
		 * @returns {void}
		 */
		destroy() {
			if (!this.isBound) return;
			this.subject.removeEventListener('click', this.handleClick);
			this.isBound = false;
			INSTANCES.delete(this.subject);
		}

		/**
		 * Maneja el click para descargar y reemplazar HTML.
		 * @param {MouseEvent} evt - Evento click.
		 * @returns {Promise<void>}
		 */
		async handleClick(evt) {
			evt.preventDefault();

			const preCursor = this.subject.style.cursor;
			this.subject.style.cursor = 'wait';

			try {
				const response = await fetch(this.options.replaceSourceUrl, {
					method: this.options.requestMethod,
					credentials: 'same-origin',
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const html = await response.text();
				this.subject.outerHTML = html;
			} catch (_error) {
				if ('disabled' in this.subject) {
					this.subject.disabled = true;
				}
			} finally {
				this.subject.style.cursor = preCursor;
			}
		}

		/**
		 * Inicializa (o reutiliza) una instancia del plugin.
		 * @param {HTMLElement} element Elemento trigger.
		 * @param {ReplaceMeOptions} [options={}] Opciones de inicialización.
		 * @returns {ReplaceMe}
		 */
		static init(element, options = {}) {
			if (!(element instanceof HTMLElement)) {
				throw new Error('Error: ReplaceMe.init requiere un HTMLElement.');
			}

			const currentInstance = INSTANCES.get(element);
			if (currentInstance) {
				return currentInstance;
			}

			const validatedOptions = getValidatedOptions(element, options)
				, instance = new ReplaceMe(element, validatedOptions);

			INSTANCES.set(element, instance);
			instance.bind();
			return instance;
		}

		/**
		 * Obtiene la instancia asociada a un trigger.
		 * @param {HTMLElement} element Elemento trigger.
		 * @returns {ReplaceMe|null}
		 */
		static getInstance(element) {
			if (!(element instanceof HTMLElement)) 	return null;
			return INSTANCES.get(element) || null;
		}

		/**
		 * Destruye la instancia asociada a un trigger.
		 * @param {HTMLElement} element Elemento trigger.
		 * @returns {boolean}
		 */
		static destroy(element) {
			const instance = ReplaceMe.getInstance(element);
			if (!instance) return false;
			instance.destroy();
			return true;
		}

		/**
		 * Inicializa todas las coincidencias dentro de un root.
		 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
		 * @param {ReplaceMeOptions} [options={}] Opciones compartidas.
		 * @returns {ReplaceMe[]}
		 */
		static initAll(root = document, options = {}) {
			return getSubjects(root).map((element) => ReplaceMe.init(element, options));
		}

		/**
		 * Destruye todas las instancias encontradas dentro de un root.
		 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
		 * @returns {number}
		 */
		static destroyAll(root = document) {
			return getSubjects(root).reduce((destroyedCount, element) => {
				return ReplaceMe.destroy(element) ? destroyedCount + 1 : destroyedCount;
			}, 0);
		}
	}

	/**
	 * Inicializa automaticamente instancias y observa cambios del DOM.
	 *
	 * @returns {void}
	 */
	const startAutoInit = () => {
		ReplaceMe.initAll(document);

		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					PENDING_REMOVALS.delete(node);
					ReplaceMe.initAll(node);
				});

				mutation.removedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					scheduleRemovalCheck(node);
				});
			});
		});

		const observeGlobal = (document.documentElement.getAttribute('data-pp-observe-global') || '').trim().toLowerCase();
		if (!['false', '0', 'off', 'no'].includes(observeGlobal)) {
			const observeRootSelector = (document.documentElement.getAttribute('data-pp-observe-root') || '').trim();
			const observeRootElement = document.querySelector('[data-pp-observe-root-replace-me]');
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

	window.ReplaceMe = ReplaceMe;
})();
