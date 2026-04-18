/**
 * @fileoverview Plugin nativo para previsualizar videos de YouTube a partir de una URL ingresada.
 * @version 3.0
 * @since 2026
 * @author Samuel Montenegro
 * @module VideoUrlPreview
 */
(function () {
	'use strict';

	const SELECTOR_ROLE = 'input[data-role="video-preview"], input[data-video-preview-target-frame]'
		, VIDEO_URL_PREVIEW_DEFAULTS = Object.freeze({
			targetItemSelector: '',
		})
		, INSTANCES = new WeakMap()
		, PENDING_REMOVALS = new Set();

	const getTargetElement = (selector) => selector ? document.querySelector(selector) : null;

	const clearFrame = (target) => {
		if (target) {
			target.removeAttribute('src');
		}
	};

	const getValidatedOptions = (element, options = {}) => {
		const targetItemSelector = options.targetItemSelector || element.dataset.videoPreviewTargetFrame;

		if (!targetItemSelector) {
			throw new Error("Error: No se especificó el selector 'data-video-preview-target-frame'.");
		}

		const target = getTargetElement(targetItemSelector);
		if (!target) {
			console.warn(`Warning: No se encontró ningún elemento para el selector '${targetItemSelector}'.`);
			return { ...options, targetItemSelector };
		}

		if (target.tagName !== 'IFRAME') {
			throw new Error("Error: El selector 'data-video-preview-target-frame' no apunta a un elemento <iframe>.");
		}

		return { ...options, targetItemSelector };
	};

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

	const flushPendingRemovals = () => {
		PENDING_REMOVALS.forEach((node) => {
			if (!node.isConnected) {
				VideoUrlPreview.destroyAll(node);
			}
			PENDING_REMOVALS.delete(node);
		});
	};

	const scheduleRemovalCheck = (node) => {
		PENDING_REMOVALS.add(node);
		queueMicrotask(flushPendingRemovals);
	};

	/**
	 * Clase principal del plugin VideoUrlPreview.
	 * Permite previsualizar un video de YouTube en un iframe a partir de una URL ingresada.
	 *
	 * Flujo:
	 * 1. Escucha `input`/`change` del campo de URL.
	 * 2. Extrae ID de YouTube cuando la URL es válida.
	 * 3. Actualiza `src` del iframe destino o limpia vista previa.
	 * @class VideoUrlPreview
	 */
	class VideoUrlPreview {
		/**
		 * Crea una instancia de VideoUrlPreview.
		 * @param {HTMLInputElement} element - Input de texto sobre el que se inicializa.
		 * @param {Object} options - Opciones de configuración del plugin.
		 */
		constructor(element, options) {
			this.subject = element;
			this.options = { ...VIDEO_URL_PREVIEW_DEFAULTS, ...options };
			this.target = getTargetElement(this.options.targetItemSelector);
			this.isBound = false;
			this.handleInput = this.handleInput.bind(this);
			this.handleChange = this.handleChange.bind(this);
		}

		/**
		 * Extrae el ID de YouTube de una URL válida.
		 * @param {string} url - URL del video de YouTube.
		 * @returns {string|null} ID del video o null si no es válido.
		 */
		getYouTubeId(url) {
			if (!url || typeof url !== 'string') return null;
			const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
				, match = url.match(regExp);
			return (match && match[2] && match[2].length === 11) ? match[2] : null;
		}

		/**
		 * Vincula los eventos del input.
		 * @returns {void}
		 */
		bind() {
			if (this.isBound) return;
			this.applyListeners('addEventListener');
			this.isBound = true;
			this.updatePreview(this.subject.value, true);
		}

		/**
		 * Desvincula los eventos del input.
		 * @returns {void}
		 */
		unbind() {
			if (!this.isBound) return;
			this.applyListeners('removeEventListener');
			this.isBound = false;
		}

		/**
		 * Devuelve la lista de listeners del plugin.
		 * @returns {Array<[string, Function]>}
		 */
		getListeners() {
			return [
				['input', this.handleInput],
				['change', this.handleChange]
			];
		}

		/**
		 * Aplica addEventListener/removeEventListener en lote.
		 * @param {'addEventListener'|'removeEventListener'} method - Metodo del EventTarget a ejecutar.
		 * @returns {void}
		 */
		applyListeners(method) {
			this.getListeners().forEach(([eventName, handler]) => {
				this.subject[method](eventName, handler);
			});
		}

		/**
		 * Desmonta la instancia y libera sus listeners.
		 * @param {Object} [options] - Configuración del desmontaje.
		 * @param {boolean} [options.clearPreview=false] - Indica si debe limpiar el iframe actual.
		 * @returns {void}
		 */
		destroy(options = {}) {
			if (!this.isBound) return;
			const { clearPreview = false } = options;

			this.unbind();
			INSTANCES.delete(this.subject);

			if (clearPreview) {
				this.clearPreview();
			}
		}

		/**
		 * Limpia la vista previa actual.
		 * @returns {void}
		 */
		clearPreview() {
			clearFrame(this.target);
		}

		/**
		 * Actualiza la previsualización.
		 * @param {string} inputValue - Valor actual del input.
		 * @param {boolean} clearOnInvalid - Si debe limpiar cuando el valor es inválido.
		 * @returns {void}
		 */
		updatePreview(inputValue, clearOnInvalid = false) {
			const value = `${inputValue || ''}`.trim()
				, videoId = this.getYouTubeId(value);

			if (!this.target) return;

			if (videoId) {
				this.target.src = `//www.youtube.com/embed/${videoId}`;
				return;
			}

			if (clearOnInvalid || !value) {
				this.clearPreview();
			}
		}

		/**
		 * Maneja el evento input.
		 * @param {Event} evt - Evento input.
		 * @returns {void}
		 */
		handleInput(evt) {
			this.updatePreview(evt.target.value, false);
		}

		/**
		 * Maneja el evento change.
		 * @param {Event} evt - Evento change.
		 * @returns {void}
		 */
		handleChange(evt) {
			this.updatePreview(evt.target.value, true);
		}

		/**
		 * Inicializa (o reutiliza) una instancia del plugin.
		 * @param {HTMLInputElement} element Input objetivo.
		 * @param {Object} [options={}] Opciones de inicialización.
		 * @returns {VideoUrlPreview}
		 */
		static init(element, options = {}) {
			if (!(element instanceof HTMLInputElement)) {
				throw new Error('Error: VideoUrlPreview.init requiere un <input>.');
			}

			const currentInstance = INSTANCES.get(element);
			if (currentInstance) return currentInstance;	

			const validatedOptions = getValidatedOptions(element, options)
				, instance = new VideoUrlPreview(element, validatedOptions);

			INSTANCES.set(element, instance);
			instance.bind();
			return instance;
		}

		/**
		 * Obtiene la instancia asociada a un input.
		 * @param {HTMLInputElement} element Input objetivo.
		 * @returns {VideoUrlPreview|null}
		 */
		static getInstance(element) {
			if (!(element instanceof HTMLInputElement)) return null;	
			return INSTANCES.get(element) || null;
		}

		/**
		 * Destruye la instancia asociada a un input.
		 * @param {HTMLInputElement} element Input objetivo.
		 * @param {Object} [options={}] Opciones de destrucción.
		 * @returns {boolean}
		 */
		static destroy(element, options = {}) {
			const instance = VideoUrlPreview.getInstance(element);
			if (!instance) return false;	
			instance.destroy(options);
			return true;
		}

		/**
		 * Inicializa todas las coincidencias dentro de un root.
		 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
		 * @returns {VideoUrlPreview[]}
		 */
		static initAll(root = document) {
			return getSubjects(root).map((element) => VideoUrlPreview.init(element));
		}

		/**
		 * Destruye todas las instancias encontradas dentro de un root.
		 * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
		 * @param {Object} [options={}] Opciones de destrucción.
		 * @returns {number}
		 */
		static destroyAll(root = document, options = {}) {
			return getSubjects(root).reduce((destroyedCount, element) => {
				return VideoUrlPreview.destroy(element, options) ? destroyedCount + 1 : destroyedCount;
			}, 0);
		}
	}

	/**
	 * Inicializa automaticamente instancias y observa cambios del DOM.
	 *
	 * @returns {void}
	 */
	const startAutoInit = () => {
		VideoUrlPreview.initAll(document);

		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					PENDING_REMOVALS.delete(node);
					VideoUrlPreview.initAll(node);
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
			const observeRootElement = document.querySelector('[data-pp-observe-root-video-url-preview]');
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

	window.VideoUrlPreview = VideoUrlPreview;
})();
