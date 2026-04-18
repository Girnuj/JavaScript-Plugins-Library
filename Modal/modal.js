/**
 * @fileoverview Plugin nativo para manejar modales de manera consistente.
 * @version 3.0
 * @since 2026
 * @author Samuel Montenegro 
 * @module Modal
 */
(function () {
    'use strict';

    const ESCAPE_KEY = 'Escape'
        , CLASS_NAME_OPENED = 'modal-opened'
        , SELECTOR_MODAL_SUBJECT = '[role="dialog"],dialog,[data-role="modal"]'
        , SELECTOR_MODAL_BACKDROP = '[data-modal="backdrop"]'
        , SELECTOR_MODAL_TOGGLE = '[data-modal="toggle"]'
        , SELECTOR_MODAL_TOGGLE_TARGET = 'data-modal-target'
        , SELECTOR_MODAL_DISMISS = '[data-modal="dismiss"]'
        , EVENT_HIDDEN = 'hidden.plugin.modal'
        , EVENT_SHOWN = 'shown.plugin.modal'
        , INSTANCES = new WeakMap()
        , PENDING_REMOVALS = new Set();

    const MODAL_DEFAULTS = Object.freeze({
        keyboard: true,
        focus: true,
        static: false,
        show: false,
    });

    const parseBoolean = (value) => {
        if (value === undefined) return undefined;
        if (typeof value === 'boolean') return value;
        const normalized = String(value).trim().toLowerCase();
        if (['', 'true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        return undefined;
    };

    const getOptionsFromData = (element) => {
        const staticValue = parseBoolean(element.dataset.modalStatic)
            , focusValue = parseBoolean(element.dataset.modalFocus)
            , keyboardValue = parseBoolean(element.dataset.modalKeyboard)
            , showValue = parseBoolean(element.dataset.modalShow)
            , options = {};

        if (staticValue !== undefined) options.static = staticValue;
        if (focusValue !== undefined) options.focus = focusValue;
        if (keyboardValue !== undefined) options.keyboard = keyboardValue;
        if (showValue !== undefined) options.show = showValue;

        return options;
    };

    const getSubjects = (root = document) => {
        const subjects = [];

        if (root.nodeType === 1 && root.matches(SELECTOR_MODAL_SUBJECT)) {
            subjects.push(root);
        }

        if (typeof root.querySelectorAll === 'function') {
            subjects.push(...root.querySelectorAll(SELECTOR_MODAL_SUBJECT));
        }

        return subjects;
    };

    const raiseCustomEvent = (element, eventName, relatedTarget) => {
        element.dispatchEvent(new CustomEvent(eventName, {
            bubbles: true,
            detail: { relatedTarget },
        }));
    };

    const flushPendingRemovals = () => {
        PENDING_REMOVALS.forEach((node) => {
            if (!node.isConnected) {
                Modal.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    /**
     * Gestiona la apertura, cierre y alternancia de un modal usando atributos HTML.
     * @class Modal
     */
    class Modal {
        /**
         * Crea una instancia de Modal sobre un elemento contenedor.
         * @param {HTMLElement} element Elemento modal sujeto.
         * @param {Object} options Configuracion fusionada del plugin.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = { ...MODAL_DEFAULTS, ...options };
            this.isDialog = element.tagName === 'DIALOG' && typeof element.showModal === 'function';
            this.isBound = false;
            this.handleClick = this.handleClick.bind(this);
            this.handleKeydown = this.handleKeydown.bind(this);
        }

        /**
         * Indica si el modal se encuentra abierto actualmente.
         * @returns {boolean}
         */
        isOpened() {
            return this.subject.classList.contains(CLASS_NAME_OPENED)
                || (this.isDialog && this.subject.hasAttribute('open'));
        }

        /**
         * Vincula listeners internos del modal segun la configuracion activa.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;
            this.applyListeners('addEventListener');
            this.isBound = true;
        }

        /**
         * Desvincula listeners internos previamente registrados.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;
            this.applyListeners('removeEventListener');
            this.isBound = false;
        }

        /**
         * Define listeners activos segun configuracion actual del modal.
         * @returns {Array<[string, EventListenerOrEventListenerObject, (boolean|undefined)]>}
         */
        getListeners() {
            return [
                ['click', this.handleClick],
                [this.options.keyboard ? 'keydown' : '', this.handleKeydown],
            ].filter(([eventName]) => Boolean(eventName));
        }

        /**
         * Aplica add/remove de listeners en lote.
         * @param {'addEventListener'|'removeEventListener'} method Metodo de EventTarget.
         * @returns {void}
         */
        applyListeners(method) {
            this.getListeners().forEach(([eventName, handler, useCapture]) => {
                this.subject[method](eventName, handler, useCapture);
            });
        }

        /**
         * Gestiona el foco al abrir el modal para mejorar accesibilidad.
         * @returns {void}
         */
        focusFirstElement() {
            if (!this.options.focus) return;

            if (!this.subject.hasAttribute('tabindex')) {
                this.subject.setAttribute('tabindex', '-1');
            }

            this.subject.focus();

            const firstInput = this.subject.querySelector('input:not([type="hidden"]),select,textarea,button,[tabindex]:not([tabindex="-1"])');
            if (firstInput instanceof HTMLElement) {
                firstInput.focus();
            }
        }

        /**
         * Muestra el modal y dispara el evento custom de apertura.
         * @param {EventTarget|HTMLElement|null} relatedTarget Elemento relacionado que origino la accion.
         * @returns {void}
         */
        show(relatedTarget) {
            if (this.isOpened()) return;

            this.bind();

            if (this.isDialog) {
                this.subject.showModal();
            } else {
                this.subject.removeAttribute('aria-hidden');
                this.subject.setAttribute('aria-modal', 'true');
                this.subject.setAttribute('role', 'dialog');
                this.subject.classList.add(CLASS_NAME_OPENED);
            }

            raiseCustomEvent(this.subject, EVENT_SHOWN, relatedTarget);
            this.focusFirstElement();
        }

        /**
         * Oculta el modal y dispara el evento custom de cierre.
         * @param {Event|null} evt Evento que dispara el cierre.
         * @param {EventTarget|HTMLElement|null} relatedTarget Elemento relacionado a la accion.
         * @returns {void}
         */
        hide(evt, relatedTarget) {
            if (!this.isOpened()) return;

            if (evt) {
                evt.preventDefault();
            }

            if (this.isDialog) {
                this.subject.close();
            } else {
                this.subject.classList.remove(CLASS_NAME_OPENED);
                this.subject.removeAttribute('aria-modal');
                this.subject.setAttribute('aria-hidden', 'true');
            }

            this.unbind();
            raiseCustomEvent(this.subject, EVENT_HIDDEN, relatedTarget);
        }

        /**
         * Alterna la visibilidad del modal.
         * @param {EventTarget|HTMLElement|null} relatedTarget Elemento relacionado a la accion.
         * @returns {void}
         */
        toggle(relatedTarget) {
            this.isOpened() ? this.hide(null, relatedTarget) : this.show(relatedTarget);
        }

        /**
         * Procesa clics delegados para dismiss/backdrop dentro del modal.
         * @param {MouseEvent} evt Evento de click recibido por el contenedor.
         * @returns {void}
         */
        handleClick(evt) {
            const dismissTrigger = evt.target.closest(SELECTOR_MODAL_DISMISS)
                , backdropTrigger = evt.target.closest(SELECTOR_MODAL_BACKDROP);

            if (dismissTrigger && this.subject.contains(dismissTrigger)) {
                this.hide(evt, dismissTrigger);
                return;
            }

            if (!this.options.static && backdropTrigger === evt.target && this.subject.contains(backdropTrigger)) {
                this.hide(evt, backdropTrigger);
            }
        }

        /**
         * Procesa la tecla Escape para cierre por teclado cuando aplica.
         * @param {KeyboardEvent} evt Evento de teclado capturado en el modal.
         * @returns {void}
         */
        handleKeydown(evt) {
            if (evt.key !== ESCAPE_KEY) return;
            this.hide(evt);
        }

        /**
         * Libera recursos de la instancia actual y la elimina del registro.
         * @returns {void}
         */
        destroy() {
            this.unbind();
            INSTANCES.delete(this.subject);
        }

        /**
         * Inicializa (o reutiliza) una instancia de Modal para un elemento.
         * @param {HTMLElement} element Elemento modal a inicializar.
         * @param {Object} [options={}] Opciones que sobreescriben data-attributes.
         * @returns {Modal}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: Modal.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) {
                return currentInstance;
            }

            const mergedOptions = { ...getOptionsFromData(element), ...options }
                , instance = new Modal(element, mergedOptions);

            INSTANCES.set(element, instance);

            if (instance.options.show) {
                instance.show();
            }

            return instance;
        }

        /**
         * Recupera la instancia asociada a un elemento modal.
         * @param {HTMLElement} element Elemento modal.
         * @returns {Modal|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * Destruye la instancia asociada a un elemento modal.
         * @param {HTMLElement} element Elemento modal.
         * @returns {boolean}
         */
        static destroy(element) {
            const instance = Modal.getInstance(element);
            if (!instance) return false;
            instance.destroy();
            return true;
        }

        /**
         * Inicializa todos los modales encontrados en un contenedor.
         * @param {ParentNode|Element|Document} [root=document] Raiz donde buscar modales.
         * @param {Object} [options={}] Opciones compartidas para cada instancia.
         * @returns {Modal[]}
         */
        static initAll(root = document, options = {}) {
            return getSubjects(root).map((element) => Modal.init(element, options));
        }

        /**
         * Destruye todas las instancias de modal encontradas en un contenedor.
         * @param {ParentNode|Element|Document} [root=document] Raiz donde buscar instancias.
         * @returns {number}
         */
        static destroyAll(root = document) {
            return getSubjects(root).reduce((destroyedCount, element) => {
                return Modal.destroy(element) ? destroyedCount + 1 : destroyedCount;
            }, 0);
        }
    }

    const handleToggleClick = (evt) => {
        const toggle = evt.target.closest(SELECTOR_MODAL_TOGGLE);
        if (!(toggle instanceof HTMLElement)) return;

        const selector = toggle.getAttribute(SELECTOR_MODAL_TOGGLE_TARGET)
            , target = selector ? document.querySelector(selector) : null;

        if (!(target instanceof HTMLElement)) {
            console.warn('Modal toggle without target. Use data-modal-target="{target selector}"');
            return;
        }

        if (toggle.tagName === 'A') {
            evt.preventDefault();
        }

        const instance = Modal.init(target);
        instance.toggle(toggle);
    };

    const startAutoInit = () => {
        Modal.initAll(document);
        document.addEventListener('click', handleToggleClick);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    PENDING_REMOVALS.delete(node);
                    Modal.initAll(node);
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
            const observeRootElement = document.querySelector('[data-pp-observe-root-modal]');
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

    window.Modal = Modal;
})();