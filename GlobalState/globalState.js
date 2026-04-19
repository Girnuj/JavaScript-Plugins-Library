
/**
 * @fileoverview Micro-plugin para gestión de estado global y pub/sub de eventos.
 * @version 1.0
 * @since 2026
 * @author Samuel Montenegro
 * @module GlobalState
 */
(function () {
    'use strict';

    /**
     * @class GlobalState
     * @classdesc Permite compartir datos y reaccionar a cambios de estado o eventos custom entre vistas y componentes.
     * @fires changed.plugin.globalState
     */
    class GlobalState {
        /**
         * @private
         */
        static _state = {};
        /**
         * @private
         */
        static _listeners = {};
        /**
         * @private
         */
        static _events = {};

        /**
         * Guarda un valor en el estado global y notifica a los suscriptores de la clave.
         * @param {string} key - Clave del estado.
         * @param {*} value - Valor a guardar.
         * @fires changed.plugin.globalState
         */
        static set(key, value) {
            this._state[key] = value;
            // Notificar listeners directos
            if (this._listeners[key]) {
                this._listeners[key].forEach(fn => fn(value));
            }
            // Disparar evento custom global
            document.dispatchEvent(new CustomEvent('changed.plugin.globalState', {
                detail: { key, value }
            }));
        }

        /**
         * Obtiene el valor de una clave del estado global.
         * @param {string} key - Clave del estado.
         * @returns {*} Valor almacenado o undefined.
         */
        static get(key) {
            return this._state[key];
        }

        /**
         * Suscribe una función a los cambios de una clave del estado global.
         * @param {string} key - Clave a observar.
         * @param {function} callback - Función a ejecutar cuando cambie el valor.
         */
        static subscribe(key, callback) {
            if (!this._listeners[key]) this._listeners[key] = [];
            this._listeners[key].push(callback);
        }

        /**
         * Elimina una suscripción a una clave del estado global.
         * @param {string} key - Clave observada.
         * @param {function} callback - Función a eliminar.
         */
        static unsubscribe(key, callback) {
            if (!this._listeners[key]) return;
            this._listeners[key] = this._listeners[key].filter(fn => fn !== callback);
        }

        /**
         * Publica un evento custom global (pub/sub).
         * @param {string} event - Nombre del evento.
         * @param {*} payload - Datos a enviar a los suscriptores.
         */
        static publish(event, payload) {
            if (this._events[event]) {
                this._events[event].forEach(fn => fn(payload));
            }
        }

        /**
         * Suscribe una función a un evento custom global.
         * @param {string} event - Nombre del evento.
         * @param {function} callback - Función a ejecutar cuando se publique el evento.
         */
        static on(event, callback) {
            if (!this._events[event]) this._events[event] = [];
            this._events[event].push(callback);
        }

        /**
         * Elimina una suscripción a un evento custom global.
         * @param {string} event - Nombre del evento.
         * @param {function} callback - Función a eliminar.
         */
        static off(event, callback) {
            if (!this._events[event]) return;
            this._events[event] = this._events[event].filter(fn => fn !== callback);
        }

        /**
         * Limpia todo el estado y las suscripciones (para testing o reinicio).
         */
        static clear() {
            for (const k in this._state) delete this._state[k];
            for (const k in this._listeners) delete this._listeners[k];
            for (const k in this._events) delete this._events[k];
        }
    }

    window.GlobalState = GlobalState;
})();
