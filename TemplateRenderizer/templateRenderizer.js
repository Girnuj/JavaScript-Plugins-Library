/**
 * @fileoverview Renderizador de plantillas simple para reemplazo de variables en HTML.
 * @version 3.0
 * @since 2026
 * @author Samuel Montenegro
 * @module TemplateRenderizer
 */
(function () {
	'use strict';

	/**
	 * Expresión regular para extraer nombres de propiedades en la plantilla.
	 * @const
	 */
	const rxExtractNames = /{{(?<proppath>([\w-]+\.)*\w+)}}/gm;

	/**
	 * Obtiene el valor de una propiedad anidada de un objeto de forma segura.
	 * @param {Object} obj - Objeto origen.
	 * @param {string} path - Ruta de la propiedad (ej: 'foo.bar.baz').
	 * @returns {*} Valor de la propiedad o cadena vacía si no existe.
	 */
	function getNestedProperty(obj, path) {
		return path.split('.').reduce(function (acc, part) {
			return (acc && acc[part] !== undefined) ? acc[part] : '';
		}, obj);
	}

	/**
	 * Extrae nombres de propiedades de una plantilla HTML.
	 * @param {string} html - HTML de la plantilla.
	 * @returns {string[]} Lista de nombres de propiedades.
	 */
	function extractPropertyNames(html) {
		const props = new Set()
			, matches = Array.from(html.matchAll(rxExtractNames));
		for (let i =0; i < matches.length; i++) {
			if (matches[i].groups && matches[i].groups.proppath) {
				props.add(matches[i].groups.proppath);
			}
		}
		return Array.from(props);
	}

	/**
	 * Clase TemplateRenderizer para renderizar plantillas HTML con datos dinámicos.
	 *
	 * Flujo:
	 * 1. Obtiene plantilla desde selector CSS.
	 * 2. Resuelve placeholders `{{prop}}` detectados o definidos por configuración.
	 * 3. Renderiza HTML final reemplazando valores anidados del objeto de datos.
	 * @class TemplateRenderizer
	 */
	class TemplateRenderizer {
		/**
		 * Crea una instancia de TemplateRenderizer.
		 * @param {Object} options - Opciones de configuración.
		 * @param {string} options.templateSelector - Selector CSS para la plantilla.
		 * @param {string[]} [options.propertiesNames] - Lista opcional de nombres de propiedades a reemplazar.
		 */
		constructor(options) {
			const template = document.querySelector(options.templateSelector);
			if (!template) {
				throw new Error(`Error: No se encontró la plantilla '${options.templateSelector}'.`);
			}

			this.options = options;
			this.template = template;
			this.properties = {
				names: this.options.propertiesNames || [],
				rx: []
			};

			if (this.properties.names.length ===0) {
				this.properties.names = extractPropertyNames(this.template.innerHTML);
			}

			this.properties.rx = this.properties.names.map(function (n) {
				return new RegExp('{{' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '}}', 'gm');
			});

			/**
			 * Expresión regular para corregir bug de Edge con input.
			 * @type {RegExp}
			 */
			this.rxEdgeInputBugFix = /edge_bug_input/gm;
		}

		/**
		 * Renderiza la plantilla con los datos proporcionados.
		 * @param {Object} data - Objeto con los datos a reemplazar en la plantilla.
		 * @returns {string} HTML renderizado.
		 */
		render(data) {
			let templHtml = this.template.innerHTML;
			for (let i =0; i < this.properties.names.length; i++) {
				templHtml = templHtml.replace(this.properties.rx[i], () => {
					return getNestedProperty(data, this.properties.names[i]);
				});
			}
			return templHtml.replace(this.rxEdgeInputBugFix, 'input');
		}
	}

	// Exponer al scope global
	window.templateRenderizer = TemplateRenderizer;

})();
