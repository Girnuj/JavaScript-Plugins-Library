/**
 * @fileoverview Plugin nativo para notificaciones push por data-* con payload dinamico.
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @module NotificationPush
 */
(function () {
    'use strict';

    const SELECTOR_SUBJECT = '[data-notification-push]'
        , TOAST_CONTAINER_ID = 'np-toast-container'
        , STYLE_TAG_ID = 'np-toast-style'
        , INSTANCES = new WeakMap()
        , PENDING_REMOVALS = new Set();

    const NOTIFICATION_PUSH_DEFAULTS = Object.freeze({
        defaultType: 'success',
        defaultDuration: 4200,
        showToast: true,
        injectDefaultStyles: true,
        toastClass: '',
        toastContainerClass: '',
        sendRequest: false,
        requestMethod: 'POST',
        endpoint: '',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        onBeforePush: function () { },
        onShown: function () { },
        onSent: function () { },
        onError: function () { },
    });

    const parseBoolean = (value) => {
        if (value === undefined) return undefined;
        if (typeof value === 'boolean') return value;
        const normalized = String(value).trim().toLowerCase();
        if (['', 'true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        return undefined;
    };

    const parseNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    /**
     * Divide una cadena de clases CSS en tokens validos.
     *
     * @param {string|undefined|null} value Cadena con clases separadas por espacios.
     * @returns {string[]} Lista de clases limpias.
     */
    const splitClassTokens = (value) => {
        if (!value || typeof value !== 'string') return [];
        return value
            .trim()
            .split(/\s+/)
            .map((item) => item.trim())
            .filter(Boolean);
    };

    const normalizeType = (value, fallback = 'success') => {
        const normalized = String(value || fallback).trim().toLowerCase();
        if (['success', 'info', 'warning', 'error'].includes(normalized)) return normalized;
        return fallback;
    };

    /**
     * Normaliza el metodo HTTP configurado para envios remotos.
     *
     * @param {string|undefined|null} value Metodo crudo.
     * @param {string} [fallback='POST'] Metodo por defecto.
     * @returns {string} Metodo en mayusculas.
     */
    const normalizeMethod = (value, fallback = 'POST') => {
        const method = String(value || fallback).trim().toUpperCase();
        return method || fallback;
    };

    const kebabToCamelCase = (value) => {
        return String(value || '').replace(/-([a-z0-9])/g, function (_match, chr) {
            return chr.toUpperCase();
        });
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
                NotificationPush.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    /**
     * Inyecta estilos base del toast solo una vez por documento.
     *
     * @returns {void}
     */
    const ensureToastStyles = () => {
        if (document.getElementById(STYLE_TAG_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_TAG_ID;
        style.textContent = ''
            + '#'+ TOAST_CONTAINER_ID +' { position: fixed; top: 16px; right: 16px; width: min(360px, calc(100vw - 32px)); z-index: 99999; display: grid; gap: 10px; pointer-events: none; }'
            + '.np-toast { pointer-events: auto; position: relative; border-radius: 10px; border: 1px solid #d7deeb; background: #ffffff; color: #1b263b; box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14); padding: 10px 36px 10px 12px; display: grid; gap: 6px; animation: np-toast-in .2s ease-out; }'
            + '.np-toast__top { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; }'
            + '.np-toast__image { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; }'
            + '.np-toast__title { font-weight: 700; font-size: 0.92rem; margin: 0; }'
            + '.np-toast__close { position: absolute; top: 8px; right: 8px; border: 0; background: transparent; cursor: pointer; font-size: 14px; color: #5b6471; line-height: 1; }'
            + '.np-toast__message { margin: 0; font-size: 0.86rem; color: #475569; }'
            + '.np-toast--success { border-left: 4px solid #18a957; }'
            + '.np-toast--info { border-left: 4px solid #228be6; }'
            + '.np-toast--warning { border-left: 4px solid #d98400; }'
            + '.np-toast--error { border-left: 4px solid #d90429; }'
            + '@keyframes np-toast-in { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }';

        document.head.appendChild(style);
    };

    const ensureToastContainer = (extraClassName) => {
        let container = document.getElementById(TOAST_CONTAINER_ID);
        const desiredClasses = splitClassTokens(extraClassName);

        if (!container) {
            container = document.createElement('div');
            container.id = TOAST_CONTAINER_ID;
            document.body.appendChild(container);
        }

        const previousClasses = splitClassTokens(container.getAttribute('data-np-managed-container-classes') || '');

        previousClasses.forEach((className) => {
            if (!desiredClasses.includes(className)) {
                container.classList.remove(className);
            }
        });

        desiredClasses.forEach((className) => {
            container.classList.add(className);
        });

        container.setAttribute('data-np-managed-container-classes', desiredClasses.join(' '));
        return container;
    };

    const parseHeadersJson = (value) => {
        if (!value || typeof value !== 'string') return null;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_error) {
            return null;
        }
    };

    const getOptionsFromData = (element) => {
        const options = {}
            , showToast = parseBoolean(element.dataset.npShowToast)
            , sendRequest = parseBoolean(element.dataset.npSend)
            , injectDefaultStyles = parseBoolean(element.dataset.npInjectStyles)
            , parsedDuration = parseNumber(element.dataset.npDuration, 0)
            , headersFromJson = parseHeadersJson(element.dataset.npHeadersJson);

        const setTrimmedOption = (key, value, transform) => {
            if (typeof value !== 'string') return;
            const trimmedValue = value.trim();
            if (!trimmedValue) return;
            options[key] = typeof transform === 'function' ? transform(trimmedValue) : trimmedValue;
        };

        showToast !== undefined && (options.showToast = showToast);
        sendRequest !== undefined && (options.sendRequest = sendRequest);
        injectDefaultStyles !== undefined && (options.injectDefaultStyles = injectDefaultStyles);
        parsedDuration > 0 && (options.defaultDuration = parsedDuration);

        setTrimmedOption('defaultType', element.dataset.npType, (value) => normalizeType(value, NOTIFICATION_PUSH_DEFAULTS.defaultType));
        setTrimmedOption('requestMethod', element.dataset.npMethod, (value) => normalizeMethod(value, NOTIFICATION_PUSH_DEFAULTS.requestMethod));
        setTrimmedOption('endpoint', element.dataset.npEndpoint);
        setTrimmedOption('credentials', element.dataset.npCredentials);
        setTrimmedOption('toastClass', element.dataset.npToastClass);
        setTrimmedOption('toastContainerClass', element.dataset.npToastContainerClass);

        headersFromJson && (options.headers = headersFromJson);

        return options;
    };

    const getDynamicNamePayload = (element) => {
        const payload = {};

        Array.from(element.attributes).forEach((attribute) => {
            if (!attribute || typeof attribute.name !== 'string') return;

            const attrName = attribute.name.toLowerCase();
            if (!attrName.startsWith('data-np-name-')) return;

            const rawKey = attrName.slice('data-np-name-'.length)
                , key = kebabToCamelCase(rawKey);

            if (!key) return;
            payload[key] = attribute.value;
        });

        return payload;
    };

    /**
     * Opciones publicas para controlar render de toast y envio remoto opcional.
     * @typedef {Object} NotificationPushOptions
     * @property {'success'|'info'|'warning'|'error'} [defaultType='success'] Tipo de toast por defecto.
     * @property {number} [defaultDuration=4200] Duracion por defecto del toast en ms.
     * @property {boolean} [showToast=true] Muestra toast visual por cada push.
     * @property {boolean} [injectDefaultStyles=true] Inyecta estilos CSS base del plugin.
     * @property {string} [toastClass=''] Clases extra para cada toast.
     * @property {string} [toastContainerClass=''] Clases extra para contenedor global de toasts.
     * @property {boolean} [sendRequest=false] Habilita envio opcional al backend.
     * @property {string} [requestMethod='POST'] Metodo HTTP para envio.
     * @property {string} [endpoint=''] Endpoint para envio.
     * @property {Object<string,string>} [headers] Headers para envio HTTP.
     * @property {'same-origin'|'include'|'omit'} [credentials='same-origin'] Credenciales fetch.
     * @property {(payload:Object, trigger:HTMLElement)=>void} [onBeforePush] Hook previo al push.
     * @property {(payload:Object, trigger:HTMLElement)=>void} [onShown] Hook al mostrar toast.
     * @property {(payload:Object, response:Response, trigger:HTMLElement)=>void} [onSent] Hook de envio exitoso.
     * @property {(error:Error, payload:Object, trigger:HTMLElement)=>void} [onError] Hook de error.
     */

    /**
     * Plugin para disparar notificaciones tipo toast y propagar payloads por atributos data-*.
     *
     * Flujo resumido:
     * 1. Construye payload desde atributos y metadatos del trigger.
     * 2. Emite `before.plugin.notificationPush` (cancelable).
     * 3. Proyecta datos en receptor, muestra toast y envia request opcional.
     * 4. Emite eventos finales de shown/sent/error segun resultado.
     *
     * Capacidades principales:
     * - Construccion de payload dinamico por `data-np-name-*`.
     * - Envio de payload a un receptor del DOM (`data-np-target`).
     * - Render de toast configurable (estilo interno o custom).
     * - Envio opcional al backend via fetch sin cache local.
     *
     * @fires before.plugin.notificationPush
     * @fires shown.plugin.notificationPush
     * @fires sent.plugin.notificationPush
     * @fires error.plugin.notificationPush
     */
    class NotificationPush {
        /**
         * Crea una instancia para disparar notificaciones desde un trigger del DOM.
         * @param {HTMLElement} element Trigger del push (boton, enlace, etc.).
         * @param {NotificationPushOptions} options Opciones de configuración de la instancia.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = { ...NOTIFICATION_PUSH_DEFAULTS, ...options };
            this.isBound = false;
            this.handleClick = this.handleClick.bind(this);
        }

        /**
         * Construye payload final combinando datos fijos y dinamicos del trigger.
         * @returns {Object}
         */
        buildPayload() {
            const dynamicPayload = getDynamicNamePayload(this.subject)
                , title = this.subject.dataset.npTitle || 'Notification'
                , message = this.subject.dataset.npMessage || this.subject.textContent.trim() || 'Action completed'
                , type = normalizeType(this.subject.dataset.npType, this.options.defaultType)
                , duration = Math.max(600, parseNumber(this.subject.dataset.npDuration, this.options.defaultDuration));

            return {
                title,
                message,
                type,
                duration,
                image: this.subject.dataset.npImage || '',
                productId: this.subject.dataset.npProductId || '',
                sku: this.subject.dataset.npSku || '',
                name: this.subject.dataset.npName || '',
                price: this.subject.dataset.npPrice || '',
                qty: this.subject.dataset.npQty || '',
                triggerText: this.subject.textContent.trim(),
                timestamp: new Date().toISOString(),
                ...dynamicPayload,
            };
        }

        /**
         * Resuelve elemento receptor configurado en `data-np-target`.
         * @returns {Element|null}
         */
        resolveReceiver() {
            const selector = this.subject.dataset.npTarget;
            if (!selector || typeof selector !== 'string') return null;

            try {
                return document.querySelector(selector);
            } catch (_error) {
                return null;
            }
        }

        /**
         * Proyecta valores del payload sobre el receptor y campos referenciados por `data-np-field`.
         * @param {Element} receiver Nodo receptor objetivo.
         * @param {Object} payload Payload generado para el push.
         * @returns {void}
         */
        applyReceiverFields(receiver, payload) {
            if (!(receiver instanceof Element)) return;

            receiver.dataset.npPayload = JSON.stringify(payload);

            const format = (receiver.getAttribute('data-np-receiver-format') || '').trim().toLowerCase();
            if (format === 'json') {
                receiver.textContent = JSON.stringify(payload, null, 2);
            }

            const scopedSelector = (receiver.getAttribute('data-np-field-root') || '').trim();
            let fieldRoot = receiver.parentElement || document;

            if (scopedSelector) {
                try {
                    fieldRoot = document.querySelector(scopedSelector) || fieldRoot;
                } catch (_error) {
                    fieldRoot = receiver.parentElement || document;
                }
            }

            const fieldNodes = fieldRoot.querySelectorAll('[data-np-field]');
            fieldNodes.forEach((node) => {
                const key = node.getAttribute('data-np-field');
                if (!key) return;
                const value = payload[key];
                node.textContent = value == null ? '' : String(value);
            });

            receiver.dispatchEvent(new CustomEvent('push.plugin.notificationPush', {
                detail: {
                    payload,
                    trigger: this.subject,
                    receiver,
                },
            }));
        }

        /**
         * Renderiza toast visual con configuracion actual de estilos y clases.
         * @param {Object} payload Payload del push.
         * @returns {void}
         */
        showToast(payload) {
            if (this.options.injectDefaultStyles !== false) {
                ensureToastStyles();
            }

            const container = ensureToastContainer(this.options.toastContainerClass)
                , toast = document.createElement('article')
                , imageHtml = payload.image
                    ? '<img class="np-toast__image" src="' + payload.image + '" alt="" />'
                    : '';

            toast.className = ['np-toast', 'np-toast--' + payload.type]
                .concat(splitClassTokens(this.options.toastClass))
                .join(' ');
            toast.innerHTML = ''
                + '<div class="np-toast__top">'
                + imageHtml
                + '<p class="np-toast__title">' + payload.title + '</p>'
                + '<button type="button" class="np-toast__close" aria-label="Close">x</button>'
                + '</div>'
                + '<p class="np-toast__message">' + payload.message + '</p>';

            const closeButton = toast.querySelector('.np-toast__close')
                , close = () => {
                    if (!toast.isConnected) return;
                    toast.remove();
                };

            if (closeButton instanceof HTMLButtonElement) {
                closeButton.addEventListener('click', close);
            }

            container.appendChild(toast);
            window.setTimeout(close, payload.duration);

            this.options.onShown && this.options.onShown(payload, this.subject);
            this.subject.dispatchEvent(new CustomEvent('shown.plugin.notificationPush', {
                detail: {
                    payload,
                    trigger: this.subject,
                },
            }));
        }

        /**
         * Envia payload al backend cuando la configuracion lo habilita.
         * @param {Object} payload Payload del push.
         * @returns {Promise<void>}
         */
        async sendPayload(payload) {
            const endpoint = this.subject.dataset.npEndpoint || this.options.endpoint
                , sendEnabled = parseBoolean(this.subject.dataset.npSend);

            if (!endpoint || (sendEnabled === false) || (!sendEnabled && this.options.sendRequest !== true)) {
                return;
            }

            const method = normalizeMethod(this.subject.dataset.npMethod, this.options.requestMethod)
                , headersFromJson = parseHeadersJson(this.subject.dataset.npHeadersJson)
                , headers = {
                    ...this.options.headers,
                    ...(headersFromJson || {}),
                }
                , requestInit = {
                    method,
                    headers,
                    cache: 'no-store',
                    credentials: this.subject.dataset.npCredentials || this.options.credentials,
                };

            if (method !== 'GET' && method !== 'HEAD') {
                requestInit.body = JSON.stringify(payload);
            }

            const response = await fetch(endpoint, requestInit);
            if (!response.ok) {
                throw new Error('Error: NotificationPush fallo al enviar datos. Estado ' + response.status + '.');
            }

            this.options.onSent && this.options.onSent(payload, response, this.subject);
            this.subject.dispatchEvent(new CustomEvent('sent.plugin.notificationPush', {
                detail: {
                    payload,
                    response,
                    trigger: this.subject,
                },
            }));
        }

        /**
         * Ejecuta el flujo completo de push: hooks, receptor, toast y envio.
         *
         * Si `before.plugin.notificationPush` es cancelado, el flujo no continua.
         *
         * @returns {Promise<void>}
         */
        async run() {
            const payload = this.buildPayload()
                , beforeEvent = new CustomEvent('before.plugin.notificationPush', {
                    cancelable: true,
                    detail: {
                        payload,
                        trigger: this.subject,
                    },
                });

            this.options.onBeforePush && this.options.onBeforePush(payload, this.subject);
            if (!this.subject.dispatchEvent(beforeEvent)) return;

            const receiver = this.resolveReceiver();
            if (receiver) {
                this.applyReceiverFields(receiver, payload);
            }

            if (this.options.showToast) {
                this.showToast(payload);
            }

            try {
                await this.sendPayload(payload);
            } catch (error) {
                this.options.onError && this.options.onError(error, payload, this.subject);
                this.subject.dispatchEvent(new CustomEvent('error.plugin.notificationPush', {
                    detail: {
                        error,
                        payload,
                        trigger: this.subject,
                    },
                }));
            }
        }

        /**
         * Handler de click del trigger.
         * @param {MouseEvent} evt Evento click.
         * @returns {void}
         */
        handleClick(evt) {
            if (this.subject instanceof HTMLAnchorElement) {
                evt.preventDefault();
            }
            this.run();
        }

        /**
         * Vincula listeners de la instancia.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;
            this.applyListeners('addEventListener');
            this.isBound = true;
        }

        /**
         * Desvincula listeners de la instancia.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;
            this.applyListeners('removeEventListener');
            this.isBound = false;
        }

        /**
         * Define listeners activos de la instancia.
         * @returns {Array<[string, EventListenerOrEventListenerObject, (boolean|undefined)]>}
         */
        getListeners() {
            return [
                ['click', this.handleClick],
            ];
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
         * Libera recursos de instancia y elimina su registro interno.
         * @returns {void}
         */
        destroy() {
            this.unbind();
            INSTANCES.delete(this.subject);
        }

        /**
         * Inicializa o reutiliza instancia para un trigger.
         * @param {HTMLElement} element Trigger objetivo.
         * @param {NotificationPushOptions} [options={}] Opciones de configuración de la instancia.
         * @returns {NotificationPush}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: NotificationPush.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) return currentInstance;

            const mergedOptions = { ...getOptionsFromData(element), ...options }
                , instance = new NotificationPush(element, mergedOptions);

            INSTANCES.set(element, instance);
            instance.bind();
            return instance;
        }

        /**
         * Recupera instancia registrada para un trigger.
         * @param {HTMLElement} element Trigger objetivo.
         * @returns {NotificationPush|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * Destruye instancia registrada para un trigger.
         * @param {HTMLElement} element Trigger objetivo.
         * @returns {void}
         */
        static destroy(element) {
            if (!(element instanceof HTMLElement)) return;
            const instance = INSTANCES.get(element);
            if (!instance) return;
            instance.destroy();
        }

        /**
         * Inicializa todas las coincidencias dentro de un nodo raiz.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz de busqueda.
         * @returns {NotificationPush[]}
         */
        static initAll(root = document) {
            return getSubjects(root).map((subject) => NotificationPush.init(subject));
        }

        /**
         * Destruye todas las coincidencias dentro de un nodo raiz.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz de busqueda.
         * @returns {void}
         */
        static destroyAll(root = document) {
            getSubjects(root).forEach((subject) => NotificationPush.destroy(subject));
        }
    }

    window.NotificationPush = NotificationPush;

    /**
     * Inicializa automaticamente todas las instancias presentes en el documento.
     *
     * @returns {void}
     */
    const bootstrap = () => {
        NotificationPush.initAll(document);
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
                NotificationPush.initAll(node);
            });

            mutation.removedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                scheduleRemovalCheck(node);
            });
        });
    });

        const observeGlobal = (document.documentElement.getAttribute('data-pp-observe-global') || '').trim().toLowerCase();
        if (!['false', '0', 'off', 'no'].includes(observeGlobal)) {
            const observeRootSelector = (document.documentElement.getAttribute('data-pp-observe-root') || '').trim();
            const observeRootElement = document.querySelector('[data-pp-observe-root-notification-push]');
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
                subtree: true
            });
        }
})();
