/**
 * @fileoverview Plugin nativo para gestionar estados de request (idle/loading/success/error) por data-*.
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @module RequestState
 */
(function () {
    'use strict';

    const SELECTOR_SUBJECT = '[data-request-state]'
        , INSTANCES = new WeakMap()
        , PENDING_REMOVALS = new Set()
        , STATE_IDLE = 'idle'
        , STATE_LOADING = 'loading'
        , STATE_SUCCESS = 'success'
        , STATE_ERROR = 'error';

    const REQUEST_STATE_DEFAULTS = Object.freeze({
        delayMs: 600,
        autoResetMs: 0,
        retryCount: 0,
        retryDelayMs: 350,
        retryStatuses: [408, 429, 500, 502, 503, 504],
        disableOnLoading: true,
        sendRequest: false,
        endpoint: '',
        method: 'GET',
        timeoutMs: 12000,
        credentials: 'same-origin',
        headers: {
            'X-Requested-With': 'RequestState',
        },
        loadingClass: 'is-loading',
        successClass: 'is-success',
        errorClass: 'is-error',
        idleClass: 'is-idle',
        loadingText: 'Procesando...',
        successText: 'Completado.',
        errorText: 'Ocurrio un error.',
        responseTarget: '',
        responseMode: 'auto',
        mockResult: '',
        onBefore: function () { },
        onStateChange: function () { },
        onSuccess: function () { },
        onError: function () { },
        onComplete: function () { },
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

    const parseStatusCodes = (value) => {
        if (!value || typeof value !== 'string') return null;
        const codes = value
            .split(',')
            .map((item) => parseInt(item.trim(), 10))
            .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599);
        return codes.length > 0 ? codes : null;
    };

    const normalizeMethod = (value, fallback = 'GET') => {
        const method = String(value || fallback).trim().toUpperCase();
        return method || fallback;
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

    const parsePayloadJson = (value) => {
        if (!value || typeof value !== 'string') return null;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_error) {
            return null;
        }
    };

    const wait = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    };

    const formDataToObject = (formData) => {
        const result = {};

        formData.forEach((value, key) => {
            const normalizedValue = value instanceof File
                ? value
                : String(value);

            if (Object.prototype.hasOwnProperty.call(result, key)) {
                const current = result[key];
                if (Array.isArray(current)) {
                    current.push(normalizedValue);
                } else {
                    result[key] = [current, normalizedValue];
                }
                return;
            }

            result[key] = normalizedValue;
        });

        return result;
    };

    const appendObjectToSearchParams = (params, payload, keyPrefix = '') => {
        if (!payload || typeof payload !== 'object') return;

        Object.keys(payload).forEach((key) => {
            const rawValue = payload[key]
                , paramKey = keyPrefix ? (keyPrefix + '[' + key + ']') : key;

            if (rawValue == null) return;

            if (rawValue instanceof File) {
                params.append(paramKey, rawValue.name);
                return;
            }

            if (Array.isArray(rawValue)) {
                rawValue.forEach((item) => {
                    if (item == null) return;
                    params.append(paramKey, item instanceof File ? item.name : String(item));
                });
                return;
            }

            if (typeof rawValue === 'object') {
                appendObjectToSearchParams(params, rawValue, paramKey);
                return;
            }

            params.append(paramKey, String(rawValue));
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
                RequestState.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    const toDynamicPayload = (element) => {
        const payload = {};

        Array.from(element.attributes).forEach((attribute) => {
            if (!attribute || typeof attribute.name !== 'string') return;

            const attrName = attribute.name.toLowerCase();
            if (!attrName.startsWith('data-rs-name-')) return;

            const rawKey = attrName.slice('data-rs-name-'.length)
                , key = rawKey.replace(/-([a-z0-9])/g, function (_match, chr) {
                    return chr.toUpperCase();
                });

            if (!key) return;
            payload[key] = attribute.value;
        });

        return payload;
    };

    const getOptionsFromData = (element) => {
        const options = {}
            , disableOnLoading = parseBoolean(element.dataset.rsDisableOnLoading)
            , sendRequest = parseBoolean(element.dataset.rsSend)
            , parsedDelay = parseNumber(element.dataset.rsDelay, REQUEST_STATE_DEFAULTS.delayMs)
            , parsedAutoReset = parseNumber(element.dataset.rsAutoReset, REQUEST_STATE_DEFAULTS.autoResetMs)
            , parsedTimeout = parseNumber(element.dataset.rsTimeout, REQUEST_STATE_DEFAULTS.timeoutMs)
            , parsedRetryCount = parseNumber(element.dataset.rsRetryCount, REQUEST_STATE_DEFAULTS.retryCount)
            , parsedRetryDelay = parseNumber(element.dataset.rsRetryDelay, REQUEST_STATE_DEFAULTS.retryDelayMs)
            , retryStatuses = parseStatusCodes(element.dataset.rsRetryStatuses)
            , headersFromJson = parseHeadersJson(element.dataset.rsHeadersJson);

        if (disableOnLoading !== undefined) options.disableOnLoading = disableOnLoading;
        if (sendRequest !== undefined) options.sendRequest = sendRequest;
        if (parsedDelay >= 0) options.delayMs = parsedDelay;
        if (parsedAutoReset >= 0) options.autoResetMs = parsedAutoReset;
        if (parsedTimeout >= 0) options.timeoutMs = parsedTimeout;
        if (parsedRetryCount >= 0) options.retryCount = Math.floor(parsedRetryCount);
        if (parsedRetryDelay >= 0) options.retryDelayMs = parsedRetryDelay;
        if (retryStatuses) options.retryStatuses = retryStatuses;

        if (typeof element.dataset.rsEndpoint === 'string' && element.dataset.rsEndpoint.trim()) {
            options.endpoint = element.dataset.rsEndpoint.trim();
        }

        if (typeof element.dataset.rsMethod === 'string' && element.dataset.rsMethod.trim()) {
            options.method = normalizeMethod(element.dataset.rsMethod, REQUEST_STATE_DEFAULTS.method);
        }

        if (typeof element.dataset.rsCredentials === 'string' && element.dataset.rsCredentials.trim()) {
            options.credentials = element.dataset.rsCredentials.trim();
        }

        if (typeof element.dataset.rsLoadingClass === 'string' && element.dataset.rsLoadingClass.trim()) {
            options.loadingClass = element.dataset.rsLoadingClass.trim();
        }

        if (typeof element.dataset.rsSuccessClass === 'string' && element.dataset.rsSuccessClass.trim()) {
            options.successClass = element.dataset.rsSuccessClass.trim();
        }

        if (typeof element.dataset.rsErrorClass === 'string' && element.dataset.rsErrorClass.trim()) {
            options.errorClass = element.dataset.rsErrorClass.trim();
        }

        if (typeof element.dataset.rsIdleClass === 'string' && element.dataset.rsIdleClass.trim()) {
            options.idleClass = element.dataset.rsIdleClass.trim();
        }

        if (typeof element.dataset.rsLoadingText === 'string' && element.dataset.rsLoadingText.trim()) {
            options.loadingText = element.dataset.rsLoadingText.trim();
        }

        if (typeof element.dataset.rsSuccessText === 'string' && element.dataset.rsSuccessText.trim()) {
            options.successText = element.dataset.rsSuccessText.trim();
        }

        if (typeof element.dataset.rsErrorText === 'string' && element.dataset.rsErrorText.trim()) {
            options.errorText = element.dataset.rsErrorText.trim();
        }

        if (typeof element.dataset.rsResponseTarget === 'string' && element.dataset.rsResponseTarget.trim()) {
            options.responseTarget = element.dataset.rsResponseTarget.trim();
        }

        if (typeof element.dataset.rsResponseMode === 'string' && element.dataset.rsResponseMode.trim()) {
            options.responseMode = element.dataset.rsResponseMode.trim().toLowerCase();
        }

        if (typeof element.dataset.rsMock === 'string' && element.dataset.rsMock.trim()) {
            options.mockResult = element.dataset.rsMock.trim().toLowerCase();
        }

        if (headersFromJson) {
            options.headers = headersFromJson;
        }

        return options;
    };

    /**
     * @typedef {Object} RequestStateOptions
     * @property {number} [delayMs=600] Retardo base en ms para simulaciones o transiciones.
     * @property {number} [autoResetMs=0] Si es mayor a 0, vuelve a `idle` tras ese tiempo.
     * @property {number} [retryCount=0] Reintentos ante errores transitorios.
     * @property {number} [retryDelayMs=350] Espera entre reintentos en ms.
     * @property {number[]} [retryStatuses=[408,429,500,502,503,504]] Codigos HTTP para reintentar.
     * @property {boolean} [disableOnLoading=true] Deshabilita trigger durante `loading`.
     * @property {boolean} [sendRequest=false] Habilita request real por fetch.
     * @property {string} [endpoint=''] URL para request real.
     * @property {string} [method='GET'] Metodo HTTP.
     * @property {number} [timeoutMs=12000] Timeout de request.
     * @property {'same-origin'|'include'|'omit'} [credentials='same-origin'] Credenciales fetch.
     * @property {Object<string,string>} [headers] Headers HTTP.
     * @property {string} [loadingClass='is-loading'] Clase para estado loading.
     * @property {string} [successClass='is-success'] Clase para estado success.
     * @property {string} [errorClass='is-error'] Clase para estado error.
     * @property {string} [idleClass='is-idle'] Clase para estado idle.
     * @property {string} [loadingText='Procesando...'] Texto para loading.
     * @property {string} [successText='Completado.'] Texto para success.
     * @property {string} [errorText='Ocurrio un error.'] Texto para error.
     * @property {string} [responseTarget=''] Selector para renderizar respuesta.
     * @property {'auto'|'text'|'json'|'html'} [responseMode='auto'] Modo de render de respuesta.
     * @property {'success'|'error'|''} [mockResult=''] Simula resultado sin backend.
     * @property {(ctx:Object)=>void} [onBefore] Hook antes de iniciar flujo.
     * @property {(state:string, ctx:Object)=>void} [onStateChange] Hook al cambiar estado.
     * @property {(ctx:Object)=>void} [onSuccess] Hook en exito.
     * @property {(ctx:Object)=>void} [onError] Hook en error.
     * @property {(ctx:Object)=>void} [onComplete] Hook final del ciclo.
     */

    /**
     * Plugin para manejar estados visuales de acciones async en botones/enlaces.
     *
     * Estados soportados: `idle`, `loading`, `success`, `error`.
     * Tambien permite simulacion para QA (`data-rs-mock`) y request real opcional (`data-rs-send`).
     */
    class RequestState {
        /**
         * @param {HTMLElement} element Trigger del flujo de estado.
         * @param {RequestStateOptions} options Opciones de inicializacion.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = { ...REQUEST_STATE_DEFAULTS, ...options };
            this.isBound = false;
            this.isRunning = false;
            this.state = STATE_IDLE;
            this.resetTimer = null;
            this.abortController = null;
            this.lastSubmitter = null;
            this.handleSubmit = this.handleSubmit.bind(this);
            this.run = this.run.bind(this);
        }

        /**
         * @returns {boolean}
         */
        get isFormSubject() {
            return this.subject instanceof HTMLFormElement;
        }

        /**
         * Busca objetivo de estado segun `data-rs-target`; fallback al propio trigger.
         * @returns {HTMLElement}
         */
        get targetElement() {
            const selector = this.subject.dataset.rsTarget;
            if (!selector || typeof selector !== 'string') {
                return this.subject;
            }

            try {
                const target = document.querySelector(selector);
                return target instanceof HTMLElement ? target : this.subject;
            } catch (_error) {
                return this.subject;
            }
        }

        /**
         * Resuelve nodo donde se escribe mensaje de estado.
         * @param {HTMLElement} target Objetivo principal de estado.
         * @returns {HTMLElement|null}
         */
        getMessageElement(target) {
            const customSelector = this.subject.dataset.rsMessageTarget;
            if (customSelector && typeof customSelector === 'string') {
                try {
                    const customNode = document.querySelector(customSelector);
                    if (customNode instanceof HTMLElement) return customNode;
                } catch (_error) {
                    return null;
                }
            }

            const node = target.querySelector('[data-rs-message]');
            return node instanceof HTMLElement ? node : null;
        }

        /**
         * Resuelve nodo donde renderizar respuesta (`data-rs-response-target` o `[data-rs-response]`).
         * @param {HTMLElement} target Objetivo principal de estado.
         * @returns {HTMLElement|null}
         */
        getResponseElement(target) {
            const customSelector = this.subject.dataset.rsResponseTarget || this.options.responseTarget;
            if (customSelector && typeof customSelector === 'string') {
                try {
                    const customNode = document.querySelector(customSelector);
                    if (customNode instanceof HTMLElement) return customNode;
                } catch (_error) {
                    return null;
                }
            }

            const node = target.querySelector('[data-rs-response]');
            return node instanceof HTMLElement ? node : null;
        }

        /**
         * Activa/desactiva interaccion durante loading para evitar multiples envios.
         * @param {boolean} shouldDisable Indica si debe deshabilitar.
         * @returns {void}
         */
        setInteractiveDisabled(shouldDisable) {
            if ('disabled' in this.subject) {
                this.subject.disabled = shouldDisable;
            }

            this.subject.setAttribute('aria-disabled', String(shouldDisable));

            if (!this.isFormSubject) {
                return;
            }

            const submitControls = Array.from(this.subject.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])'));

            if (this.lastSubmitter && this.lastSubmitter instanceof HTMLElement && !submitControls.includes(this.lastSubmitter)) {
                submitControls.push(this.lastSubmitter);
            }

            submitControls.forEach((control) => {
                if (!control || !(control instanceof HTMLElement)) return;

                if (shouldDisable) {
                    const wasDisabled = 'disabled' in control && control.disabled;
                    control.setAttribute('data-rs-was-disabled', wasDisabled ? '1' : '0');
                    if ('disabled' in control) {
                        control.disabled = true;
                    }
                    control.setAttribute('aria-disabled', 'true');
                    return;
                }

                const wasDisabled = control.getAttribute('data-rs-was-disabled') === '1';
                if ('disabled' in control) {
                    control.disabled = wasDisabled;
                }
                control.setAttribute('aria-disabled', String(wasDisabled));
                control.removeAttribute('data-rs-was-disabled');
            });
        }

        /**
         * Renderiza respuesta o error en nodo objetivo segun `responseMode`.
         * @param {Object} context Contexto del ciclo actual.
         * @returns {void}
         */
        renderResponse(context) {
            const target = context.target instanceof HTMLElement ? context.target : this.targetElement
                , responseNode = this.getResponseElement(target);

            if (!responseNode) return;

            const responseModeRaw = this.subject.dataset.rsResponseMode || this.options.responseMode || 'auto'
                , responseMode = String(responseModeRaw).trim().toLowerCase()
                , responseData = context.response ? context.response.data : null
                , errorMessage = context.error && context.error.message ? context.error.message : '';

            if (this.state === STATE_LOADING) {
                responseNode.textContent = '';
                return;
            }

            const renderText = (value) => {
                responseNode.textContent = value == null ? '' : String(value);
            };

            const renderJson = (value) => {
                const safeValue = value == null
                    ? {}
                    : value;
                responseNode.textContent = JSON.stringify(safeValue, null, 2);
            };

            if (this.state === STATE_ERROR) {
                renderText(errorMessage || (this.subject.dataset.rsErrorText || this.options.errorText));
                return;
            }

            if (responseMode === 'html') {
                if (typeof responseData === 'string') {
                    responseNode.innerHTML = responseData;
                } else {
                    renderText(responseData == null ? '' : String(responseData));
                }
                return;
            }

            if (responseMode === 'json') {
                renderJson(responseData);
                return;
            }

            if (responseMode === 'text') {
                renderText(responseData == null ? '' : responseData);
                return;
            }

            if (typeof responseData === 'string') {
                renderText(responseData);
                return;
            }

            renderJson(responseData);
        }

        /**
         * Construye payload base desde data-* dinamico y, en formularios, incluye FormData.
         * @returns {Object}
         */
        buildPayload() {
            const basePayload = {
                ...toDynamicPayload(this.subject),
                triggerText: this.subject.textContent.trim(),
                timestamp: new Date().toISOString(),
                ...(parsePayloadJson(this.subject.dataset.rsPayloadJson) || {}),
            };

            if (!this.isFormSubject) {
                return basePayload;
            }

            const formData = new FormData(this.subject)
                , formPayload = formDataToObject(formData);

            return {
                ...basePayload,
                ...formPayload,
            };
        }

        /**
         * Construye URL final anexando query params para GET/HEAD.
         * @param {string} endpoint URL base.
         * @param {string} method Metodo HTTP.
         * @param {Object} payload Payload del request.
         * @returns {string}
         */
        buildRequestUrl(endpoint, method, payload) {
            if (!endpoint) return endpoint;
            if (!['GET', 'HEAD'].includes(method)) return endpoint;

            const url = new URL(endpoint, window.location.href);
            appendObjectToSearchParams(url.searchParams, payload);
            return url.toString();
        }

        /**
         * Aplica clases/atributos segun estado y actualiza texto.
         * @param {'idle'|'loading'|'success'|'error'} nextState Nuevo estado.
         * @param {Object} context Contexto de ejecucion.
         * @returns {void}
         */
        setState(nextState, context) {
            const target = this.targetElement
                , classMap = {
                    idle: this.options.idleClass,
                    loading: this.options.loadingClass,
                    success: this.options.successClass,
                    error: this.options.errorClass,
                }
                , messageMap = {
                    loading: this.subject.dataset.rsLoadingText || this.options.loadingText,
                    success: this.subject.dataset.rsSuccessText || this.options.successText,
                    error: this.subject.dataset.rsErrorText || this.options.errorText,
                    idle: '',
                };

            [this.subject, target].forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                Object.values(classMap).forEach((className) => {
                    if (className) node.classList.remove(className);
                });

                const nextClass = classMap[nextState];
                if (nextClass) node.classList.add(nextClass);
                node.setAttribute('data-rs-state', nextState);
                node.setAttribute('aria-busy', String(nextState === STATE_LOADING));
            });

            const messageNode = this.getMessageElement(target);
            if (messageNode) {
                messageNode.textContent = messageMap[nextState] || '';
            }

            if (this.options.disableOnLoading) {
                const shouldDisable = nextState !== STATE_IDLE;
                this.setInteractiveDisabled(shouldDisable);
            }

            this.state = nextState;
            this.options.onStateChange && this.options.onStateChange(nextState, context);
            this.subject.dispatchEvent(new CustomEvent('state.plugin.requestState', {
                detail: {
                    state: nextState,
                    context,
                    trigger: this.subject,
                    target,
                },
            }));
        }

        /**
         * Ejecuta request real si `sendRequest` y endpoint estan configurados.
         * @param {Object} payload Payload a enviar (cuando aplique).
         * @returns {Promise<{ok:boolean,status:number,data:any}>}
         */
        async executeRequest(payload) {
            const endpoint = this.subject.dataset.rsEndpoint || this.options.endpoint
                , sendEnabled = parseBoolean(this.subject.dataset.rsSend)
                , shouldSend = (sendEnabled === true) || (sendEnabled !== false && this.options.sendRequest === true);

            if (!endpoint || !shouldSend) {
                return { ok: true, status: 200, data: null };
            }

            const method = normalizeMethod(this.subject.dataset.rsMethod, this.options.method)
                , headersFromJson = parseHeadersJson(this.subject.dataset.rsHeadersJson)
                , mergedHeaders = {
                    ...this.options.headers,
                    ...(headersFromJson || {}),
                }
                , timeoutMs = Math.max(0, parseNumber(this.subject.dataset.rsTimeout, this.options.timeoutMs))
                , retryCount = Math.max(0, Math.floor(parseNumber(this.subject.dataset.rsRetryCount, this.options.retryCount)))
                , retryDelayMs = Math.max(0, parseNumber(this.subject.dataset.rsRetryDelay, this.options.retryDelayMs))
                , retryStatuses = parseStatusCodes(this.subject.dataset.rsRetryStatuses) || this.options.retryStatuses;

            let attempt = 0;
            while (attempt <= retryCount) {
                const controller = new AbortController()
                    , requestUrl = this.buildRequestUrl(endpoint, method, payload)
                    , requestInit = {
                        method,
                        headers: mergedHeaders,
                        credentials: this.subject.dataset.rsCredentials || this.options.credentials,
                        cache: 'no-store',
                        signal: controller.signal,
                    };

                this.abortController = controller;

                let timeoutId = null;
                if (timeoutMs > 0) {
                    timeoutId = window.setTimeout(() => {
                        controller.abort();
                    }, timeoutMs);
                }

                try {
                    if (method !== 'GET' && method !== 'HEAD') {
                        requestInit.body = JSON.stringify(payload);
                    }

                    const response = await fetch(requestUrl, requestInit)
                        , contentType = response.headers.get('Content-Type') || ''
                        , isJson = contentType.toLowerCase().includes('json')
                        , data = isJson
                            ? await response.json().catch(() => null)
                            : await response.text().catch(() => '');

                    if (!response.ok) {
                        const statusError = new Error('Error: RequestState recibio estado HTTP ' + response.status + '.');
                        statusError.status = response.status;
                        throw statusError;
                    }

                    return {
                        ok: true,
                        status: response.status,
                        data,
                        attempt,
                    };
                } catch (error) {
                    const status = Number(error && error.status)
                        , shouldRetryByStatus = Number.isInteger(status) && retryStatuses.includes(status)
                        , shouldRetryByNetwork = !Number.isInteger(status) && error && error.name !== 'AbortError'
                        , canRetry = attempt < retryCount;

                    if (!canRetry || (!shouldRetryByStatus && !shouldRetryByNetwork)) {
                        throw error;
                    }

                    await wait(retryDelayMs);
                } finally {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    this.abortController = null;
                }

                attempt += 1;
            }

            throw new Error('Error: RequestState no pudo completar la solicitud.');
        }

        /**
         * Ejecuta el flujo principal del trigger.
         * @param {Event} [evt] Evento de click asociado.
         * @returns {Promise<void>}
         */
        async run(evt) {
            if (evt && this.subject instanceof HTMLAnchorElement) {
                evt.preventDefault();
            }

            if (evt && this.isFormSubject) {
                evt.preventDefault();
            }

            if (this.state !== STATE_IDLE || this.isRunning) return;
            if (this.resetTimer) {
                clearTimeout(this.resetTimer);
                this.resetTimer = null;
            }

            if (this.isFormSubject && evt && 'submitter' in evt) {
                this.lastSubmitter = evt.submitter || null;
            }

            const payload = this.buildPayload()
                , context = {
                    payload,
                    trigger: this.subject,
                    target: this.targetElement,
                    response: null,
                    error: null,
                }
                , beforeEvent = new CustomEvent('before.plugin.requestState', {
                    cancelable: true,
                    detail: context,
                });

            this.options.onBefore && this.options.onBefore(context);
            if (!this.subject.dispatchEvent(beforeEvent)) return;

            this.isRunning = true;

            this.setState(STATE_LOADING, context);
            this.renderResponse(context);

            const forcedMock = (this.subject.dataset.rsMock || this.options.mockResult || '').toLowerCase()
                , delayMs = Math.max(0, parseNumber(this.subject.dataset.rsDelay, this.options.delayMs));

            try {
                await wait(delayMs);

                if (forcedMock === 'error') {
                    throw new Error('Error: mock de RequestState forzado a error.');
                }

                if (forcedMock === 'success') {
                    context.response = {
                        ok: true,
                        status: 200,
                        data: { mock: true },
                    };
                } else {
                    context.response = await this.executeRequest(payload);
                }

                this.setState(STATE_SUCCESS, context);
                this.renderResponse(context);
                this.options.onSuccess && this.options.onSuccess(context);
                this.subject.dispatchEvent(new CustomEvent('success.plugin.requestState', {
                    detail: context,
                }));
            } catch (error) {
                context.error = error;
                this.setState(STATE_ERROR, context);
                this.renderResponse(context);
                this.options.onError && this.options.onError(context);
                this.subject.dispatchEvent(new CustomEvent('error.plugin.requestState', {
                    detail: context,
                }));
            } finally {
                const autoResetMs = Math.max(0, parseNumber(this.subject.dataset.rsAutoReset, this.options.autoResetMs));
                if (autoResetMs > 0) {
                    this.resetTimer = window.setTimeout(() => {
                        this.setState(STATE_IDLE, context);
                        this.resetTimer = null;
                    }, autoResetMs);
                }

                this.options.onComplete && this.options.onComplete(context);
                this.subject.dispatchEvent(new CustomEvent('complete.plugin.requestState', {
                    detail: context,
                }));

                this.isRunning = false;
            }
        }

        /**
         * Vincula listener click del trigger.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;

            if (this.isFormSubject) {
                this.subject.addEventListener('submit', this.handleSubmit);
            } else {
                this.subject.addEventListener('click', this.run);
            }

            this.isBound = true;
            this.subject.setAttribute('data-rs-state', STATE_IDLE);
        }

        /**
         * Handler submit para formularios marcados con `data-request-state`.
         * @param {SubmitEvent} evt Evento submit.
         * @returns {void}
         */
        handleSubmit(evt) {
            evt.preventDefault();
            this.run(evt);
        }

        /**
         * Desvincula listeners y aborta request activa.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;

            if (this.isFormSubject) {
                this.subject.removeEventListener('submit', this.handleSubmit);
            } else {
                this.subject.removeEventListener('click', this.run);
            }

            if (this.abortController) {
                this.abortController.abort();
            }
            if (this.resetTimer) {
                clearTimeout(this.resetTimer);
                this.resetTimer = null;
            }
            this.isBound = false;
        }

        /**
         * Destruye instancia y limpia registro interno.
         * @returns {void}
         */
        destroy() {
            this.unbind();
            INSTANCES.delete(this.subject);
        }

        /**
         * Inicializa o reutiliza instancia para un trigger.
         * @param {HTMLElement} element Trigger objetivo.
         * @param {RequestStateOptions} [options={}] Opciones adicionales.
         * @returns {RequestState}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: RequestState.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) return currentInstance;

            const mergedOptions = { ...getOptionsFromData(element), ...options }
                , instance = new RequestState(element, mergedOptions);

            INSTANCES.set(element, instance);
            instance.bind();
            return instance;
        }

        /**
         * Obtiene instancia registrada para un trigger.
         * @param {HTMLElement} element Trigger objetivo.
         * @returns {RequestState|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * Destruye una instancia concreta.
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
         * Inicializa todas las coincidencias en un root.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz.
         * @returns {RequestState[]}
         */
        static initAll(root = document) {
            return getSubjects(root).map((subject) => RequestState.init(subject));
        }

        /**
         * Destruye todas las coincidencias en un root.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz.
         * @returns {void}
         */
        static destroyAll(root = document) {
            getSubjects(root).forEach((subject) => RequestState.destroy(subject));
        }
    }

    window.RequestState = RequestState;

    const bootstrap = () => {
        RequestState.initAll(document);
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
                RequestState.initAll(node);
            });

            mutation.removedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                scheduleRemovalCheck(node);
            });
        });
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
})();
