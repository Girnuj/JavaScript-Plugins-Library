/**
 * @fileoverview Plugin nativo para confirmar acciones sensibles o destructivas.
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @module ConfirmAction
 */
(function () {
    'use strict';

    const SELECTOR_SUBJECT = '[data-confirm-action]'
        , INSTANCES = new WeakMap()
        , PENDING_REMOVALS = new Set();

    const CONFIRM_ACTION_DEFAULTS = Object.freeze({
        message: 'Estas seguro de continuar?',
        title: '',
        enabled: true,
        dialogSelector: '',
        confirmAdapter: null,
        beforeConfirm: function () { },
        onConfirm: function () { },
        onCancel: function () { },
    });

    const parseBoolean = (value) => {
        if (value === undefined) return undefined;
        if (typeof value === 'boolean') return value;

        const normalized = String(value).trim().toLowerCase();
        if (['', 'true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        return undefined;
    };

    const getSubjects = (root = document) => {
        const subjects = [];

        if (root.nodeType === 1 && root.matches(SELECTOR_SUBJECT)) {
            subjects.push(root);
        }

        if (typeof root.querySelectorAll === 'function') {
            subjects.push(...root.querySelectorAll(SELECTOR_SUBJECT));
        }

        return subjects;
    };

    const flushPendingRemovals = () => {
        PENDING_REMOVALS.forEach((node) => {
            if (!node.isConnected) {
                ConfirmAction.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    const getOptionsFromData = (element) => {
        const options = {}
            , enabled = parseBoolean(element.dataset.caEnabled);

        if (typeof element.dataset.caMessage === 'string' && element.dataset.caMessage.trim()) {
            options.message = element.dataset.caMessage.trim();
        }

        if (typeof element.dataset.caTitle === 'string' && element.dataset.caTitle.trim()) {
            options.title = element.dataset.caTitle.trim();
        }

        if (typeof element.dataset.caDialog === 'string' && element.dataset.caDialog.trim()) {
            options.dialogSelector = element.dataset.caDialog.trim();
        }

        if (enabled !== undefined) {
            options.enabled = enabled;
        }

        return options;
    };

    /**
     * @typedef {Object} ConfirmActionDetail
     * @property {HTMLElement} element Elemento asociado a la accion.
     * @property {'click'|'submit'} actionType Tipo de accion confirmada.
     * @property {string} title Titulo de confirmacion.
     * @property {string} content Mensaje principal sin formato adicional.
     * @property {string} message Mensaje final mostrado al usuario.
     * @property {Event} originalEvent Evento original que disparo la confirmacion.
     */

    /**
     * @typedef {Object} ConfirmActionOptions
     * @property {string} [message='Estas seguro de continuar?'] Mensaje principal del prompt.
     * @property {string} [title=''] Titulo opcional del prompt.
     * @property {boolean} [enabled=true] Activa o desactiva la confirmacion.
     * @property {string} [dialogSelector=''] Selector CSS de contenedor/dialog custom.
     * @property {(detail: ConfirmActionDetail, element: HTMLElement) => (boolean|Promise<boolean>)} [confirmAdapter] Adapter custom sync/async para resolver confirmacion.
     * @property {(detail: ConfirmActionDetail, element: HTMLElement) => void} [beforeConfirm] Hook previo a la confirmacion.
     * @property {(detail: ConfirmActionDetail, element: HTMLElement) => void} [onConfirm] Hook cuando el usuario confirma.
     * @property {(detail: ConfirmActionDetail, element: HTMLElement) => void} [onCancel] Hook cuando el usuario cancela.
     */

    /**
     * Controla confirmaciones para acciones sensibles en elementos con `data-confirm-action`.
     *
     * Soporta 3 modos de resolucion:
     * - Adapter custom (`confirmAdapter`).
     * - Contenedor/dialog personalizado (`dialogSelector`).
     * - Fallback nativo con `window.confirm`.
     */
    class ConfirmAction {
        /**
         * @param {HTMLElement} element Elemento objetivo (boton, link o formulario).
         * @param {ConfirmActionOptions} options Configuracion de instancia.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = { ...CONFIRM_ACTION_DEFAULTS, ...options };
            this.isBound = false;
            this.skipNextClick = false;
            this.skipNextSubmit = false;
            this.handleClick = this.handleClick.bind(this);
            this.handleSubmitCapture = this.handleSubmitCapture.bind(this);
        }

        /**
         * @returns {string}
         */
        getTitleText() {
            return String(this.options.title || '').trim();
        }

        /**
         * @returns {string}
         */
        getMessageText() {
            return String(this.options.message || '').trim() || CONFIRM_ACTION_DEFAULTS.message;
        }

        /**
         * @returns {string}
         */
        buildPromptMessage() {
            const title = this.getTitleText()
                , message = this.getMessageText();

            if (!title) return message;
            return title + '\n\n' + message;
        }

        /**
         * @param {'click'|'submit'} actionType
         * @param {Event} originalEvent
         * @returns {ConfirmActionDetail}
         */
        buildDetail(actionType, originalEvent) {
            return {
                element: this.subject,
                actionType,
                title: this.getTitleText(),
                content: this.getMessageText(),
                message: this.buildPromptMessage(),
                originalEvent,
            };
        }

        /**
         * @returns {boolean}
         */
        isEnabled() {
            return this.options.enabled !== false;
        }

        /**
         * @param {ConfirmActionDetail} detail
         * @returns {boolean}
         */
        dispatchBefore(detail) {
            this.options.beforeConfirm && this.options.beforeConfirm(detail, this.subject);
            const evt = new CustomEvent('before.plugin.confirmAction', {
                cancelable: true,
                detail,
            });

            return this.subject.dispatchEvent(evt);
        }

        /**
         * @param {ConfirmActionDetail} detail
         * @returns {void}
         */
        dispatchConfirmed(detail) {
            this.options.onConfirm && this.options.onConfirm(detail, this.subject);
            this.subject.dispatchEvent(new CustomEvent('confirmed.plugin.confirmAction', {
                detail,
            }));
        }

        /**
         * @param {ConfirmActionDetail} detail
         * @returns {void}
         */
        dispatchCancelled(detail) {
            this.options.onCancel && this.options.onCancel(detail, this.subject);
            this.subject.dispatchEvent(new CustomEvent('cancelled.plugin.confirmAction', {
                detail,
            }));
        }

        /**
         * @param {ConfirmActionDetail} detail
         * @returns {Promise<boolean|null>}
         */
        async resolveByAdapter(detail) {
            if (typeof this.options.confirmAdapter !== 'function') return null;

            const result = this.options.confirmAdapter(detail, this.subject)
                , resolved = result instanceof Promise ? await result : result;

            return resolved === true;
        }

        /**
         * @param {ConfirmActionDetail} detail
         * @returns {Promise<boolean|null>}
         */
        async resolveByDialog(detail) {
            const selector = typeof this.options.dialogSelector === 'string'
                ? this.options.dialogSelector.trim()
                : '';

            if (!selector) return null;

            let dialog = null;
            try {
                dialog = document.querySelector(selector);
            } catch (_error) {
                dialog = null;
            }

            if (!(dialog instanceof HTMLElement)) {
                return null;
            }

            const confirmButton = dialog.querySelector('[data-ca-confirm]')
                , cancelButton = dialog.querySelector('[data-ca-cancel]')
                , titleTarget = dialog.querySelector('[data-ca-dialog-title]')
                , messageTarget = dialog.querySelector('[data-ca-dialog-message]');

            if (!(confirmButton instanceof HTMLElement) || !(cancelButton instanceof HTMLElement)) {
                return null;
            }

            if (titleTarget) {
                titleTarget.textContent = detail.title || 'Confirmar accion';
            }

            if (messageTarget) {
                messageTarget.textContent = detail.content;
            }

            return new Promise((resolve) => {
                let isDone = false;
                const wasHidden = dialog.hasAttribute('hidden')
                    , isNativeDialog = dialog instanceof HTMLDialogElement;

                const cleanup = () => {
                    confirmButton.removeEventListener('click', onConfirm);
                    cancelButton.removeEventListener('click', onCancel);

                    if (isNativeDialog) {
                        dialog.removeEventListener('cancel', onDialogCancel);
                        dialog.removeEventListener('close', onDialogClose);
                        if (dialog.open) {
                            dialog.close();
                        }
                    } else {
                        dialog.removeEventListener('keydown', onKeyDown);
                        dialog.classList.remove('is-open');
                        if (wasHidden) {
                            dialog.setAttribute('hidden', '');
                        }
                    }
                };

                const done = (value) => {
                    if (isDone) return;
                    isDone = true;
                    cleanup();
                    resolve(value === true);
                };

                const onConfirm = () => done(true)
                    , onCancel = () => done(false)
                    , onDialogCancel = (evt) => {
                        evt.preventDefault();
                        done(false);
                    }
                    , onDialogClose = () => {
                        done(false);
                    }
                    , onKeyDown = (evt) => {
                        if (evt.key === 'Escape') {
                            evt.preventDefault();
                            done(false);
                        }
                    };

                confirmButton.addEventListener('click', onConfirm);
                cancelButton.addEventListener('click', onCancel);

                if (isNativeDialog) {
                    dialog.addEventListener('cancel', onDialogCancel);
                    dialog.addEventListener('close', onDialogClose);
                    if (!dialog.open) {
                        dialog.showModal();
                    }
                } else {
                    dialog.removeAttribute('hidden');
                    dialog.classList.add('is-open');
                    dialog.addEventListener('keydown', onKeyDown);
                }
            });
        }

        /**
         * @param {ConfirmActionDetail} detail
         * @returns {Promise<boolean>}
         */
        async resolveConfirmation(detail) {
            try {
                const adapterResult = await this.resolveByAdapter(detail);
                if (adapterResult !== null) return adapterResult;

                const dialogResult = await this.resolveByDialog(detail);
                if (dialogResult !== null) return dialogResult;
            } catch (_error) {
                // Fallback seguro a confirm nativo cuando un adapter/dialog custom falla.
            }

            return window.confirm(detail.message);
        }

        /**
         * @param {'click'|'submit'} actionType
         * @param {Event} originalEvent
         * @returns {Promise<boolean>}
         */
        async askConfirmation(actionType, originalEvent) {
            if (!this.isEnabled()) return true;

            const detail = this.buildDetail(actionType, originalEvent);
            if (!this.dispatchBefore(detail)) return false;

            const confirmed = await this.resolveConfirmation(detail);
            if (confirmed) {
                this.dispatchConfirmed(detail);
            } else {
                this.dispatchCancelled(detail);
            }

            return confirmed;
        }

        /**
         * Handler para elementos no-form (boton/link).
         * @param {MouseEvent} evt
         * @returns {Promise<void>}
         */
        async handleClick(evt) {
            if (!(this.subject instanceof HTMLElement)) return;
            if (this.subject instanceof HTMLFormElement) return;

            if (this.skipNextClick) {
                this.skipNextClick = false;
                return;
            }

            if (this.subject.hasAttribute('disabled') || this.subject.getAttribute('aria-disabled') === 'true') {
                return;
            }

            evt.preventDefault();
            evt.stopImmediatePropagation();

            const confirmed = await this.askConfirmation('click', evt);
            if (!confirmed) return;

            this.skipNextClick = true;
            this.subject.click();
        }

        /**
         * Handler de submit en captura para formularios.
         * @param {SubmitEvent} evt
         * @returns {Promise<void>}
         */
        async handleSubmitCapture(evt) {
            if (!(this.subject instanceof HTMLFormElement)) return;

            if (this.skipNextSubmit) {
                this.skipNextSubmit = false;
                return;
            }

            evt.preventDefault();
            evt.stopImmediatePropagation();

            const submitter = evt.submitter instanceof HTMLElement ? evt.submitter : null
                , confirmed = await this.askConfirmation('submit', evt);

            if (!confirmed) return;

            this.skipNextSubmit = true;

            if (typeof this.subject.requestSubmit === 'function') {
                if (submitter) {
                    this.subject.requestSubmit(submitter);
                } else {
                    this.subject.requestSubmit();
                }
                return;
            }

            this.subject.submit();
        }

        /**
         * Registra listeners segun tipo de elemento.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;

            if (this.subject instanceof HTMLFormElement) {
                this.subject.addEventListener('submit', this.handleSubmitCapture, true);
            } else {
                this.subject.addEventListener('click', this.handleClick);
            }

            this.isBound = true;
        }

        /**
         * Remueve listeners de la instancia.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;

            if (this.subject instanceof HTMLFormElement) {
                this.subject.removeEventListener('submit', this.handleSubmitCapture, true);
            } else {
                this.subject.removeEventListener('click', this.handleClick);
            }

            this.isBound = false;
        }

        /**
         * Destruye la instancia y limpia registro interno.
         * @returns {void}
         */
        destroy() {
            this.unbind();
            INSTANCES.delete(this.subject);
        }

        /**
         * Inicializa o reutiliza una instancia para el elemento dado.
         * @param {HTMLElement} element
         * @param {ConfirmActionOptions} [options={}]
         * @returns {ConfirmAction}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: ConfirmAction.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) return currentInstance;

            const mergedOptions = { ...getOptionsFromData(element), ...options }
                , instance = new ConfirmAction(element, mergedOptions);

            INSTANCES.set(element, instance);
            instance.bind();
            return instance;
        }

        /**
         * @param {HTMLElement} element
         * @returns {ConfirmAction|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * @param {HTMLElement} element
         * @returns {void}
         */
        static destroy(element) {
            if (!(element instanceof HTMLElement)) return;
            const instance = INSTANCES.get(element);
            if (!instance) return;
            instance.destroy();
        }

        /**
         * @param {ParentNode|Element|Document} [root=document]
         * @returns {ConfirmAction[]}
         */
        static initAll(root = document) {
            return getSubjects(root).map((subject) => ConfirmAction.init(subject));
        }

        /**
         * @param {ParentNode|Element|Document} [root=document]
         * @returns {void}
         */
        static destroyAll(root = document) {
            getSubjects(root).forEach((subject) => ConfirmAction.destroy(subject));
        }
    }

    window.ConfirmAction = ConfirmAction;

    const bootstrap = () => {
        ConfirmAction.initAll(document);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                ConfirmAction.initAll(node);
            });

            mutation.removedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                scheduleRemovalCheck(node);
            });
        });
    });

    const observeGlobal = (document.documentElement.getAttribute('data-pp-observe-global') || '').trim().toLowerCase();
    if (!['false', '0', 'off', 'no'].includes(observeGlobal)) {
        const observeRootSelector = (document.documentElement.getAttribute('data-pp-observe-root') || '').trim()
            , observeRootElement = document.querySelector('[data-pp-observe-root-confirm-action]');
        let observeRoot = observeRootElement || document.body || document.documentElement;

        if (observeRootSelector && !observeRootElement) {
            try {
                observeRoot = document.querySelector(observeRootSelector) || observeRoot;
            } catch (_error) {
                observeRoot = document.body || document.documentElement;
            }
        }

        observer.observe(observeRoot, {
            childList: true,
            subtree: true,
        });
    }
})();
