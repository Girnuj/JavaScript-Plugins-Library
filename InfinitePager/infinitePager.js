/**
 * @fileoverview Plugin nativo para paginacion incremental con boton "ver mas" o infinite scroll.
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @module InfinitePager
 */
(function () {
    'use strict';

    const SELECTOR_SUBJECT = '[data-role="infinite-pager"]'
        , INSTANCES = new WeakMap()
        , PENDING_REMOVALS = new Set();

    const INFINITE_PAGER_DEFAULTS = Object.freeze({
        endpoint: '',
        method: 'GET',
        headers: null,
        mode: 'button',
        targetSelector: '',
        sentinelSelector: '',
        initialPage: 1,
        pageSize: 10,
        pageParam: 'page',
        pageSizeParam: 'pageSize',
        responseMode: 'auto',
        htmlPath: 'html',
        itemsPath: 'items',
        hasMorePath: 'hasMore',
        nextPagePath: 'nextPage',
        rootMargin: '300px 0px',
        threshold: 0,
        autoLoadOnInit: undefined,
        stopOnEmpty: true,
        sameOrigin: true,
        credentials: 'same-origin',
        loadingClass: 'is-loading',
        disabledClass: 'is-disabled',
        renderItem: null,
        beforeRequest: function () { },
        onSuccess: function () { },
        onError: function () { },
        onComplete: function () { },
        onEnd: function () { },
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

    const parseJsonObject = (value) => {
        if (!value || typeof value !== 'string') return null;

        try {
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

            const entries = Object.entries(parsed)
                .map(([key, val]) => [String(key || '').trim(), String(val == null ? '' : val)])
                .filter(([key]) => key.length > 0);

            return entries.length > 0 ? Object.fromEntries(entries) : null;
        } catch (_error) {
            return null;
        }
    };

    const normalizeMethod = (value) => {
        const method = String(value || '').trim().toUpperCase() || INFINITE_PAGER_DEFAULTS.method;
        if (!['GET', 'POST'].includes(method)) {
            throw new Error("Error: 'method' solo permite 'GET' o 'POST'.");
        }
        return method;
    };

    const normalizeMode = (value) => {
        const mode = String(value || '').trim().toLowerCase() || INFINITE_PAGER_DEFAULTS.mode;
        if (!['button', 'scroll'].includes(mode)) {
            throw new Error("Error: 'mode' solo permite 'button' o 'scroll'.");
        }
        return mode;
    };

    const normalizeResponseMode = (value) => {
        const mode = String(value || '').trim().toLowerCase() || INFINITE_PAGER_DEFAULTS.responseMode;
        if (!['auto', 'html', 'json'].includes(mode)) {
            throw new Error("Error: 'responseMode' solo permite 'auto', 'html' o 'json'.");
        }
        return mode;
    };

    const resolvePath = (obj, path) => {
        if (!obj || typeof obj !== 'object') return undefined;
        if (!path || typeof path !== 'string') return undefined;

        return path.split('.').reduce((accumulator, segment) => {
            if (accumulator == null) return undefined;
            return accumulator[segment];
        }, obj);
    };

    const escapeHtml = (value) => {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
                InfinitePager.destroyAll(node);
            }
            PENDING_REMOVALS.delete(node);
        });
    };

    const scheduleRemovalCheck = (node) => {
        PENDING_REMOVALS.add(node);
        queueMicrotask(flushPendingRemovals);
    };

    const getOptionsFromData = (element) => {
        const getDataValue = (pagerKey, legacyKey) => {
            const pagerValue = element.dataset[pagerKey];
            if (pagerValue !== undefined) return pagerValue;
            return legacyKey ? element.dataset[legacyKey] : undefined;
        };

        const endpoint = getDataValue('pagerEndpoint', 'ipEndpoint')
            , targetSelector = getDataValue('pagerTarget', 'ipTarget')
            , sentinelSelector = getDataValue('pagerSentinel', 'ipSentinel')
            , pageParam = getDataValue('pagerPageParam', 'ipPageParam')
            , pageSizeParam = getDataValue('pagerPageSizeParam', 'ipPageSizeParam')
            , htmlPath = getDataValue('pagerHtmlPath', 'ipHtmlPath')
            , itemsPath = getDataValue('pagerItemsPath', 'ipItemsPath')
            , hasMorePath = getDataValue('pagerHasMorePath', 'ipHasMorePath')
            , nextPagePath = getDataValue('pagerNextPagePath', 'ipNextPagePath')
            , rootMargin = getDataValue('pagerRootMargin', 'ipRootMargin')
            , credentials = getDataValue('pagerCredentials', 'ipCredentials')
            , loadingClass = getDataValue('pagerLoadingClass', 'ipLoadingClass')
            , disabledClass = getDataValue('pagerDisabledClass', 'ipDisabledClass')
            , initialPage = getDataValue('pagerInitialPage', 'ipInitialPage')
            , pageSize = getDataValue('pagerPageSize', 'ipPageSize')
            , threshold = getDataValue('pagerThreshold', 'ipThreshold')
            , sameOriginRaw = getDataValue('pagerSameOrigin', 'ipSameOrigin')
            , stopOnEmptyRaw = getDataValue('pagerStopOnEmpty', 'ipStopOnEmpty')
            , autoLoadOnInitRaw = getDataValue('pagerAutoLoad', 'ipAutoLoad')
            , method = getDataValue('pagerMethod', 'ipMethod')
            , mode = getDataValue('pagerMode', 'ipMode')
            , responseMode = getDataValue('pagerResponseMode', 'ipResponseMode')
            , headers = parseJsonObject(getDataValue('pagerHeadersJson', 'ipHeadersJson'));

        const options = {}
            , sameOrigin = parseBoolean(sameOriginRaw)
            , stopOnEmpty = parseBoolean(stopOnEmptyRaw)
            , autoLoadOnInit = parseBoolean(autoLoadOnInitRaw);

        if (typeof endpoint === 'string' && endpoint.trim()) {
            options.endpoint = endpoint.trim();
        }

        if (typeof targetSelector === 'string' && targetSelector.trim()) {
            options.targetSelector = targetSelector.trim();
        }

        if (typeof sentinelSelector === 'string' && sentinelSelector.trim()) {
            options.sentinelSelector = sentinelSelector.trim();
        }

        if (typeof pageParam === 'string' && pageParam.trim()) {
            options.pageParam = pageParam.trim();
        }

        if (typeof pageSizeParam === 'string' && pageSizeParam.trim()) {
            options.pageSizeParam = pageSizeParam.trim();
        }

        if (typeof htmlPath === 'string' && htmlPath.trim()) {
            options.htmlPath = htmlPath.trim();
        }

        if (typeof itemsPath === 'string' && itemsPath.trim()) {
            options.itemsPath = itemsPath.trim();
        }

        if (typeof hasMorePath === 'string' && hasMorePath.trim()) {
            options.hasMorePath = hasMorePath.trim();
        }

        if (typeof nextPagePath === 'string' && nextPagePath.trim()) {
            options.nextPagePath = nextPagePath.trim();
        }

        if (typeof rootMargin === 'string' && rootMargin.trim()) {
            options.rootMargin = rootMargin.trim();
        }

        if (typeof credentials === 'string' && credentials.trim()) {
            options.credentials = credentials.trim();
        }

        if (typeof loadingClass === 'string' && loadingClass.trim()) {
            options.loadingClass = loadingClass.trim();
        }

        if (typeof disabledClass === 'string' && disabledClass.trim()) {
            options.disabledClass = disabledClass.trim();
        }

        if (headers) {
            options.headers = headers;
        }

        if (initialPage !== undefined) {
            options.initialPage = Math.max(1, Math.floor(parseNumber(initialPage, INFINITE_PAGER_DEFAULTS.initialPage)));
        }

        if (pageSize !== undefined) {
            options.pageSize = Math.max(1, Math.floor(parseNumber(pageSize, INFINITE_PAGER_DEFAULTS.pageSize)));
        }

        if (threshold !== undefined) {
            options.threshold = Math.max(0, parseNumber(threshold, INFINITE_PAGER_DEFAULTS.threshold));
        }

        if (method) options.method = method;
        if (mode) options.mode = mode;
        if (responseMode) options.responseMode = responseMode;
        if (sameOrigin !== undefined) options.sameOrigin = sameOrigin;
        if (stopOnEmpty !== undefined) options.stopOnEmpty = stopOnEmpty;
        if (autoLoadOnInit !== undefined) options.autoLoadOnInit = autoLoadOnInit;

        return options;
    };

    const getValidatedOptions = (element, options = {}) => {
        const mergedOptions = { ...INFINITE_PAGER_DEFAULTS, ...getOptionsFromData(element), ...options };

        if (!mergedOptions.endpoint) {
            throw new Error("Error: No se especifico la URL 'data-pager-endpoint'.");
        }

        if (!mergedOptions.targetSelector) {
            throw new Error("Error: No se especifico el selector 'data-pager-target'.");
        }

        mergedOptions.method = normalizeMethod(mergedOptions.method);
        mergedOptions.mode = normalizeMode(mergedOptions.mode);
        mergedOptions.responseMode = normalizeResponseMode(mergedOptions.responseMode);
        mergedOptions.initialPage = Math.max(1, Math.floor(parseNumber(mergedOptions.initialPage, INFINITE_PAGER_DEFAULTS.initialPage)));
        mergedOptions.pageSize = Math.max(1, Math.floor(parseNumber(mergedOptions.pageSize, INFINITE_PAGER_DEFAULTS.pageSize)));
        mergedOptions.threshold = Math.max(0, parseNumber(mergedOptions.threshold, INFINITE_PAGER_DEFAULTS.threshold));

        if (mergedOptions.autoLoadOnInit === undefined) {
            mergedOptions.autoLoadOnInit = mergedOptions.mode === 'scroll';
        }

        return mergedOptions;
    };

    /**
     * Plugin para cargar paginas incrementalmente en listados remotos.
     * @class InfinitePager
     */
    class InfinitePager {
        /**
         * @param {HTMLElement} element Trigger principal del plugin.
         * @param {Object} options Opciones validadas de inicializacion.
         */
        constructor(element, options) {
            this.subject = element;
            this.options = { ...INFINITE_PAGER_DEFAULTS, ...options };
            this.target = this.resolveTarget();
            this.sentinel = this.resolveSentinel();
            this.observer = null;
            this.abortController = null;
            this.isBound = false;
            this.isLoading = false;
            this.hasMore = true;
            this.currentPage = this.options.initialPage - 1;
            this.nextPage = this.options.initialPage;

            this.handleClick = this.handleClick.bind(this);
            this.handleIntersect = this.handleIntersect.bind(this);
        }

        /**
         * Resuelve el contenedor de resultados.
         * @returns {HTMLElement}
         */
        resolveTarget() {
            let target = null;

            try {
                target = document.querySelector(this.options.targetSelector);
            } catch (_error) {
                target = null;
            }

            if (!(target instanceof HTMLElement)) {
                throw new Error(`Error: No se encontro el target '${this.options.targetSelector}'.`);
            }

            return target;
        }

        /**
         * Resuelve o crea sentinel para modo scroll.
         * @returns {HTMLElement|null}
         */
        resolveSentinel() {
            if (this.options.mode !== 'scroll') return null;

            if (this.options.sentinelSelector) {
                try {
                    const externalSentinel = document.querySelector(this.options.sentinelSelector);
                    if (externalSentinel instanceof HTMLElement) {
                        return externalSentinel;
                    }
                } catch (_error) {
                    return null;
                }
            }

            const generatedSentinel = document.createElement('div');
            generatedSentinel.setAttribute('data-ip-generated-sentinel', '');
            generatedSentinel.setAttribute('aria-hidden', 'true');
            generatedSentinel.style.cssText = 'height:1px;width:100%;';
            this.target.insertAdjacentElement('afterend', generatedSentinel);
            return generatedSentinel;
        }

        /**
         * Construye URL final con parametros de paginacion.
         * @param {number} page Numero de pagina solicitada.
         * @returns {string}
         */
        buildUrl(page) {
            const endpoint = new URL(this.options.endpoint, window.location.href);

            if (this.options.sameOrigin && endpoint.origin !== window.location.origin) {
                throw new Error('Error: URL de otro origen bloqueada por sameOrigin.');
            }

            endpoint.searchParams.set(this.options.pageParam, String(page));
            endpoint.searchParams.set(this.options.pageSizeParam, String(this.options.pageSize));

            return endpoint.toString();
        }

        /**
         * Actualiza estado visual de carga.
         * @param {boolean} isLoading Estado de carga.
         * @returns {void}
         */
        setLoadingState(isLoading) {
            this.subject.classList.toggle(this.options.loadingClass, isLoading);
            this.target.classList.toggle(this.options.loadingClass, isLoading);

            if (this.options.mode === 'button') {
                this.subject.classList.toggle(this.options.disabledClass, isLoading || !this.hasMore);
                if ('disabled' in this.subject) {
                    this.subject.disabled = isLoading || !this.hasMore;
                }
            }

            this.subject.setAttribute('aria-busy', String(isLoading));
            this.target.setAttribute('aria-busy', String(isLoading));
        }

        /**
         * Extrae payload de respuesta segun responseMode.
         * @param {Response} response Respuesta fetch.
         * @returns {Promise<{isJson:boolean, json:any, html:string}>}
         */
        async readPayload(response) {
            if (this.options.responseMode === 'html') {
                return {
                    isJson: false,
                    json: null,
                    html: await response.text().catch(() => ''),
                };
            }

            if (this.options.responseMode === 'json') {
                return {
                    isJson: true,
                    json: await response.json().catch(() => null),
                    html: '',
                };
            }

            const contentType = (response.headers.get('Content-Type') || '').toLowerCase()
                , isJson = contentType.includes('json');

            if (isJson) {
                return {
                    isJson: true,
                    json: await response.json().catch(() => null),
                    html: '',
                };
            }

            return {
                isJson: false,
                json: null,
                html: await response.text().catch(() => ''),
            };
        }

        /**
         * Convierte payload recibido en HTML renderizable y metadatos de paginacion.
         * @param {{isJson:boolean, json:any, html:string}} payload Payload normalizado.
         * @returns {{html:string, hasMore:(boolean|undefined), nextPage:(number|undefined)}}
         */
        resolveRenderData(payload) {
            if (!payload.isJson) {
                return {
                    html: String(payload.html || ''),
                    hasMore: undefined,
                    nextPage: undefined,
                };
            }

            const json = payload.json || {}
                , hasMoreRaw = resolvePath(json, this.options.hasMorePath)
                , nextPageRaw = resolvePath(json, this.options.nextPagePath)
                , htmlRaw = resolvePath(json, this.options.htmlPath)
                , itemsRaw = resolvePath(json, this.options.itemsPath);

            let html = '';

            if (typeof htmlRaw === 'string') {
                html = htmlRaw;
            } else if (Array.isArray(itemsRaw)) {
                if (typeof this.options.renderItem === 'function') {
                    html = itemsRaw.map((item, index) => this.options.renderItem(item, index, this.subject)).join('');
                } else {
                    html = itemsRaw.map((item) => `<pre data-ip-fallback-item>${escapeHtml(JSON.stringify(item, null, 2))}</pre>`).join('');
                }
            }

            return {
                html,
                hasMore: typeof hasMoreRaw === 'boolean' ? hasMoreRaw : undefined,
                nextPage: Number.isFinite(Number(nextPageRaw)) ? Number(nextPageRaw) : undefined,
            };
        }

        /**
         * Inserta HTML en target y retorna cantidad aproximada de nodos agregados.
         * @param {string} html HTML a insertar.
         * @returns {number}
         */
        appendHtml(html) {
            if (!html) return 0;

            const template = document.createElement('template');
            template.innerHTML = html;
            const nodes = Array.from(template.content.childNodes);

            this.target.append(...nodes);
            return nodes.length;
        }

        /**
         * Ejecuta carga de la siguiente pagina si el estado lo permite.
         * @param {Event|null} [triggerEvent=null] Evento disparador opcional.
         * @returns {Promise<boolean>} True cuando agrega contenido nuevo.
         */
        async loadNext(triggerEvent = null) {
            if (this.isLoading || !this.hasMore) return false;

            const requestPage = this.nextPage
                , requestUrl = this.buildUrl(requestPage)
                , detail = {
                    page: requestPage,
                    url: requestUrl,
                    target: this.target,
                    trigger: this.subject,
                    originalEvent: triggerEvent,
                }
                , beforeEvent = new CustomEvent('before.plugin.infinitePager', {
                    cancelable: true,
                    detail,
                });

            this.options.beforeRequest && this.options.beforeRequest(detail, this.subject);
            if (!this.subject.dispatchEvent(beforeEvent)) {
                return false;
            }

            this.isLoading = true;
            this.setLoadingState(true);

            let appendedCount = 0;

            try {
                this.abortController = new AbortController();

                const response = await fetch(requestUrl, {
                    method: this.options.method,
                    headers: this.options.headers || undefined,
                    credentials: this.options.credentials,
                    signal: this.abortController.signal,
                });

                if (!response.ok) {
                    throw new Error(`Error: InfinitePager recibio estado HTTP ${response.status}.`);
                }

                const payload = await this.readPayload(response)
                    , renderData = this.resolveRenderData(payload);

                appendedCount = this.appendHtml(renderData.html);
                this.currentPage = requestPage;
                this.nextPage = renderData.nextPage || (requestPage + 1);

                if (renderData.hasMore === true || renderData.hasMore === false) {
                    this.hasMore = renderData.hasMore;
                } else if (this.options.stopOnEmpty && appendedCount === 0) {
                    this.hasMore = false;
                }

                const successDetail = {
                    ...detail,
                    page: requestPage,
                    nextPage: this.nextPage,
                    appendedCount,
                    hasMore: this.hasMore,
                    response,
                    payload: payload.isJson ? payload.json : renderData.html,
                };

                this.options.onSuccess && this.options.onSuccess(successDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('success.plugin.infinitePager', {
                    detail: successDetail,
                }));

                if (!this.hasMore) {
                    this.options.onEnd && this.options.onEnd(successDetail, this.subject);
                    this.subject.dispatchEvent(new CustomEvent('end.plugin.infinitePager', {
                        detail: successDetail,
                    }));
                }

                return appendedCount > 0;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return false;
                }

                const errorDetail = {
                    ...detail,
                    page: requestPage,
                    error,
                };

                this.options.onError && this.options.onError(errorDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('error.plugin.infinitePager', {
                    detail: errorDetail,
                }));

                return false;
            } finally {
                this.abortController = null;
                this.isLoading = false;
                this.setLoadingState(false);

                const completeDetail = {
                    ...detail,
                    page: requestPage,
                    appendedCount,
                    hasMore: this.hasMore,
                };

                this.options.onComplete && this.options.onComplete(completeDetail, this.subject);
                this.subject.dispatchEvent(new CustomEvent('complete.plugin.infinitePager', {
                    detail: completeDetail,
                }));
            }
        }

        /**
         * Reinicia estado interno de paginacion.
         * @param {Object} [options={}] Opciones del reset.
         * @param {boolean} [options.clearTarget=false] Si limpia contenido target.
         * @returns {void}
         */
        reset(options = {}) {
            const { clearTarget = false } = options;

            this.currentPage = this.options.initialPage - 1;
            this.nextPage = this.options.initialPage;
            this.hasMore = true;

            if (clearTarget) {
                this.target.innerHTML = '';
            }

            this.setLoadingState(false);
        }

        /**
         * Handler click para modo button.
         * @param {MouseEvent} event Evento click.
         * @returns {void}
         */
        handleClick(event) {
            event.preventDefault();
            this.loadNext(event);
        }

        /**
         * Handler de IntersectionObserver para modo scroll.
         * @param {IntersectionObserverEntry[]} entries Entradas observadas.
         * @returns {void}
         */
        handleIntersect(entries) {
            const hasIntersection = entries.some((entry) => entry.isIntersecting);
            if (!hasIntersection) return;
            this.loadNext();
        }

        /**
         * Crea observer para modo scroll.
         * @returns {void}
         */
        bindObserver() {
            if (this.options.mode !== 'scroll' || !(this.sentinel instanceof HTMLElement)) return;

            this.observer = new IntersectionObserver(this.handleIntersect, {
                root: null,
                rootMargin: this.options.rootMargin,
                threshold: this.options.threshold,
            });

            this.observer.observe(this.sentinel);
        }

        /**
         * Remueve observer activo.
         * @returns {void}
         */
        unbindObserver() {
            if (!(this.observer instanceof IntersectionObserver)) return;
            this.observer.disconnect();
            this.observer = null;
        }

        /**
         * Define listeners activos de la instancia.
         * @returns {Array<[string, EventListenerOrEventListenerObject, (boolean|undefined)]>}
         */
        getListeners() {
            if (this.options.mode === 'button') {
                return [['click', this.handleClick]];
            }

            return [];
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
         * Vincula listeners/observer de la instancia.
         * @returns {void}
         */
        bind() {
            if (this.isBound) return;

            this.applyListeners('addEventListener');
            this.bindObserver();
            this.isBound = true;
            this.setLoadingState(false);

            if (this.options.autoLoadOnInit === true) {
                this.loadNext();
            }
        }

        /**
         * Desvincula listeners/observer y cancela request en curso.
         * @returns {void}
         */
        unbind() {
            if (!this.isBound) return;

            this.applyListeners('removeEventListener');
            this.unbindObserver();

            if (this.abortController instanceof AbortController) {
                this.abortController.abort();
                this.abortController = null;
            }

            this.isBound = false;
            this.isLoading = false;
            this.setLoadingState(false);
        }

        /**
         * Destruye instancia y libera referencias internas.
         * @returns {void}
         */
        destroy() {
            this.unbind();

            if (this.sentinel instanceof HTMLElement && this.sentinel.hasAttribute('data-ip-generated-sentinel')) {
                this.sentinel.remove();
            }

            INSTANCES.delete(this.subject);
        }

        /**
         * Inicializa una instancia sobre un elemento sujeto.
         * @param {HTMLElement} element Elemento a inicializar.
         * @param {Object} [options={}] Opciones de sobreescritura.
         * @returns {InfinitePager}
         */
        static init(element, options = {}) {
            if (!(element instanceof HTMLElement)) {
                throw new Error('Error: InfinitePager.init requiere un HTMLElement.');
            }

            const currentInstance = INSTANCES.get(element);
            if (currentInstance) return currentInstance;

            const validatedOptions = getValidatedOptions(element, options)
                , instance = new InfinitePager(element, validatedOptions);

            INSTANCES.set(element, instance);
            instance.bind();
            return instance;
        }

        /**
         * Retorna la instancia asociada a un elemento.
         * @param {HTMLElement} element Elemento sujeto.
         * @returns {InfinitePager|null}
         */
        static getInstance(element) {
            if (!(element instanceof HTMLElement)) return null;
            return INSTANCES.get(element) || null;
        }

        /**
         * Destruye la instancia asociada a un elemento.
         * @param {HTMLElement} element Elemento sujeto.
         * @returns {boolean}
         */
        static destroy(element) {
            const instance = InfinitePager.getInstance(element);
            if (!instance) return false;

            instance.destroy();
            return true;
        }

        /**
         * Inicializa todas las instancias dentro de una raiz.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz de busqueda.
         * @param {Object} [options={}] Opciones compartidas.
         * @returns {InfinitePager[]}
         */
        static initAll(root = document, options = {}) {
            return getSubjects(root).map((element) => InfinitePager.init(element, options));
        }

        /**
         * Destruye todas las instancias dentro de una raiz.
         * @param {Document|Element|ParentNode} [root=document] Nodo raiz de busqueda.
         * @returns {number}
         */
        static destroyAll(root = document) {
            return getSubjects(root).reduce((destroyedCount, element) => {
                return InfinitePager.destroy(element) ? destroyedCount + 1 : destroyedCount;
            }, 0);
        }
    }

    const startAutoInit = () => {
        InfinitePager.initAll(document);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    PENDING_REMOVALS.delete(node);
                    InfinitePager.initAll(node);
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
            const observeRootElement = document.querySelector('[data-pp-observe-root-infinite-pager]');
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

    window.InfinitePager = InfinitePager;
})();
