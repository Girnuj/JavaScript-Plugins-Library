/**
 * @fileoverview Plugin nativo para encolar acciones offline y reintentarlas al recuperar conectividad.
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @module OfflineActionQueue
 */
(function () {
    'use strict';

    /**
     * Accion serializable administrada por la cola offline.
     * @typedef {Object} OAQAction
     * @property {string} id Identificador unico de la accion.
     * @property {number} createdAt Timestamp de creacion en milisegundos.
     * @property {number} attempts Intentos acumulados.
     * @property {number} nextAttemptAt Timestamp habilitado para siguiente reintento.
     * @property {string} endpoint URL destino de la request.
     * @property {string} method Metodo HTTP normalizado.
     * @property {string} actionType Etiqueta funcional de la accion.
     * @property {Object<string, any>} payload Payload serializable.
     * @property {Object<string, string>|null} headers Headers adicionales opcionales.
     * @property {RequestCredentials|string} credentials Credenciales fetch.
     * @property {Object<string, any>=} meta Metadata auxiliar de trazabilidad.
     * @property {{status:number,message:string}=} lastError Ultimo error registrado durante reintentos.
     */

    /**
     * Resultado normalizado de envio (fetch o adaptador custom).
     * @typedef {Object} OAQSendResult
     * @property {boolean} ok Indica exito HTTP final.
     * @property {number} status Codigo HTTP o 0 en errores de red/abort.
     * @property {any} data Cuerpo parseado de respuesta.
     * @property {Response|null} response Respuesta nativa cuando existe.
     * @property {Error|null} error Error capturado en fallos de red/parseo.
     */

    /**
     * Contexto expuesto durante eventos de conflicto (409/412 por defecto).
     * @typedef {Object} OAQConflictContext
     * @property {OAQAction} action Accion en conflicto.
     * @property {OAQSendResult} result Resultado del intento actual.
     * @property {'retry'|'drop'} decision Decision mutable para conservar o descartar la accion.
     */

    /**
     * Set de hooks configurables en opciones.
     * @typedef {Object} OAQHookSet
     * @property {(function(OAQAction, HTMLElement):void)=} onQueued Hook al encolar.
     * @property {(function(OAQAction, OAQSendResult, HTMLElement):void)=} onSent Hook al enviar con exito.
     * @property {(function(OAQAction, OAQSendResult, HTMLElement):void)=} onFailed Hook al descartar por error final.
     * @property {(function(OAQConflictContext, HTMLElement):void)=} onConflict Hook de conflicto antes de resolver decision.
     * @property {(function(HTMLElement):void)=} onDrained Hook cuando la cola queda vacia.
     */

    /**
     * Opciones de configuracion soportadas por el plugin.
     * @typedef {Object} OAQOptions
     * @property {string=} storageKey Clave de persistencia en localStorage.
     * @property {string=} endpoint Endpoint por defecto para triggers.
     * @property {string=} method Metodo HTTP por defecto.
     * @property {string=} actionType Tipo de accion por defecto.
     * @property {'auto'|'form'|'json'|'dataset'=} payloadMode Estrategia de payload.
     * @property {Object<string, string>|string|null=} headers Headers default (objeto o JSON string).
     * @property {RequestCredentials|string=} credentials Politica de credenciales para fetch.
     * @property {number|string=} timeoutMs Timeout por request en milisegundos.
     * @property {number|string=} maxRetries Maximo de reintentos por accion.
     * @property {number|string=} baseRetryDelayMs Retardo base del backoff exponencial.
     * @property {number|string=} maxRetryDelayMs Tope del backoff exponencial.
     * @property {boolean|string=} autoFlushOnOnline Ejecuta flush en evento online.
     * @property {boolean|string=} autoFlushOnInit Ejecuta flush al bind de instancia.
     * @property {number|string=} flushIntervalMs Intervalo periodico de flush.
     * @property {boolean|string=} queueOnHttpErrors Determina si errores HTTP se mantienen en cola.
     * @property {number[]|string=} conflictStatuses Estados tratados como conflicto.
     * @property {boolean|string=} tryImmediate Intenta envio inmediato antes de encolar.
     * @property {(function({event:Event|null,element:HTMLElement,options:OAQOptions}):Partial<OAQAction>)=} customBuildAction Builder custom opcional.
     * @property {(function(OAQAction, HTMLElement):Promise<OAQSendResult>|OAQSendResult)=} customSendAction Sender custom opcional.
     */

    /**
     * Selector declarativo de triggers del plugin.
     * @type {string}
     */
    const SELECTOR_SUBJECT = '[data-offline-action-queue]'
        /**
         * Registro de instancias por elemento.
         * @type {WeakMap<HTMLElement, OfflineActionQueue>}
         */
        , INSTANCES = new WeakMap()
        /**
         * Nodos removidos pendientes de verificacion para destroy diferido.
         * @type {Set<Element>}
         */
        , PENDING_REMOVALS = new Set()
        /**
         * Registro de perfiles reutilizables para configuracion compacta.
         * @type {Map<string, OAQOptions>}
         */
        , OAQ_PROFILES = new Map();

    /**
     * Defaults globales de OfflineActionQueue.
     * @type {Required<OAQOptions> & OAQHookSet}
     */
    const OFFLINE_ACTION_QUEUE_DEFAULTS = Object.freeze({
        storageKey: 'offlineActionQueue:items',
        endpoint: '',
        method: 'POST',
        actionType: 'generic',
        payloadMode: 'auto',
        headers: null,
        credentials: 'same-origin',
        timeoutMs: 12000,
        maxRetries: 5,
        baseRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
        autoFlushOnOnline: true,
        autoFlushOnInit: true,
        flushIntervalMs: 0,
        queueOnHttpErrors: true,
        conflictStatuses: [409, 412],
        tryImmediate: true,
        customBuildAction: null,
        customSendAction: null,
        onQueued: function () { },
        onSent: function () { },
        onFailed: function () { },
        onConflict: function () { },
        onDrained: function () { },
    });

    /**
     * Normaliza variantes de booleanos declarativos.
     * @param {unknown} value Valor original (boolean/string).
     * @returns {boolean|undefined} `undefined` cuando no puede inferirse.
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
     * Convierte un valor numerico con fallback seguro.
     * @param {unknown} value Valor a parsear.
     * @param {number} [fallback=0] Valor de respaldo.
     * @returns {number}
     */
    const parseNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    /**
     * Separa una lista CSV en valores no vacios.
     * @param {string} value Valor CSV.
     * @returns {string[]}
     */
    const splitCsv = (value) => {
        if (!value || typeof value !== 'string') return [];
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    };

    /**
     * Parsea codigos HTTP validos desde string CSV o arreglo.
     * @param {string|number[]|unknown} value Entrada de codigos.
     * @returns {number[]|null}
     */
    const parseStatusCodes = (value) => {
        const normalizedValues = Array.isArray(value)
            ? value
            : (typeof value === 'string' ? value.split(',') : []);

        if (normalizedValues.length === 0) return null;

        const codes = normalizedValues
            .map((item) => parseInt(String(item).trim(), 10))
            .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599);
        return codes.length > 0 ? codes : null;
    };

    /**
     * Normaliza metodos HTTP en uppercase.
     * @param {unknown} value Metodo de entrada.
     * @param {string} [fallback='POST'] Metodo por defecto.
     * @returns {string}
     */
    const normalizeMethod = (value, fallback = 'POST') => {
        const method = String(value || fallback).trim().toUpperCase();
        return method || fallback;
    };

    /**
     * Normaliza el modo de payload a un valor permitido.
     * @param {unknown} value Modo solicitado.
     * @param {'auto'|'form'|'json'|'dataset'} [fallback='auto'] Modo fallback.
     * @returns {'auto'|'form'|'json'|'dataset'}
     */
    const normalizePayloadMode = (value, fallback = 'auto') => {
        const normalized = String(value || fallback).trim().toLowerCase();
        if (!['auto', 'form', 'json', 'dataset'].includes(normalized)) {
            return fallback;
        }
        return normalized;
    };

    /**
     * Parsea JSON de forma tolerante y segura.
     * @param {unknown} value Cadena JSON potencial.
     * @returns {Object<string, any>|null}
     */
    const parseJsonSafe = (value) => {
        if (!value || typeof value !== 'string') return null;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_error) {
            return null;
        }
    };

    /**
     * Convierte un objeto cualquiera en un objeto valido de headers.
     * @param {unknown} value Objeto de entrada.
     * @returns {Object<string, string>|null}
     */
    const toHeadersObject = (value) => {
        if (!value || typeof value !== 'object') return null;

        const entries = Object.entries(value)
            .map(([key, headerValue]) => [String(key || '').trim(), String(headerValue == null ? '' : headerValue).trim()])
            .filter(([key]) => key.length > 0);

        return entries.length > 0 ? Object.fromEntries(entries) : null;
    };

    /**
     * Normaliza opciones de configuracion (tipos, rangos y callbacks).
     * @param {OAQOptions|Object<string, any>|null|undefined} rawOptions Opciones sin normalizar.
     * @returns {OAQOptions & OAQHookSet}
     */
    const normalizeOptions = (rawOptions) => {
        if (!rawOptions || typeof rawOptions !== 'object') return {};

        const options = {};

        const setTrimmedOption = (key, value, transform) => {
            if (typeof value !== 'string') return;
            const trimmedValue = value.trim();
            if (!trimmedValue) return;
            options[key] = typeof transform === 'function' ? transform(trimmedValue) : trimmedValue;
        };

        setTrimmedOption('storageKey', rawOptions.storageKey);
        setTrimmedOption('endpoint', rawOptions.endpoint);
        setTrimmedOption('method', rawOptions.method, (value) => normalizeMethod(value, OFFLINE_ACTION_QUEUE_DEFAULTS.method));
        setTrimmedOption('actionType', rawOptions.actionType);
        setTrimmedOption('payloadMode', rawOptions.payloadMode, (value) => normalizePayloadMode(value, OFFLINE_ACTION_QUEUE_DEFAULTS.payloadMode));
        setTrimmedOption('credentials', rawOptions.credentials);

        rawOptions.timeoutMs !== undefined && (options.timeoutMs = Math.max(0, parseNumber(rawOptions.timeoutMs, OFFLINE_ACTION_QUEUE_DEFAULTS.timeoutMs)));
        rawOptions.maxRetries !== undefined && (options.maxRetries = Math.max(0, Math.floor(parseNumber(rawOptions.maxRetries, OFFLINE_ACTION_QUEUE_DEFAULTS.maxRetries))));
        rawOptions.baseRetryDelayMs !== undefined && (options.baseRetryDelayMs = Math.max(0, parseNumber(rawOptions.baseRetryDelayMs, OFFLINE_ACTION_QUEUE_DEFAULTS.baseRetryDelayMs)));
        rawOptions.maxRetryDelayMs !== undefined && (options.maxRetryDelayMs = Math.max(0, parseNumber(rawOptions.maxRetryDelayMs, OFFLINE_ACTION_QUEUE_DEFAULTS.maxRetryDelayMs)));
        rawOptions.flushIntervalMs !== undefined && (options.flushIntervalMs = Math.max(0, parseNumber(rawOptions.flushIntervalMs, OFFLINE_ACTION_QUEUE_DEFAULTS.flushIntervalMs)));

        const autoFlushOnOnline = parseBoolean(rawOptions.autoFlushOnOnline)
            , autoFlushOnInit = parseBoolean(rawOptions.autoFlushOnInit)
            , queueOnHttpErrors = parseBoolean(rawOptions.queueOnHttpErrors)
            , tryImmediate = parseBoolean(rawOptions.tryImmediate);

        autoFlushOnOnline !== undefined && (options.autoFlushOnOnline = autoFlushOnOnline);
        autoFlushOnInit !== undefined && (options.autoFlushOnInit = autoFlushOnInit);
        queueOnHttpErrors !== undefined && (options.queueOnHttpErrors = queueOnHttpErrors);
        tryImmediate !== undefined && (options.tryImmediate = tryImmediate);

        if (rawOptions.headers !== undefined) {
            const normalizedHeaders = typeof rawOptions.headers === 'string'
                ? toHeadersObject(parseJsonSafe(rawOptions.headers))
                : toHeadersObject(rawOptions.headers);
            normalizedHeaders && (options.headers = normalizedHeaders);
        }

        const conflictStatuses = parseStatusCodes(rawOptions.conflictStatuses);
        conflictStatuses && (options.conflictStatuses = conflictStatuses);

        typeof rawOptions.customBuildAction === 'function' && (options.customBuildAction = rawOptions.customBuildAction);
        typeof rawOptions.customSendAction === 'function' && (options.customSendAction = rawOptions.customSendAction);
        typeof rawOptions.onQueued === 'function' && (options.onQueued = rawOptions.onQueued);
        typeof rawOptions.onSent === 'function' && (options.onSent = rawOptions.onSent);
        typeof rawOptions.onFailed === 'function' && (options.onFailed = rawOptions.onFailed);
        typeof rawOptions.onConflict === 'function' && (options.onConflict = rawOptions.onConflict);
        typeof rawOptions.onDrained === 'function' && (options.onDrained = rawOptions.onDrained);

        return options;
    };

    /**
     * Resuelve un perfil registrado y devuelve opciones normalizadas.
     * @param {string} profileName Nombre del perfil.
     * @returns {OAQOptions & OAQHookSet}
     */
    const getProfileOptions = (profileName) => {
        if (typeof profileName !== 'string') return {};
        const key = profileName.trim();
        if (!key) return {};

        const profile = OAQ_PROFILES.get(key);
        if (!profile || typeof profile !== 'object') return {};

        return normalizeOptions(profile);
    };

    /**
     * Extrae opciones compactas desde atributos `data-oaq-profile` y `data-oaq-config`.
     * @param {HTMLElement} element Elemento fuente.
     * @returns {OAQOptions & OAQHookSet}
     */
    const getCompactOptionsFromElement = (element) => {
        if (!(element instanceof HTMLElement)) return {};

        const profileOptions = getProfileOptions(element.dataset.oaqProfile)
            , configOptions = normalizeOptions(parseJsonSafe(element.dataset.oaqConfig));

        return {
            ...profileOptions,
            ...configOptions,
        };
    };

    /**
     * Hereda configuracion compacta desde ancestros del trigger.
     * @param {HTMLElement} element Elemento trigger final.
     * @returns {OAQOptions & OAQHookSet}
     */
    const getInheritedOptionsFromParents = (element) => {
        if (!(element instanceof HTMLElement)) return {};

        const chain = [];
        let parent = element.parentElement;

        while (parent) {
            const hasConfig = parent.hasAttribute('data-oaq-config') || parent.hasAttribute('data-oaq-profile');
            hasConfig && chain.push(parent);
            parent = parent.parentElement;
        }

        chain.reverse();

        return chain.reduce((accumulator, node) => {
            return {
                ...accumulator,
                ...getCompactOptionsFromElement(node),
            };
        }, {});
    };

    /**
     * Genera un ID unico para acciones de cola.
     * @returns {string}
     */
    const createActionId = () => {
        return 'oaq-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    };

    /**
     * Proveedor de timestamp actual para facilitar testeo/mocks.
     * @returns {number}
     */
    const now = () => Date.now();

    /**
     * Obtiene elementos compatibles dentro de un root dado.
     * @param {ParentNode|Element|Document} [root=document] Nodo raiz de busqueda.
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
     * Limpia referencias a nodos removidos y destruye sus instancias asociadas.
     * @returns {void}
     */
    const flushPendingRemovals = () => {
        PENDING_REMOVALS.forEach((node) => {
            if (!node.isConnected) {
                OfflineActionQueue.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    /**
     * Agenda verificacion diferida para un nodo removido.
     * @param {Element} node Nodo removido del DOM.
     * @returns {void}
     */
    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    /**
     * Construye opciones desde atributos `data-*`, perfiles y herencia de contenedor.
     * @param {HTMLElement} element Trigger objetivo.
     * @returns {OAQOptions & OAQHookSet}
     */
    const getOptionsFromData = (element) => {
        const options = {
                ...getInheritedOptionsFromParents(element),
                ...getCompactOptionsFromElement(element),
            }
            , autoFlushOnOnline = parseBoolean(element.dataset.oaqAutoFlushOnOnline)
            , autoFlushOnInit = parseBoolean(element.dataset.oaqAutoFlushOnInit)
            , queueOnHttpErrors = parseBoolean(element.dataset.oaqQueueOnHttpErrors)
            , tryImmediate = parseBoolean(element.dataset.oaqTryImmediate)
            , headersJson = parseJsonSafe(element.dataset.oaqHeaders)
            , conflictStatuses = parseStatusCodes(element.dataset.oaqConflictStatuses);

        const setTrimmedOption = (key, value, transform) => {
            if (typeof value !== 'string') return;
            const trimmedValue = value.trim();
            if (!trimmedValue) return;
            options[key] = typeof transform === 'function' ? transform(trimmedValue) : trimmedValue;
        };

        setTrimmedOption('storageKey', element.dataset.oaqStorageKey);
        setTrimmedOption('endpoint', element.dataset.oaqEndpoint);
        setTrimmedOption('method', element.dataset.oaqMethod, (value) => normalizeMethod(value, options.method || OFFLINE_ACTION_QUEUE_DEFAULTS.method));
        setTrimmedOption('actionType', element.dataset.oaqActionType);
        setTrimmedOption('payloadMode', element.dataset.oaqPayloadMode, (value) => normalizePayloadMode(value, options.payloadMode || OFFLINE_ACTION_QUEUE_DEFAULTS.payloadMode));
        setTrimmedOption('credentials', element.dataset.oaqCredentials);

        element.dataset.oaqTimeout !== undefined && (options.timeoutMs = Math.max(0, parseNumber(element.dataset.oaqTimeout, options.timeoutMs || OFFLINE_ACTION_QUEUE_DEFAULTS.timeoutMs)));
        element.dataset.oaqMaxRetries !== undefined && (options.maxRetries = Math.max(0, Math.floor(parseNumber(element.dataset.oaqMaxRetries, options.maxRetries || OFFLINE_ACTION_QUEUE_DEFAULTS.maxRetries))));
        element.dataset.oaqBaseRetryDelay !== undefined && (options.baseRetryDelayMs = Math.max(0, parseNumber(element.dataset.oaqBaseRetryDelay, options.baseRetryDelayMs || OFFLINE_ACTION_QUEUE_DEFAULTS.baseRetryDelayMs)));
        element.dataset.oaqMaxRetryDelay !== undefined && (options.maxRetryDelayMs = Math.max(0, parseNumber(element.dataset.oaqMaxRetryDelay, options.maxRetryDelayMs || OFFLINE_ACTION_QUEUE_DEFAULTS.maxRetryDelayMs)));
        element.dataset.oaqFlushInterval !== undefined && (options.flushIntervalMs = Math.max(0, parseNumber(element.dataset.oaqFlushInterval, options.flushIntervalMs || OFFLINE_ACTION_QUEUE_DEFAULTS.flushIntervalMs)));

        autoFlushOnOnline !== undefined && (options.autoFlushOnOnline = autoFlushOnOnline);
        autoFlushOnInit !== undefined && (options.autoFlushOnInit = autoFlushOnInit);
        queueOnHttpErrors !== undefined && (options.queueOnHttpErrors = queueOnHttpErrors);
        tryImmediate !== undefined && (options.tryImmediate = tryImmediate);

        headersJson && (options.headers = toHeadersObject(headersJson));
        conflictStatuses && (options.conflictStatuses = conflictStatuses);

        return normalizeOptions(options);
    };

    /**
     * Extrae payload por dataset utilizando prefijo `data-oaq-name-*`.
     * @param {HTMLElement} element Elemento fuente.
     * @returns {Object<string, string>}
     */
    const toDatasetPayload = (element) => {
        const payload = {};

        Array.from(element.attributes).forEach((attribute) => {
            if (!attribute || typeof attribute.name !== 'string') return;
            const name = attribute.name.toLowerCase();
            if (!name.startsWith('data-oaq-name-')) return;

            const rawKey = name.slice('data-oaq-name-'.length)
                , key = rawKey.replace(/-([a-z0-9])/g, function (_match, chr) {
                    return chr.toUpperCase();
                });

            if (!key) return;
            payload[key] = attribute.value;
        });

        return payload;
    };

    /**
     * Convierte FormData a objeto plano serializable, preservando repetidos como array.
     * @param {FormData} formData FormData de entrada.
     * @returns {Object<string, string|Object|Array<string|Object>>}
     */
    const formDataToObject = (formData) => {
        const result = {};

        formData.forEach((value, key) => {
            const normalizedValue = value instanceof File
                ? {
                    name: value.name,
                    size: value.size,
                    type: value.type,
                }
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

    /**
     * Espera asincrona utilitaria.
     * @param {number} ms Milisegundos a esperar.
     * @returns {Promise<void>}
     */
    const wait = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    };

    /**
     * Gestiona cola offline persistente y replay resiliente de acciones HTTP.
     * @class
     * @fires queued.plugin.offlineActionQueue
     * @fires sent.plugin.offlineActionQueue
     * @fires failed.plugin.offlineActionQueue
     * @fires conflict.plugin.offlineActionQueue
     * @fires drained.plugin.offlineActionQueue
     */
    class OfflineActionQueue {
        /**
         * Crea una instancia para encolar y reintentar acciones de red.
         * @param {HTMLElement} element Trigger asociado al plugin.
         * @param {OAQOptions & OAQHookSet} options Opciones de configuracion de la instancia.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = {
                ...OFFLINE_ACTION_QUEUE_DEFAULTS,
                ...options,
                ...normalizeOptions(options),
            };
            this.isBound = false;
            this.isFlushing = false;
            this.flushTimer = null;

            this.handleClick = this.handleClick.bind(this);
            this.handleSubmit = this.handleSubmit.bind(this);
            this.handleOnline = this.handleOnline.bind(this);
        }

        /**
         * Carga la cola persistida desde localStorage.
         * @returns {OAQAction[]}
         */
        readQueue() {
            const key = this.options.storageKey;

            try {
                const raw = window.localStorage.getItem(key);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_error) {
                return [];
            }
        }

        /**
         * Persiste la cola actual en localStorage.
         * @param {OAQAction[]} queue Cola serializable.
         * @returns {void}
         */
        writeQueue(queue) {
            const key = this.options.storageKey;

            try {
                window.localStorage.setItem(key, JSON.stringify(Array.isArray(queue) ? queue : []));
            } catch (_error) {
                // localStorage puede fallar en modo privado o por cuota.
            }
        }

        /**
         * Resuelve payload segun modo configurado.
         * @param {Event|null} evt Evento origen (click/submit).
         * @returns {Object<string, any>}
         */
        resolvePayload(evt) {
            const mode = this.options.payloadMode
                , datasetPayload = toDatasetPayload(this.subject)
                , jsonPayload = parseJsonSafe(this.subject.dataset.oaqPayloadJson)
                , eventTarget = evt && evt.target ? evt.target : null;

            if (mode === 'json') {
                return jsonPayload || {};
            }

            if (mode === 'dataset') {
                return datasetPayload;
            }

            if (mode === 'form') {
                const form = this.subject instanceof HTMLFormElement
                    ? this.subject
                    : (eventTarget instanceof HTMLFormElement ? eventTarget : null);

                if (!form) return {};
                return formDataToObject(new FormData(form));
            }

            if (jsonPayload) return jsonPayload;

            if (this.subject instanceof HTMLFormElement) {
                return formDataToObject(new FormData(this.subject));
            }

            return datasetPayload;
        }

        /**
         * Construye una accion serializable para cola/envio.
         * @param {Event|null} [evt=null] Evento origen.
         * @returns {OAQAction}
         */
        buildAction(evt = null) {
            if (typeof this.options.customBuildAction === 'function') {
                const customAction = this.options.customBuildAction({
                    event: evt,
                    element: this.subject,
                    options: this.options,
                });

                if (customAction && typeof customAction === 'object') {
                    return {
                        id: customAction.id || createActionId(),
                        createdAt: customAction.createdAt || now(),
                        attempts: Number.isFinite(customAction.attempts) ? customAction.attempts : 0,
                        nextAttemptAt: Number.isFinite(customAction.nextAttemptAt) ? customAction.nextAttemptAt : 0,
                        ...customAction,
                    };
                }
            }

            const endpoint = this.subject.dataset.oaqEndpoint || this.options.endpoint
                , method = normalizeMethod(this.subject.dataset.oaqMethod || this.options.method, OFFLINE_ACTION_QUEUE_DEFAULTS.method)
                , actionType = this.subject.dataset.oaqActionType || this.options.actionType
                , payload = this.resolvePayload(evt)
                , headersFromData = toHeadersObject(parseJsonSafe(this.subject.dataset.oaqHeaders))
                , headers = headersFromData || this.options.headers || null;

            if (!endpoint || typeof endpoint !== 'string') {
                throw new Error('Error: OfflineActionQueue requiere endpoint via options.endpoint o data-oaq-endpoint.');
            }

            return {
                id: createActionId(),
                createdAt: now(),
                attempts: 0,
                nextAttemptAt: 0,
                endpoint: endpoint.trim(),
                method,
                actionType,
                payload,
                headers,
                credentials: this.options.credentials,
                meta: {
                    source: this.subject.id || this.subject.getAttribute('name') || this.subject.tagName.toLowerCase(),
                },
            };
        }

        /**
         * Calcula el siguiente instante de reintento con backoff exponencial.
         * @param {number} attempts Intentos acumulados.
         * @returns {number}
         */
        computeNextAttemptAt(attempts) {
            const base = Math.max(0, this.options.baseRetryDelayMs)
                , maxDelay = Math.max(base, this.options.maxRetryDelayMs)
                , exponent = Math.max(0, attempts - 1)
                , delay = Math.min(maxDelay, base * Math.pow(2, exponent))
                , jitter = Math.floor(Math.random() * 250);

            return now() + delay + jitter;
        }

        /**
         * Envia una accion al backend.
         * @param {OAQAction} action Accion serializada.
         * @returns {Promise<OAQSendResult>}
         */
        async sendAction(action) {
            if (typeof this.options.customSendAction === 'function') {
                const customResult = await this.options.customSendAction(action, this.subject);
                if (customResult && typeof customResult === 'object') {
                    return {
                        ok: Boolean(customResult.ok),
                        status: Number.isInteger(customResult.status) ? customResult.status : 0,
                        data: customResult.data,
                        response: customResult.response || null,
                        error: customResult.error || null,
                    };
                }
            }

            const headers = new Headers(action.headers || {})
                , method = normalizeMethod(action.method, OFFLINE_ACTION_QUEUE_DEFAULTS.method)
                , endpoint = String(action.endpoint || '').trim()
                , payload = action.payload && typeof action.payload === 'object' ? action.payload : {}
                , timeoutMs = Math.max(0, this.options.timeoutMs);

            if (!endpoint) {
                return {
                    ok: false,
                    status: 0,
                    data: null,
                    response: null,
                    error: new Error('Error: accion sin endpoint.'),
                };
            }

            const controller = new AbortController()
                , requestInit = {
                    method,
                    headers,
                    credentials: action.credentials || this.options.credentials,
                    signal: controller.signal,
                };

            let timeoutId = null;
            if (timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    controller.abort();
                }, timeoutMs);
            }

            try {
                let requestUrl = endpoint;

                if (method === 'GET' || method === 'HEAD') {
                    const targetUrl = new URL(endpoint, window.location.href)
                        , params = new URLSearchParams(targetUrl.search || '');

                    Object.keys(payload).forEach((key) => {
                        const value = payload[key];
                        if (value == null) return;
                        if (Array.isArray(value)) {
                            value.forEach((item) => params.append(key, String(item)));
                            return;
                        }
                        params.append(key, String(value));
                    });

                    targetUrl.search = params.toString();
                    requestUrl = targetUrl.toString();
                } else {
                    if (!headers.has('Content-Type')) {
                        headers.set('Content-Type', 'application/json');
                    }
                    requestInit.body = JSON.stringify(payload);
                }

                const response = await fetch(requestUrl, requestInit)
                    , contentType = response.headers.get('Content-Type') || ''
                    , isJson = contentType.toLowerCase().includes('json')
                    , data = isJson
                        ? await response.json().catch(() => null)
                        : await response.text().catch(() => '');

                return {
                    ok: response.ok,
                    status: response.status,
                    data,
                    response,
                    error: null,
                };
            } catch (error) {
                return {
                    ok: false,
                    status: 0,
                    data: null,
                    response: null,
                    error: error instanceof Error ? error : new Error(String(error)),
                };
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        }

        /**
         * Encola una accion y notifica eventos/hooks.
         * @param {OAQAction} action Accion serializable.
         * @returns {OAQAction}
         */
        enqueueAction(action) {
            const queue = this.readQueue()
                , queuedAction = {
                    id: action.id || createActionId(),
                    createdAt: action.createdAt || now(),
                    attempts: Number.isFinite(action.attempts) ? action.attempts : 0,
                    nextAttemptAt: Number.isFinite(action.nextAttemptAt) ? action.nextAttemptAt : 0,
                    ...action,
                };

            queue.push(queuedAction);
            queue.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
            this.writeQueue(queue);

            this.options.onQueued && this.options.onQueued(queuedAction, this.subject);
            this.subject.dispatchEvent(new CustomEvent('queued.plugin.offlineActionQueue', {
                detail: {
                    action: queuedAction,
                    queueSize: queue.length,
                },
            }));

            return queuedAction;
        }

        /**
         * Ejecuta flush ordenado de la cola persistida.
         * @returns {Promise<number>} Cantidad de acciones enviadas exitosamente.
         */
        async flush() {
            if (this.isFlushing) return 0;
            this.isFlushing = true;

            let queue = this.readQueue();
            if (queue.length === 0) {
                this.isFlushing = false;
                return 0;
            }

            let sentCount = 0;

            for (let index = 0; index < queue.length; index += 1) {
                const item = queue[index]
                    , currentTime = now();

                if ((item.nextAttemptAt || 0) > currentTime) {
                    continue;
                }

                const result = await this.sendAction(item)
                    , isConflict = this.options.conflictStatuses.includes(result.status);

                if (result.ok) {
                    sentCount += 1;
                    this.options.onSent && this.options.onSent(item, result, this.subject);
                    this.subject.dispatchEvent(new CustomEvent('sent.plugin.offlineActionQueue', {
                        detail: {
                            action: item,
                            result,
                        },
                    }));

                    queue.splice(index, 1);
                    index -= 1;
                    this.writeQueue(queue);
                    continue;
                }

                if (isConflict) {
                    const conflictContext = {
                        action: item,
                        result,
                        decision: 'retry',
                    };

                    this.options.onConflict && this.options.onConflict(conflictContext, this.subject);
                    this.subject.dispatchEvent(new CustomEvent('conflict.plugin.offlineActionQueue', {
                        detail: conflictContext,
                    }));

                    if (conflictContext.decision === 'drop') {
                        queue.splice(index, 1);
                        index -= 1;
                        this.writeQueue(queue);
                        continue;
                    }
                }

                const nextAttempts = (item.attempts || 0) + 1
                    , shouldRetry = nextAttempts <= this.options.maxRetries
                        && (this.options.queueOnHttpErrors || result.status === 0);

                if (!shouldRetry) {
                    this.options.onFailed && this.options.onFailed(item, result, this.subject);
                    this.subject.dispatchEvent(new CustomEvent('failed.plugin.offlineActionQueue', {
                        detail: {
                            action: item,
                            result,
                        },
                    }));

                    queue.splice(index, 1);
                    index -= 1;
                    this.writeQueue(queue);
                    continue;
                }

                item.attempts = nextAttempts;
                item.lastError = {
                    status: result.status,
                    message: result.error ? result.error.message : 'request_failed',
                };
                item.nextAttemptAt = this.computeNextAttemptAt(nextAttempts);
                queue[index] = item;
                this.writeQueue(queue);
            }

            queue = this.readQueue();
            if (queue.length === 0) {
                this.options.onDrained && this.options.onDrained(this.subject);
                this.subject.dispatchEvent(new CustomEvent('drained.plugin.offlineActionQueue', {
                    detail: {
                        queueSize: 0,
                    },
                }));
            }

            this.isFlushing = false;
            return sentCount;
        }

        /**
         * Limpia todas las acciones pendientes de la cola.
         * @returns {void}
         */
        clearQueue() {
            this.writeQueue([]);
        }

        /**
         * Devuelve snapshot de la cola persistida.
         * @returns {OAQAction[]}
         */
        getQueueSnapshot() {
            return this.readQueue();
        }

        /**
         * Devuelve tamano actual de la cola.
         * @returns {number}
         */
        getQueueSize() {
            return this.readQueue().length;
        }

        /**
         * Ejecuta el flujo para encolar una accion desde evento.
         * @param {Event|null} evt Evento origen.
         * @returns {Promise<void>}
         */
        async enqueueFromEvent(evt) {
            const action = this.buildAction(evt)
                , canTryNow = this.options.tryImmediate === true && navigator.onLine !== false;

            if (!canTryNow) {
                this.enqueueAction(action);
                return;
            }

            const result = await this.sendAction(action)
                , isConflict = this.options.conflictStatuses.includes(result.status);

            if (result.ok) {
                this.options.onSent && this.options.onSent(action, result, this.subject);
                this.subject.dispatchEvent(new CustomEvent('sent.plugin.offlineActionQueue', {
                    detail: {
                        action,
                        result,
                        immediate: true,
                    },
                }));
                return;
            }

            if (isConflict) {
                const conflictContext = {
                    action,
                    result,
                    decision: 'retry',
                };

                this.options.onConflict && this.options.onConflict(conflictContext, this.subject);
                this.subject.dispatchEvent(new CustomEvent('conflict.plugin.offlineActionQueue', {
                    detail: conflictContext,
                }));

                if (conflictContext.decision === 'drop') {
                    return;
                }
            }

            const shouldQueue = this.options.queueOnHttpErrors || result.status === 0;
            if (shouldQueue) {
                this.enqueueAction(action);
                return;
            }

            this.options.onFailed && this.options.onFailed(action, result, this.subject);
            this.subject.dispatchEvent(new CustomEvent('failed.plugin.offlineActionQueue', {
                detail: {
                    action,
                    result,
                    immediate: true,
                },
            }));
        }

        /**
         * Maneja click de triggers no form.
         * @param {MouseEvent} evt Evento click.
         * @returns {Promise<void>}
         */
        async handleClick(evt) {
            if (!(this.subject instanceof HTMLElement)) return;

            const preventDefault = parseBoolean(this.subject.dataset.oaqPreventDefault);
            if (preventDefault !== false) {
                evt.preventDefault();
            }

            await this.enqueueFromEvent(evt);
            this.options.autoFlushOnInit && this.flush();
        }

        /**
         * Maneja submit de formularios.
         * @param {SubmitEvent} evt Evento submit.
         * @returns {Promise<void>}
         */
        async handleSubmit(evt) {
            evt.preventDefault();
            await this.enqueueFromEvent(evt);
            this.options.autoFlushOnInit && this.flush();
        }

        /**
         * Dispara flush al recuperar conectividad.
         * @returns {void}
         */
        handleOnline() {
            this.flush();
        }

        /**
         * Define listeners activos de la instancia.
         * @returns {Array<[EventTarget, string, EventListenerOrEventListenerObject, (boolean|undefined)]>}
         */
        getListeners() {
            const listeners = [];

            if (this.subject instanceof HTMLFormElement) {
                listeners.push([this.subject, 'submit', this.handleSubmit]);
            } else {
                listeners.push([this.subject, 'click', this.handleClick]);
            }

            if (this.options.autoFlushOnOnline) {
                listeners.push([window, 'online', this.handleOnline]);
            }

            return listeners;
        }

        /**
         * Aplica add/remove de listeners en lote.
         * @param {'addEventListener'|'removeEventListener'} method Metodo de EventTarget.
         * @returns {void}
         */
        applyListeners(method) {
            this.getListeners().forEach(([target, eventName, handler, useCapture]) => {
                target[method](eventName, handler, useCapture);
            });
        }

        /**
         * Activa listeners y timers de la instancia.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;
            this.applyListeners('addEventListener');

            if (this.options.flushIntervalMs > 0) {
                this.flushTimer = setInterval(() => {
                    this.flush();
                }, this.options.flushIntervalMs);
            }

            this.isBound = true;

            if (this.options.autoFlushOnInit) {
                this.flush();
            }
        }

        /**
         * Remueve listeners y timers de la instancia.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;
            this.applyListeners('removeEventListener');

            if (this.flushTimer) {
                clearInterval(this.flushTimer);
                this.flushTimer = null;
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
         * Inicializa o reutiliza instancia para un elemento.
         * @param {HTMLElement} element Elemento objetivo.
         * @param {OAQOptions & OAQHookSet} [options={}] Opciones de configuracion de la instancia.
         * @returns {OfflineActionQueue}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: OfflineActionQueue.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) return currentInstance;

            const mergedOptions = {
                    ...getOptionsFromData(element),
                    ...options,
                    ...normalizeOptions(options),
                }
                , instance = new OfflineActionQueue(element, mergedOptions);

            INSTANCES.set(element, instance);
            instance.bind();
            return instance;
        }

        /**
         * Obtiene instancia asociada a un elemento.
         * @param {HTMLElement} element Elemento objetivo.
         * @returns {OfflineActionQueue|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * Destruye instancia asociada a un elemento.
         * @param {HTMLElement} element Elemento objetivo.
         * @returns {void}
         */
        static destroy(element) {
            if (!(element instanceof HTMLElement)) return;
            const instance = INSTANCES.get(element);
            if (!instance) return;
            instance.destroy();
        }

        /**
         * Inicializa todos los elementos compatibles dentro de un root.
         * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
         * @returns {OfflineActionQueue[]}
         */
        static initAll(root = document) {
            return getSubjects(root).map((subject) => OfflineActionQueue.init(subject));
        }

        /**
         * Destruye instancias compatibles dentro de un root.
         * @param {ParentNode|Element|Document} [root=document] Nodo raiz.
         * @returns {void}
         */
        static destroyAll(root = document) {
            getSubjects(root).forEach((subject) => OfflineActionQueue.destroy(subject));
        }

        /**
         * Registra o sobrescribe un perfil reutilizable de configuracion.
         * @param {string} name Nombre del perfil.
         * @param {OAQOptions & OAQHookSet} [profileOptions={}] Opciones base del perfil.
         * @returns {void}
         */
        static registerProfile(name, profileOptions = {}) {
            if (typeof name !== 'string' || !name.trim()) {
                throw new Error('Error: OfflineActionQueue.registerProfile requiere un nombre valido.');
            }

            OAQ_PROFILES.set(name.trim(), { ...profileOptions });
        }

        /**
         * Obtiene un perfil registrado.
         * @param {string} name Nombre del perfil.
         * @returns {(OAQOptions & OAQHookSet)|null}
         */
        static getProfile(name) {
            if (typeof name !== 'string') return null;
            const key = name.trim();
            if (!key) return null;
            const profile = OAQ_PROFILES.get(key);
            return profile ? { ...profile } : null;
        }

        /**
         * Indica si existe un perfil registrado.
         * @param {string} name Nombre del perfil.
         * @returns {boolean}
         */
        static hasProfile(name) {
            if (typeof name !== 'string') return false;
            const key = name.trim();
            return key ? OAQ_PROFILES.has(key) : false;
        }

        /**
         * Elimina un perfil registrado.
         * @param {string} name Nombre del perfil.
         * @returns {boolean}
         */
        static unregisterProfile(name) {
            if (typeof name !== 'string') return false;
            const key = name.trim();
            return key ? OAQ_PROFILES.delete(key) : false;
        }

        /**
         * Lista todos los perfiles registrados.
         * @returns {Array<{name:string,options:(OAQOptions & OAQHookSet)}>} 
         */
        static listProfiles() {
            return Array.from(OAQ_PROFILES.entries()).map(([name, options]) => ({
                name,
                options: { ...options },
            }));
        }
    }

    /**
     * API publica expuesta en `window`.
     * @type {typeof OfflineActionQueue}
     */
    window.OfflineActionQueue = OfflineActionQueue;

    /**
     * Inicializa automaticamente instancias declarativas al cargar el DOM.
     * @returns {void}
     */
    const bootstrap = () => {
        OfflineActionQueue.initAll(document);
    };

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
        : bootstrap();

    /**
     * Observa mutaciones del DOM para auto-init y destroy de instancias dinamicas.
     * @type {MutationObserver}
     */
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                PENDING_REMOVALS.delete(node);
                OfflineActionQueue.initAll(node);
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
            , observeRootElement = document.querySelector('[data-pp-observe-root-offline-action-queue]');
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
