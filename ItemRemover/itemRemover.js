/**
 * @fileoverview Plugin nativo para remover elementos HTML de una lista o colección.
 * @version 3.0
 * @since 2026
 * @author Samuel Montenegro
 * @module ItemRemover
 */
(function () {
	'use strict';

	/**
	 * Selector declarativo de triggers de eliminacion.
	 * @type {string}
	 */
	const SELECTOR_ROLE = '[data-role="remove-item"]'
		/**
		 * Defaults de configuracion para ItemRemover.
		 * @type {Object}
		 */
		, ITEM_REMOVER_DEFAULTS = Object.freeze({
			targetItemSelector: '[data-remove-item="item"]',
		})
		/**
		 * Registro de instancias por trigger.
		 * @type {WeakMap<HTMLElement, ItemRemover>}
		 */
		, INSTANCES = new WeakMap()
		/**
		 * Nodos removidos pendientes de limpieza diferida.
		 * @type {Set<Element>}
		 */
		, PENDING_REMOVALS = new Set();

	/**
	 * Lee opciones declarativas desde dataset (`data-remove-*`).
	 * @param {HTMLElement} element Trigger.
	 * @returns {{targetItemSelector:string}|Object}
	 */
	const getOptionsFromData = (element) => {
		const targetItemSelector = element.dataset.removeTarget;

		if (!targetItemSelector) return {};
		return {
			targetItemSelector, // data-remove-target
		};
	};

	/**
	 * Obtiene triggers compatibles en un root.
	 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
	 * @returns {HTMLElement[]}
	 */
	const getSubjects = (root = document) => {
		const subjects = [];

		if (root.nodeType === 1 && root.matches(SELECTOR_ROLE)) {
			subjects.push(root);
		}

		if (typeof root.querySelectorAll === 'function') {
			subjects.push(...root.querySelectorAll(SELECTOR_ROLE));
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
				ItemRemover.destroyAll(node);
			}
			PENDING_REMOVALS.delete(node);
		});
	};

	/**
	 * Agenda chequeo diferido para destruccion segura de instancias.
	 * @param {Element} node Nodo removido en mutacion.
	 * @returns {void}
	 */
	const scheduleRemovalCheck = (node) => {
		PENDING_REMOVALS.add(node);
		queueMicrotask(flushPendingRemovals);
	};

	/**
	 * Opciones publicas de ItemRemover.
	 * @typedef {Object} ItemRemoverOptions
	 * @property {string} [targetItemSelector='[data-remove-item="item"]'] Selector del nodo a eliminar.
	 */

	/**
	 * Clase principal del plugin ItemRemover.
	 *
	 * Flujo:
	 * 1. Resuelve elemento objetivo con `data-remove-target`.
	 * 2. Intercepta click del trigger.
	 * 3. Elimina el nodo objetivo del DOM.
	 * @class ItemRemover
	 */
	class ItemRemover {
		/**
		 * Crea una instancia de ItemRemover.
		 * @param {HTMLElement} element - Elemento sobre el que se inicializa el plugin.
		 * @param {ItemRemoverOptions} options - Opciones de configuración del plugin.
		 */
		constructor(element, options) {
			this.subject = element;
			this.options = { ...ITEM_REMOVER_DEFAULTS, ...options };
			this.isBound = false;
			this.handleClick = this.handleClick.bind(this);
		}

		/**
		 * Obtiene el elemento objetivo que será eliminado.
		 * @returns {HTMLElement|null}
		 */
		getTargetElement() {
			if (!this.options.targetItemSelector) return null;
			return this.subject.closest(this.options.targetItemSelector);
		}

		/**
		 * Vincula el evento de clic al elemento a remover.
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
		 * Maneja el evento click para remover el elemento configurado.
		 * @param {MouseEvent} evt - Evento click.
		 * @returns {void}
		 */
		handleClick(evt) {
			evt.preventDefault();
			const target = this.getTargetElement();
			if (!target) return;
			target.remove();
		}

		/**
		 * Inicializa (o reutiliza) una instancia del plugin.
		 * @param {HTMLElement} element Elemento trigger.
		 * @param {ItemRemoverOptions} [options={}] Opciones de inicialización.
		 * @returns {ItemRemover}
		 */
		static init(element, options = {}) {
			if (!(element instanceof HTMLElement)) {
				throw new Error('Error: ItemRemover.init requiere un HTMLElement.');
			}

			const currentInstance = INSTANCES.get(element);
			if (currentInstance) {
				return currentInstance;
			}

			const mergedOptions = { ...getOptionsFromData(element), ...options }
				, instance = new ItemRemover(element, mergedOptions);
			INSTANCES.set(element, instance);
			instance.bind();
			return instance;
		}

		/**
		 * Obtiene la instancia asociada a un trigger.
		 * @param {HTMLElement} element Elemento trigger.
		 * @returns {ItemRemover|null}
		 */
		static getInstance(element) {
			if (!(element instanceof HTMLElement)) return null;	
			return INSTANCES.get(element) || null;
		}

		/**
		 * Destruye la instancia asociada a un trigger.
		 * @param {HTMLElement} element Elemento trigger.
		 * @returns {boolean}
		 */
		static destroy(element) {
			const instance = ItemRemover.getInstance(element);
			if (!instance) return false;
			instance.destroy();
			return true;
		}

		/**
		 * Inicializa todas las coincidencias dentro de un root.
		 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
		 * @param {ItemRemoverOptions} [options={}] Opciones compartidas.
		 * @returns {ItemRemover[]}
		 */
		static initAll(root = document, options = {}) {
			return getSubjects(root).map((element) => ItemRemover.init(element, options));
		}

		/**
		 * Destruye todas las instancias encontradas dentro de un root.
		 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
		 * @returns {number}
		 */
		static destroyAll(root = document) {
			return getSubjects(root).reduce((destroyedCount, element) => {
				return ItemRemover.destroy(element) ? destroyedCount + 1 : destroyedCount;
			}, 0);
		}
	}

	/**
	 * Inicializa automaticamente instancias y observa cambios del DOM.
	 *
	 * @returns {void}
	 */
	const startAutoInit = () => {
		ItemRemover.initAll(document);

		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					PENDING_REMOVALS.delete(node);
					ItemRemover.initAll(node);
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
			const observeRootElement = document.querySelector('[data-pp-observe-root-item-remover]');
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

	window.ItemRemover = ItemRemover;
})();
