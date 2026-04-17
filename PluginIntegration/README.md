# Integracion de plugins

Este directorio contiene un ejemplo practico de como orquestar varios plugins en una sola pantalla sin convertirlos en un plugin monolitico.

Archivo principal:
- test-plugin-integration.html

## Plugins combinados

- Modal: contenedor de UI para flujos de confirmacion o captura de datos.
- FormValidate: valida reglas declaradas por atributos data-fv-* y bloquea submit cuando hay errores.
- ConfirmAction: solicita confirmacion antes de ejecutar acciones sensibles (submit/click).
- FormRequest: ejecuta el request asincrono y renderiza respuesta en el target.
- RequestState: muestra estados visuales de loading/success/error/idle.
- NotificationPush: dispara un push visual y payload de seguimiento.

## Principio recomendado

Asignar un rol claro a cada plugin:
- Owner del request: FormRequest.
- Owner de validacion: FormValidate.
- Owner de confirmacion: ConfirmAction.
- Owner de estado visual: RequestState.
- Owner de notificaciones: NotificationPush.

Con este enfoque se evita duplicar responsabilidades y es mas facil depurar.

## Orden de flujo sugerido

1. Usuario intenta enviar formulario.
2. FormValidate valida y cancela si hay errores.
3. ConfirmAction solicita confirmacion (si aplica).
4. FormRequest realiza la solicitud.
5. RequestState refleja estado del ciclo.
6. NotificationPush comunica resultado al usuario.

## Tips para combinar plugins

- Evita tener dos plugins enviando el mismo request.
- Usa eventos custom para puentes entre plugins (before/success/error/complete).
- Manten targets de UI separados para estado, respuesta y notificaciones.
- En demos locales, usa mocks de fetch para no depender de backend.

## Nota

Este ejemplo esta pensado para aprendizaje y pruebas de integracion. Puedes copiar el patron y ajustarlo por modulo o por pantalla en tu proyecto real.
