/**
 * @fileoverview Plugin nativo para sincronizar estado de controles UI con query params en la URL.
 * @module QuerySyncState
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @license MIT
 * @copyright (c) 2026 Samuel Montenegro
 */
(function () {
    'use strict';

    /**
     * Selector declarativo para controles sincronizados con query params.
     * @type {string}
     */
    const SELECTOR_SUBJECT = '[data-role="query-sync-state"]'
        /**
         * Registro de instancias por elemento.
         * @type {WeakMap<HTMLElement, QuerySyncState>}
         */
        , INSTANCES = new WeakMap()
        /**
         * Nodos removidos pendientes de limpieza diferida.
         * @type {Set<Element>}
         */
        , PENDING_REMOVALS = new Set()
        /**
         * Marcador sentinela para omitir update de URL en flujos internos.
         * @type {symbol}
         */
        , NO_UPDATE = Symbol('QSS_NO_UPDATE');

    /**
     * Defaults del plugin QuerySyncState.
     * @type {Object}
     */
    const QUERY_SYNC_STATE_DEFAULTS = Object.freeze({
        key: '',
        type: 'string',
        history: 'replace',
        debounceMs: 0,
        defaultRaw: undefined,
        defaultValue: undefined,
        omitDefault: false,
        resetPageKey: '',
        syncOnInit: true,
        trim: true,
        onBeforeSync: function () { },
        onSync: function () { },
        onError: function () { },
        onComplete: function () { },
    });

    /**
     * Normaliza booleanos declarativos.
     * @param {unknown} value Valor fuente.
     * @returns {boolean|undefined}
     */
    const parseBoolean = (value) => {
        if (value === undefined) return undefined;
        if (typeof value === 'boolean') return value;

        const normalized = String(value).trim().toLowerCase();
        if (['', 'true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        return undefined;
    };

    /**
     * Convierte valor numerico con fallback seguro.
     * @param {unknown} value Valor fuente.
     * @param {number} [fallback=0] Valor de respaldo.
     * @returns {number}
     */
    const parseNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    /**
     * Intenta parsear JSON sin lanzar excepciones.
     *
     * @param {string|undefined|null} value Cadena JSON candidata.
     * @returns {*|undefined} Valor parseado o `undefined` cuando falla/esta vacio.
     */
    const parseJsonSafe = (value) => {
        if (typeof value !== 'string' || !value.trim()) return undefined;
        try {
            return JSON.parse(value);
        } catch (_error) {
            return undefined;
        }
    };

    const normalizeType = (value) => {
        const type = String(value || '').trim().toLowerCase() || QUERY_SYNC_STATE_DEFAULTS.type;
        if (!['string', 'number', 'boolean', 'csv', 'json'].includes(type)) {
            throw new Error("Error: 'type' solo permite 'string', 'number', 'boolean', 'csv' o 'json'.");
        }
        return type;
    };

    /**
     * Normaliza estrategia de historial (`replace`/`push`).
     * @param {unknown} value Valor fuente.
     * @returns {'replace'|'push'}
     */
    const normalizeHistory = (value) => {
        const mode = String(value || '').trim().toLowerCase() || QUERY_SYNC_STATE_DEFAULTS.history;
        if (!['replace', 'push'].includes(mode)) {
            throw new Error("Error: 'history' solo permite 'replace' o 'push'.");
        }
        return mode;
    };

    /**
     * Obtiene elementos compatibles dentro de un root.
     * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
     * @returns {HTMLElement[]}
     */
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

    /**
     * Determina si un nodo puede sincronizarse con query params.
     * @param {unknown} element Nodo candidato.
     * @returns {boolean} `true` para `input`, `select` o `textarea`.
     */
    const isElementSyncable = (element) => {
        return element instanceof HTMLInputElement
            || element instanceof HTMLSelectElement
            || element instanceof HTMLTextAreaElement;
    };

    const getOptionsFromData = (element) => {
        const options = {};

        /**
         * Asigna una opcion si el valor string existe y no esta vacio.
         * @param {string} key Clave destino en el objeto `options`.
         * @param {string|undefined} value Valor crudo proveniente de dataset.
         * @param {Function} [transform] Transformador opcional del valor final.
         * @returns {void}
         */
        const setTrimmedOption = (key, value, transform) => {
            if (typeof value !== 'string') return;
            const trimmedValue = value.trim();
            if (!trimmedValue) return;
            options[key] = typeof transform === 'function' ? transform(trimmedValue) : trimmedValue;
        };

        const omitDefault = parseBoolean(element.dataset.qssOmitDefault)
            , syncOnInit = parseBoolean(element.dataset.qssSyncOnInit)
            , trim = parseBoolean(element.dataset.qssTrim);

        setTrimmedOption('key', element.dataset.qssKey);
        setTrimmedOption('type', element.dataset.qssType);
        setTrimmedOption('history', element.dataset.qssHistory);
        setTrimmedOption('defaultRaw', element.dataset.qssDefault);
        setTrimmedOption('resetPageKey', element.dataset.qssResetPageKey);

        element.dataset.qssDebounce !== undefined && (options.debounceMs = Math.max(0, parseNumber(element.dataset.qssDebounce, QUERY_SYNC_STATE_DEFAULTS.debounceMs)));
        omitDefault !== undefined && (options.omitDefault = omitDefault);
        syncOnInit !== undefined && (options.syncOnInit = syncOnInit);
        trim !== undefined && (options.trim = trim);

        return options;
    };

    const parseByType = (rawValue, type) => {
        if (rawValue === undefined || rawValue === null) return undefined;

        switch (type) {
            case 'number': {
                const parsed = Number(rawValue);
                return Number.isFinite(parsed) ? parsed : undefined;
            }
            case 'boolean': {
                const parsed = parseBoolean(rawValue);
                return parsed === undefined ? undefined : parsed;
            }
            case 'csv':
                return String(rawValue)
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean);
            case 'json':
                return typeof rawValue === 'string' ? parseJsonSafe(rawValue) : rawValue;
            case 'string':
            default:
                return String(rawValue);
        }
    };

    /**
     * Serializa un valor segun el tipo configurado para query param.
     * @param {*} value Valor a serializar.
     * @param {'string'|'number'|'boolean'|'csv'|'json'} type Tipo de serializacion.
     * @returns {string}
     */
    const stringifyByType = (value, type) => {
        if (value === undefined || value === null) return '';

        switch (type) {
            case 'number': {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? String(parsed) : '';
            }
            case 'boolean':
                return value ? '1' : '0';
            case 'csv':
                return Array.isArray(value)
                    ? value.map((item) => String(item || '').trim()).filter(Boolean).join(',')
                    : String(value || '');
            case 'json': {
                try {
                    return JSON.stringify(value);
                } catch (_error) {
                    return '';
                }
            }
            case 'string':
            default:
                return String(value);
        }
    };

    /**
     * Compara dos valores usando la misma serializacion del query param.
     * @param {*} left Valor izquierdo.
     * @param {*} right Valor derecho.
     * @param {'string'|'number'|'boolean'|'csv'|'json'} type Tipo de comparacion.
     * @returns {boolean}
     */
    const areValuesEquivalent = (left, right, type) => {
        if (left === right) return true;

        const leftString = stringifyByType(left, type)
            , rightString = stringifyByType(right, type);

        return leftString === rightString;
    };

    /**
     * Mezcla y valida opciones efectivas de la instancia.
     * @param {HTMLElement} element Elemento sincronizable.
     * @param {Object} [options={}] Overrides por API.
     * @returns {Object}
     */
    const getValidatedOptions = (element, options = {}) => {
        const mergedOptions = { ...QUERY_SYNC_STATE_DEFAULTS, ...getOptionsFromData(element), ...options };

        if (!mergedOptions.key) {
            throw new Error("Error: No se especifico la key 'data-qss-key'.");
        }

        mergedOptions.type = normalizeType(mergedOptions.type);
        mergedOptions.history = normalizeHistory(mergedOptions.history);
        mergedOptions.debounceMs = Math.max(0, parseNumber(mergedOptions.debounceMs, QUERY_SYNC_STATE_DEFAULTS.debounceMs));

        if (mergedOptions.defaultValue === undefined && typeof mergedOptions.defaultRaw === 'string') {
            mergedOptions.defaultValue = parseByType(mergedOptions.defaultRaw, mergedOptions.type);
        }

        return mergedOptions;
    };

    /**
     * Sincroniza el valor de un control UI con un query param de la URL.
     *
     * Flujo resumido:
     * 1. Lee valor de UI y lo normaliza por tipo.
     * 2. Emite `before.plugin.querySyncState` (cancelable).
     * 3. Actualiza URL con `history.pushState` o `history.replaceState`.
     * 4. Rehidrata desde URL en init/popstate y emite eventos de ciclo.
     *
     * @fires before.plugin.querySyncState
     * @fires sync.plugin.querySyncState
     * @fires error.plugin.querySyncState
     * @fires complete.plugin.querySyncState
     */
    class QuerySyncState {
        /**
         * Crea una instancia para sincronizar un control UI con la query string.
         * @param {HTMLElement} element Elemento sincronizable (input/select/textarea).
         * @param {Object} options Opciones de configuración de la instancia.
         * @param {string} options.key Query param a sincronizar.
         * @param {'string'|'number'|'boolean'|'csv'|'json'} [options.type='string'] Tipo de serializacion.
         * @param {'replace'|'push'} [options.history='replace'] Estrategia de historial al actualizar URL.
         * @param {number} [options.debounceMs=0] Retardo para agrupar cambios consecutivos desde UI.
         * @param {boolean} [options.omitDefault=false] Omite el parametro cuando coincide con valor default.
         * @param {string} [options.resetPageKey=''] Parametro a limpiar al cambiar este estado.
         * @param {boolean} [options.syncOnInit=true] Sincroniza desde URL al inicializar.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = { ...QUERY_SYNC_STATE_DEFAULTS, ...options };
            this.isBound = false;
            this.isApplyingFromUrl = false;
            this.debounceTimer = null;

            this.handleInput = this.handleInput.bind(this);
            this.handleChange = this.handleChange.bind(this);
            this.handlePopState = this.handlePopState.bind(this);
        }

        /**
         * Define listeners activos según tipo de control.
         * @returns {Array<[string, EventListenerOrEventListenerObject, (boolean|undefined)]>}
         */
        getListeners() {
            if (!isElementSyncable(this.subject)) return [];

            if (this.subject instanceof HTMLSelectElement) {
                return [['change', this.handleChange]];
            }

            if (this.subject instanceof HTMLTextAreaElement) {
                return [['input', this.handleInput], ['change', this.handleChange]];
            }

            if (this.subject instanceof HTMLInputElement) {
                if (['checkbox', 'radio'].includes(this.subject.type)) {
                    return [['change', this.handleChange]];
                }
                return [['input', this.handleInput], ['change', this.handleChange]];
            }

            return [];
        }

        /**
         * Aplica add/remove de listeners sobre el control.
         * @param {'addEventListener'|'removeEventListener'} method Metodo de EventTarget.
         * @returns {void}
         */
        applyListeners(method) {
            this.getListeners().forEach(([eventName, handler, useCapture]) => {
                this.subject[method](eventName, handler, useCapture);
            });
        }

        /**
         * Handler de input para sincronización reactiva.
         * @param {Event} event Evento input.
         * @returns {void}
         */
        handleInput(event) {
            this.scheduleSync('ui', event);
        }

        /**
         * Handler de change para sincronización reactiva.
         * @param {Event} event Evento change.
         * @returns {void}
         */
        handleChange(event) {
            this.scheduleSync('ui', event);
        }

        /**
         * Handler de popstate para rehidratar desde URL.
         * @param {PopStateEvent} event Evento de historial del navegador.
         * @returns {void}
         */
        handlePopState(event) {
            this.syncFromUrl('history', event);
        }

        /**
         * Programa sincronización a URL respetando debounce configurado.
         * @param {string} source Origen de la sincronización.
         * @param {Event|null} [originalEvent=null] Evento original.
         * @returns {void}
         */
        scheduleSync(source, originalEvent = null) {
            if (this.isApplyingFromUrl) return;

            if (this.options.debounceMs <= 0) {
                this.syncToUrl(source, originalEvent);
                return;
            }

            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.syncToUrl(source, originalEvent);
            }, this.options.debounceMs);
        }

        /**
         * Lee valor actual del control y lo normaliza para sincronización.
         * @returns {*}
         */
        readElementValue() {
            if (!isElementSyncable(this.subject)) return undefined;

            if (this.subject instanceof HTMLInputElement) {
                if (this.subject.type === 'radio') {
                    return this.subject.checked ? this.subject.value : NO_UPDATE;
                }

                if (this.subject.type === 'checkbox') {
                    if (this.options.type === 'boolean') {
                        return this.subject.checked;
                    }
                    return this.subject.checked ? (this.subject.value || '1') : undefined;
                }

                const rawValue = this.subject.value == null ? '' : String(this.subject.value);
                return this.options.trim ? rawValue.trim() : rawValue;
            }

            if (this.subject instanceof HTMLSelectElement) {
                if (this.subject.multiple) {
                    return Array.from(this.subject.selectedOptions)
                        .map((option) => String(option.value || '').trim())
                        .filter(Boolean);
                }
                return this.subject.value;
            }

            const rawValue = this.subject.value == null ? '' : String(this.subject.value);
            return this.options.trim ? rawValue.trim() : rawValue;
        }

        /**
         * Escribe valor normalizado sobre el control asociado.
         * @param {*} value Valor a aplicar en UI.
         * @returns {void}
         */
        writeElementValue(value) {
            if (!isElementSyncable(this.subject)) return;

            if (this.subject instanceof HTMLInputElement) {
                if (this.subject.type === 'radio') {
                    this.subject.checked = value != null && String(value) === String(this.subject.value);
                    return;
                }

                if (this.subject.type === 'checkbox') {
                    if (this.options.type === 'boolean') {
                        this.subject.checked = Boolean(value);
                    } else {
                        this.subject.checked = value != null && String(value) === String(this.subject.value || '1');
                    }
                    return;
                }

                this.subject.value = value == null ? '' : String(value);
                return;
            }

            if (this.subject instanceof HTMLSelectElement) {
                if (this.subject.multiple) {
                    const selectedValues = Array.isArray(value)
                        ? value.map((item) => String(item))
                        : String(value == null ? '' : value)
                            .split(',')
                            .map((item) => item.trim())
                            .filter(Boolean);

                    const selectedSet = new Set(selectedValues);
                    Array.from(this.subject.options).forEach((option) => {
                        option.selected = selectedSet.has(String(option.value));
                    });
                    return;
                }

                this.subject.value = value == null ? '' : String(value);
                return;
            }

            this.subject.value = value == null ? '' : String(value);
        }

        /**
         * Construye detalle base para hooks y eventos del plugin.
         * @param {Object} [baseDetail={}] Datos adicionales del ciclo actual.
         * @returns {Object}
         */
        buildDetail(baseDetail = {}) {
            return {
                key: this.options.key,
                type: this.options.type,
                history: this.options.history,
                trigger: this.subject,
                ...baseDetail,
            };
        }

        /**
         * Aplica valor desde URL hacia UI y emite eventos de sincronización.
         * @param {string} [source='url'] Origen lógico del ciclo.
         * @param {Event|null} [originalEvent=null] Evento asociado.
         * @returns {boolean}
         */
        syncFromUrl(source = 'url', originalEvent = null) {
            const currentParams = new URLSearchParams(window.location.search)
                , currentRaw = currentParams.get(this.options.key)
                , parsedValue = currentRaw === null
                    ? this.options.defaultValue
                    : parseByType(currentRaw, this.options.type)
                , nextValue = parsedValue === undefined ? this.options.defaultValue : parsedValue
                , detail = this.buildDetail({
                    source,
                    originalEvent,
                    rawValue: currentRaw,
                    value: nextValue,
                });

            try {
                this.isApplyingFromUrl = true;
                this.writeElementValue(nextValue);

                this.options.onSync && this.options.onSync(detail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('sync.plugin.querySyncState', {
                    detail,
                }));

                return true;
            } catch (error) {
                const errorDetail = this.buildDetail({
                    source,
                    originalEvent,
                    error,
                });

                this.options.onError && this.options.onError(errorDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('error.plugin.querySyncState', {
                    detail: errorDetail,
                }));

                return false;
            } finally {
                this.isApplyingFromUrl = false;

                const completeDetail = this.buildDetail({
                    source,
                    originalEvent,
                });

                this.options.onComplete && this.options.onComplete(completeDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('complete.plugin.querySyncState', {
                    detail: completeDetail,
                }));
            }
        }

        /**
         * Aplica valor desde UI hacia URL y actualiza historial.
         * @param {string} [source='ui'] Origen lógico del ciclo.
         * @param {Event|null} [originalEvent=null] Evento asociado.
         * @returns {boolean}
         */
        syncToUrl(source = 'ui', originalEvent = null) {
            if (this.isApplyingFromUrl) return false;

            const elementValue = this.readElementValue();
            if (elementValue === NO_UPDATE) return false;

            const beforeDetail = this.buildDetail({
                source,
                originalEvent,
                value: elementValue,
            });

            this.options.onBeforeSync && this.options.onBeforeSync(beforeDetail, this.subject);
            const beforeEvent = new CustomEvent('before.plugin.querySyncState', {
                cancelable: true,
                detail: beforeDetail,
            });

            if (!this.subject.dispatchEvent(beforeEvent)) {
                return false;
            }

            try {
                const currentUrl = new URL(window.location.href)
                    , previousParams = new URLSearchParams(currentUrl.search)
                    , nextParams = new URLSearchParams(currentUrl.search)
                    , previousRaw = previousParams.get(this.options.key)
                    , omitByDefault = this.options.omitDefault
                        && this.options.defaultValue !== undefined
                        && areValuesEquivalent(elementValue, this.options.defaultValue, this.options.type);

                const normalizedValue = omitByDefault ? undefined : elementValue
                    , nextRaw = normalizedValue === undefined ? null : stringifyByType(normalizedValue, this.options.type);

                if (nextRaw === null || nextRaw === '') {
                    nextParams.delete(this.options.key);
                } else {
                    nextParams.set(this.options.key, nextRaw);
                }

                if (this.options.resetPageKey
                    && this.options.resetPageKey !== this.options.key
                    && previousRaw !== nextRaw
                ) {
                    nextParams.delete(this.options.resetPageKey);
                }

                const previousSearch = previousParams.toString()
                    , nextSearch = nextParams.toString();

                if (previousSearch === nextSearch) {
                    return false;
                }

                const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
                const historyState = {
                    ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
                    qss: true,
                    key: this.options.key,
                };

                if (this.options.history === 'push') {
                    window.history.pushState(historyState, '', nextUrl);
                } else {
                    window.history.replaceState(historyState, '', nextUrl);
                }

                const syncDetail = this.buildDetail({
                    source,
                    originalEvent,
                    value: normalizedValue,
                    previousRaw,
                    nextRaw,
                    nextUrl,
                });

                this.options.onSync && this.options.onSync(syncDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('sync.plugin.querySyncState', {
                    detail: syncDetail,
                }));

                return true;
            } catch (error) {
                const errorDetail = this.buildDetail({
                    source,
                    originalEvent,
                    error,
                });

                this.options.onError && this.options.onError(errorDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('error.plugin.querySyncState', {
                    detail: errorDetail,
                }));

                return false;
            } finally {
                const completeDetail = this.buildDetail({
                    source,
                    originalEvent,
                });

                this.options.onComplete && this.options.onComplete(completeDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('complete.plugin.querySyncState', {
                    detail: completeDetail,
                }));
            }
        }

        /**
         * Restablece el control a default y sincroniza URL opcionalmente.
         * @param {{syncToUrl?: boolean}} [options={}] Opciones de reset.
         * @returns {void}
         */
        reset(options = {}) {
            const { syncToUrl = true } = options;
            this.writeElementValue(this.options.defaultValue);
            if (syncToUrl) {
                this.syncToUrl('reset', null);
            }
        }

        /**
         * Vincula listeners e inicializa sincronización desde URL si aplica.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;

            this.applyListeners('addEventListener');
            window.addEventListener('popstate', this.handlePopState);
            this.isBound = true;

            if (this.options.syncOnInit) {
                this.syncFromUrl('init', null);
            }
        }

        /**
         * Remueve listeners y timers internos.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;

            this.applyListeners('removeEventListener');
            window.removeEventListener('popstate', this.handlePopState);

            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
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
         * Inicializa (o reutiliza) una instancia para un elemento.
         * @param {HTMLElement} element Elemento objetivo.
         * @param {Object} [options={}] Opciones de inicialización.
         * @returns {QuerySyncState}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: QuerySyncState.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) return currentInstance;

            const validatedOptions = getValidatedOptions(element, options)
                , instance = new QuerySyncState(element, validatedOptions);

            INSTANCES.set(element, instance);
            instance.bind();
            return instance;
        }

        /**
         * Obtiene la instancia asociada al elemento.
         * @param {HTMLElement} element Elemento objetivo.
         * @returns {QuerySyncState|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * Destruye la instancia asociada al elemento.
         * @param {HTMLElement} element Elemento objetivo.
         * @returns {boolean}
         */
        static destroy(element) {
            const instance = QuerySyncState.getInstance(element);
            if (!instance) return false;

            instance.destroy();
            return true;
        }

        /**
         * Inicializa todas las coincidencias dentro de una raiz.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz.
         * @param {Object} [options={}] Opciones compartidas.
         * @returns {QuerySyncState[]}
         */
        static initAll(root = document, options = {}) {
            return getSubjects(root).map((element) => QuerySyncState.init(element, options));
        }

        /**
         * Destruye todas las instancias encontradas dentro de una raiz.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz.
         * @returns {number}
         */
        static destroyAll(root = document) {
            return getSubjects(root).reduce((destroyedCount, element) => {
                return QuerySyncState.destroy(element) ? destroyedCount + 1 : destroyedCount;
            }, 0);
        }
    }

 /**
     * ObserverDispatcher avanzado: permite a cada plugin observar solo el root que le corresponde,
     * evitando múltiples MutationObserver redundantes y respetando la configuración global.
     */
    if (!window.Plugins) window.Plugins = {};
    if (!window.Plugins.ObserverDispatcher) {
        window.Plugins.ObserverDispatcher = (function() {
            // Mapa: rootElement => { observer, handlers[] }
            const roots = new WeakMap();

            /**
             * Obtiene el root adecuado para un plugin según la prioridad documentada.
             * @param {string} pluginKey Ej: 'form-request'
             * @returns {Element}
             */
            function resolveRoot(pluginKey) {
                // 1. data-pp-observe-root-{plugin}
                const attr = 'data-pp-observe-root-' + pluginKey
                    , specific = document.querySelector('[' + attr + ']');
                if (specific) return specific;

                // 2. data-pp-observe-root en <html>
                const html = document.documentElement
                    , selector = html.getAttribute('data-pp-observe-root');
                if (selector) {
                    try {
                        const el = document.querySelector(selector);
                        if (el) return el;
                    } catch (_) {}
                }

                // 3. Fallback seguro
                return document.body || html;
            }

            /**
             * Registra un handler para un plugin sobre el root adecuado.
             * @param {string} pluginKey
             * @param {function} handler
             */
            function register(pluginKey, handler) {
                const html = document.documentElement
                    , observeGlobal = (html.getAttribute('data-pp-observe-global') || '').trim().toLowerCase();
                if (["false", "0", "off", "no"].includes(observeGlobal)) return; // Observación global desactivada

                const root = resolveRoot(pluginKey);
                let entry = roots.get(root);
                if (!entry) {
                    entry = { handlers: [], observer: null };
                    entry.observer = new MutationObserver((mutations) => {
                        entry.handlers.forEach(fn => {
                            try { fn(mutations); } catch (e) {}
                        });
                    });
                    entry.observer.observe(root, { childList: true, subtree: true });
                    roots.set(root, entry);
                }
                entry.handlers.push(handler);
            }

            return { register };
        })();
    }

    /**
     * Limpia instancias cuyos nodos fueron removidos del DOM.
     * @returns {void}
     */
    const flushPendingRemovals = () => {
        PENDING_REMOVALS.forEach((node) => {
            if (!node.isConnected) {
                QuerySyncState.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    /**
     * Agenda chequeo diferido para evitar destroy en reubicaciones temporales.
     * @param {Element} node Nodo removido en mutacion.
     * @returns {void}
     */
    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    // Handler para mutaciones DOM (alta/baja de nodos) relacionado con QuerySyncState
    const querySyncStateDomHandler = (mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                PENDING_REMOVALS.delete(node);
                QuerySyncState.initAll(node);
            });
            mutation.removedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                scheduleRemovalCheck(node);
            });
        });
    };

    const startAutoInit = () => {
        QuerySyncState.initAll(document);
        // Usar ObserverDispatcher para registrar el handler solo sobre el root adecuado
        window.Plugins.ObserverDispatcher.register('query-sync-state', querySyncStateDomHandler);
    };

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', startAutoInit, { once: true })
        : startAutoInit();

    window.Plugins.QuerySyncState = QuerySyncState;
})();
