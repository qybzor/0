# Qybzor — estructura SaaS multiempresa

Este paquete convierte el prototipo visual en una base de proyecto SaaS: workspaces por negocio, catálogo de planes, suscripciones recurrentes con Mercado Pago, webhook de facturación y frontend para iniciar sesión/crear negocio/contratar.

## Planes propuestos (COP/mes)

| Plan | Precio | Límites iniciales |
|---|---:|---|
| Inicial | Gratis | 1 usuario, 100 clientes, 30 citas/mes |
| Emprendedor | $24.900 | 2 usuarios, 500 clientes, 300 citas/mes |
| Profesional | $49.900 | 2 usuarios, 2.000 clientes, 1.000 citas/mes, 1.000 mensajes WhatsApp/mes |
| Empresa | $119.900 | 10 usuarios, 20.000 clientes, 10.000 citas/mes, 5.000 mensajes WhatsApp/mes |
| Corporativo | $249.900 | 30 usuarios, 100.000 clientes, 50.000 citas/mes, 20.000 mensajes WhatsApp/mes |

Los importes y límites de los cinco planes se pueden cambiar en `supabase/migrations/202611150003_five_subscription_plans.sql`. Son una propuesta de producto, no un estudio de mercado ni una cotización final. Los cobros de Meta/WhatsApp y los impuestos pueden ser adicionales.

## Estructura

```text
qybzor_saas/
├── index.html
├── billing-client.js
├── data-client.js
├── README.md
├── .env.example
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 202611150000_base_schema.sql
    │   ├── 202611150001_saas_billing.sql
    │   ├── 202611150002_nexora_connect.sql
    │   └── 202611150003_five_subscription_plans.sql
    └── functions/
        ├── create-subscription/index.ts
        ├── mercadopago-webhook/index.ts
        ├── whatsapp-webhook/index.ts
        ├── save-whatsapp-channel/index.ts
        └── connect-whatsapp-embedded/index.ts
```

## Antes de usar

1. Crea un proyecto Supabase.
2. Ejecuta las migraciones en orden desde `supabase/migrations` en SQL Editor. Si ya aplicaste las migraciones anteriores, ejecuta únicamente `202611150003_five_subscription_plans.sql` para cargar los cinco planes.
3. Publica únicamente `index.html` y `billing-client.js` juntos en un hosting HTTPS. No abras el HTML con `file://`; usa un servidor local o hosting.
4. En Supabase, despliega las cuatro Edge Functions que aparecen abajo.
5. Configura los secretos del servidor:

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="TU_ACCESS_TOKEN_PRIVADO"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="TU_WEBHOOK_SECRET"
supabase secrets set APP_BASE_URL="https://TU-DOMINIO"
supabase secrets set OPENAI_API_KEY="TU_CLAVE_OPENAI"
supabase secrets set WHATSAPP_TOKEN_ENCRYPTION_KEY="BASE64_32_BYTES"
supabase secrets set META_WEBHOOK_VERIFY_TOKEN="FRASE_ALEATORIA_LARGA"
supabase secrets set META_APP_SECRET="APP_SECRET_META"
supabase secrets set META_GRAPH_VERSION="v27.0"
supabase secrets set OPENAI_MODEL="gpt-4.1-mini"
```

Supabase proporciona `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al runtime de Edge Functions. No pongas `service_role`, el Access Token de Mercado Pago ni el secreto de webhook en el navegador o en Git.

Despliegue:

```bash
supabase functions deploy create-subscription
supabase functions deploy mercadopago-webhook --no-verify-jwt
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy save-whatsapp-channel
supabase functions deploy connect-whatsapp-embedded
```

6. En el panel de integraciones de Mercado Pago, configura el webhook para eventos de suscripción y apunta a:

`https://TU-PROYECTO.supabase.co/functions/v1/mercadopago-webhook`

7. En Meta configura el callback de WhatsApp: `https://TU-PROYECTO.supabase.co/functions/v1/whatsapp-webhook`, usando `META_WEBHOOK_VERIFY_TOKEN`, y suscribe el campo `messages`.
8. En Qybzor, abre **Planes y facturación**, pega Project URL y la clave pública Supabase, inicia sesión, crea/selecciona un negocio y elige Emprendedor, Profesional, Empresa o Corporativo.

## Flujo de cobro

- El navegador solicita checkout a `create-subscription` con el usuario autenticado.
- La Edge Function comprueba la sesión y que el usuario sea owner/admin del negocio.
- El precio se consulta en `subscription_plans` desde el servidor; no se acepta el importe del navegador.
- Mercado Pago crea la suscripción y devuelve `init_point`.
- El cliente completa la autorización en Mercado Pago.
- El webhook valida `x-signature`, consulta el estado en la API de Mercado Pago y actualiza la suscripción interna.
- `current_business_plan(business_id)` devuelve plan, funciones y límites para el negocio.
- Qybzor CONNECT cifra el token de cada número con AES-GCM y solo permite guardar/atender canales con plan Profesional, Empresa o Corporativo activo.

## Estado y límites conocidos

- Este paquete prepara la capa de facturación recurrente. No incluye credenciales, cuenta de vendedor, dominio, proyecto Supabase ni configuración real de Mercado Pago.
- El panel Qybzor guarda clientes, servicios, solicitudes, citas, perfil, preferencias y tema en localStorage del navegador. Esto es almacenamiento local de prototipo: no sincroniza entre dispositivos ni separa de forma segura usuarios distintos. Para producción, conectar autenticación Supabase, tablas con RLS y lecturas/escrituras desde Edge Functions o el cliente autorizado.
- La tabla `business_subscriptions` y la función de plan forman el núcleo de entitlement. La cuota mensual de mensajes entrantes de WhatsApp sí se consume en el backend; los límites de clientes, miembros y citas todavía deben conectarse a las operaciones correspondientes antes del lanzamiento.
- El webhook debe probarse en sandbox y con eventos reales de prueba antes de habilitar producción. Añade monitoreo, reintentos y conciliación periódica de suscripciones como tarea de producción.
- Para una plataforma multiempresa real, revisa todas las políticas RLS y asegúrate de que cada consulta incluya el `business_id` autorizado.
- El acceso a cuentas de cobro, contratos y configuración financiera debe realizarlo la persona adulta responsable del negocio y titular de la cuenta de Mercado Pago, respetando sus requisitos de verificación.

## Referencias oficiales

- Mercado Pago Suscripciones: https://www.mercadopago.com.co/developers/es/docs/subscriptions/overview
- Crear suscripción: https://www.mercadopago.com.co/developers/es/reference/online-payments/subscriptions/create-preapproval/post
- Webhooks: https://www.mercadopago.com.co/developers/es/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- Supabase Edge Functions: https://supabase.com/docs/guides/functions


## Cambios de esta versión

- Se añadió una ventana de bienvenida con los cinco planes al entrar a la página.
- Se añadió acceso permanente a Términos y Condiciones y Aviso de Privacidad.
- `index.html` es la entrada para GitHub Pages; mantenlo junto a `billing-client.js`.
- Los precios y límites son propuestas de producto y deben validarse antes de cobrar.
- El texto legal contiene campos `[COMPLETAR]` que deben completarse con los datos reales del responsable antes de publicar la versión comercial.


## Cambios de Qybzor

- Marca visible actualizada a Qybzor.
- El saludo ya no contiene un nombre fijo: toma el nombre del perfil de Supabase cuando se inicia sesión, o puede configurarse desde Configuración → Tu perfil y negocio. Si no hay nombre, aparece “bienvenido”.
- Temas de color: Violeta, Océano, Esmeralda, Rosa y Ámbar; la selección queda guardada en el navegador.
- Clientes, servicios, solicitudes y citas se pueden crear y conservar en el navegador; hay acciones para eliminar registros y actualizar estados de solicitudes.
- Estadísticas y actividad se calculan con los registros locales.
- Las automatizaciones guardan sus preferencias, pero su ejecución automática requiere backend.

## Pendiente antes de producción

1. Configurar Supabase Auth y perfiles por usuario; el nombre de esta versión se guarda localmente y no se obtiene todavía de una sesión autenticada.
2. Conectar clientes, servicios, solicitudes, citas y ajustes a PostgreSQL con políticas RLS por negocio.
3. Desplegar y probar las funciones Edge, webhooks, WhatsApp/Meta y proveedor de IA.
4. Completar pruebas de Mercado Pago, notificaciones de pago y cancelación de suscripciones.
5. Aplicar y verificar límites de cada plan en el backend; los precios son propuestas hasta su aprobación comercial.
6. Completar los datos legales pendientes y revisión profesional antes de aceptar clientes reales.

**Importante:** no introduzcas información sensible de clientes ni claves privadas en esta versión estática. El almacenamiento local es solo para pruebas en el mismo navegador.


## Eliminación automática de citas

Qybzor elimina las citas locales cuatro horas después de su hora programada. Si el panel está cerrado, la limpieza local se realiza la próxima vez que se abra. Para eliminar también los registros del servidor aunque nadie tenga el panel abierto, habilita `pg_cron` en Supabase y ejecuta la migración `supabase/migrations/202611150004_auto_delete_appointments.sql`. El trabajo del servidor revisa y elimina las citas vencidas cada minuto. La hora de referencia es `appointments.starts_at` (hora de inicio de la reserva).

## Conexión de datos reales (versión de integración)

Esta versión incluye `data-client.js`: al iniciar sesión, seleccionar un negocio y cargarlo desde Supabase, clientes, servicios, solicitudes y citas se leen desde PostgreSQL. Las altas, cambios de estado, eliminaciones y nuevas citas/servicios se sincronizan con las tablas correspondientes. El navegador conserva una copia local de trabajo, pero la fuente que se carga al seleccionar un negocio es Supabase. La sincronización requiere usuario autenticado, negocio seleccionado, las migraciones aplicadas y las políticas RLS activas.

### Migración adicional

Ejecuta `supabase/migrations/202611150005_real_data_fields.sql` después de las migraciones anteriores. Añade duración de servicios y campos de cita que usa la integración. No inserta clientes, servicios, reservas ni conversaciones de muestra.

### Límites que siguen pendientes de activación

- Los datos de clientes/servicios/solicitudes/citas ya tienen capa de sincronización Supabase, pero debe probarse en un proyecto real con dos usuarios y negocios distintos antes de producción.
- WhatsApp necesita una aplicación Meta real, número habilitado, token, webhook HTTPS y revisión de permisos. El panel no demuestra que Meta esté conectado hasta que la cuenta lo confirme.
- Mercado Pago necesita cuenta de vendedor, credenciales de producción y webhooks probados. No se deben cobrar clientes hasta validar el flujo de autorización, cobro, renovación, cancelación y reembolso.
- Los precios de planes que aparecen en la interfaz siguen siendo valores propuestos por el propietario del producto, no tarifas verificadas ni cobros activos.
- El perfil, preferencias y automatizaciones del panel aún contienen ajustes locales; no se debe interpretar que todas las preferencias ya se sincronizan entre dispositivos.
- El módulo de agenda debe someterse a pruebas de concurrencia/choque de horarios y las políticas de acceso deben auditarse antes de aceptar reservas públicas.

No se incluyen registros de demostración. Los indicadores empiezan en cero y solo muestran registros creados en el negocio seleccionado.

## Acceso obligatorio y cuenta administradora oficial

- La primera pantalla ahora es iniciar sesión / registrarse. El panel no queda disponible hasta que Supabase confirme una sesión válida.
- La URL del proyecto y la clave pública (anon/publishable) se guardan en el navegador para no tener que escribirlas cada vez. Nunca guardes `service_role`, tokens de Mercado Pago ni secretos de Meta en el frontend.
- Ejecuta la migración `202611150006_platform_admin_account.sql` después de las anteriores. Esta crea el rol global `platform_admins` protegido por RLS y asigna el rol únicamente al usuario autenticado cuyo correo verificado sea `qybzor@gmail.com` (incluye una asignación retroactiva si ya existía en Supabase Auth).
- La migración NO crea por sí sola un buzón ni una identidad. Si `qybzor@gmail.com` todavía no aparece en Supabase → Authentication → Users, primero debe registrarse desde la pantalla de Qybzor y confirmar el correo que llegue a esa bandeja. Si ya existe, basta ejecutar la migración para otorgar el rol.
- La aplicación consulta el rol en la tabla protegida y muestra “Administradora de Qybzor”. No se confía en el nombre ni en los metadatos editables del navegador para conceder permisos.
- El botón “Salir” cierra la sesión y vuelve a la pantalla de acceso.

**Importante:** este cambio prepara el inicio de sesión real y la asignación segura del rol. No crea la cuenta de correo `Qybzor@gmail.com`, no confirma su propiedad ni configura las credenciales de Supabase/Meta/Mercado Pago. Esas cuentas y sus verificaciones deben ser gestionadas por su titular y, por tratarse de servicios financieros/contratos, con apoyo de una persona adulta responsable.


## WhatsApp Business por negocio (Meta Embedded Signup)

Qybzor CONNECT usa una conexión separada por `business_id`: cada negocio vincula su propia cuenta/número desde el botón **Vincular mi WhatsApp Business con Meta**. No se solicitan contraseñas ni tokens al propietario. El navegador recibe el código temporal de autorización de Embedded Signup; la Edge Function `connect-whatsapp-embedded` lo intercambia en el servidor, verifica el número, suscribe la WABA a la aplicación y cifra el token con AES-GCM antes de guardarlo. La tabla `whatsapp_channels` no tiene políticas de lectura para el navegador, por lo que el token cifrado no se expone al cliente.

### Preparación obligatoria en Meta (una vez para Qybzor)

1. Una persona adulta responsable del proyecto debe administrar la aplicación y la cuenta comercial de Meta, aceptar sus términos y completar las verificaciones que Meta solicite.
2. En Meta for Developers, crea/configura una aplicación de tipo Business y agrega el producto WhatsApp. Habilita WhatsApp Embedded Signup / Business Login for WhatsApp y crea una configuración de Embedded Signup. Configura los permisos que correspondan al flujo aprobado por Meta, como `whatsapp_business_management` y `whatsapp_business_messaging`.
3. Configura el producto Webhooks para el objeto `whatsapp_business_account`, con el callback `https://TU-PROYECTO.supabase.co/functions/v1/whatsapp-webhook`, el mismo `META_WEBHOOK_VERIFY_TOKEN` que guardarás en Supabase y suscribe el campo `messages`.
4. Completa la configuración de la aplicación (dominio, URL HTTPS, privacidad, términos, revisión de permisos y acceso avanzado) que Meta requiera para permitir que negocios externos usen Embedded Signup. El modo de desarrollo y los números de prueba no habilitan a todos los negocios.
5. El `App ID` y el `Configuration ID` son valores públicos: introdúcelos en Qybzor → Qybzor CONNECT. El `App Secret` nunca se introduce en la web; solo va como secreto del servidor.

### Secretos en Supabase

Configura los valores reales desde Supabase Edge Function Secrets (o `supabase secrets set`):

- `META_APP_ID`: el mismo App ID público de la aplicación Meta.
- `META_APP_SECRET`: secreto privado de esa aplicación.
- `META_WEBHOOK_VERIFY_TOKEN`: frase aleatoria larga para validar el GET inicial del webhook.
- `META_GRAPH_VERSION`: `v27.0` (ajústalo a la versión que tu aplicación tenga disponible y probada en Meta).
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`: clave base64 que represente exactamente 32 bytes aleatorios. No uses una contraseña humana.
- `OPENAI_API_KEY`: clave privada del proveedor de IA, solo en servidor, para respuestas automáticas.

No publiques estos valores en GitHub, HTML, JavaScript del navegador, capturas ni chats.

### Migración y despliegue

Ejecuta `supabase/migrations/202611150007_whatsapp_embedded_signup.sql` después de las migraciones `000` a `006`. Despliega:

```bash
supabase functions deploy connect-whatsapp-embedded
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

La función de conexión exige una sesión autenticada y que la persona sea owner/admin del negocio. Además, valida que ese negocio tenga un plan activo con WhatsApp habilitado. El webhook busca el canal por `phone_number_id`, determina el `business_id` correspondiente y procesa sus mensajes con los servicios, horarios y agenda de ese negocio. Las conversaciones se consultan con RLS para miembros del mismo negocio.

### Cómo lo usa cada negocio

1. Inicia sesión en Qybzor y crea/selecciona su negocio.
2. Abre Qybzor CONNECT.
3. Introduce el App ID y Configuration ID que pertenecen a la aplicación oficial de Qybzor.
4. Pulsa **Vincular mi WhatsApp Business con Meta** y completa el flujo de Meta con la cuenta del negocio.
5. Cuando Meta confirme la autorización, Qybzor guarda el canal para ese negocio. Los mensajes entrantes se reciben por el webhook y la IA responde usando los datos reales de ese negocio.

Cada negocio debe vincular una cuenta/número que tenga derecho a administrar. Los cargos de mensajería de Meta y los costos de IA pueden ser independientes de la suscripción Qybzor.

### Límites que debes conocer antes de producción

- Este repositorio implementa el flujo de integración, pero **no significa que Meta ya haya aprobado la app ni que los mensajes reales estén activos**. Para probarlo se necesitan App ID, App Secret, Configuration ID, permisos y webhook configurados en la cuenta real de Meta.
- La revisión de Meta, el acceso avanzado y la habilitación de Embedded Signup para negocios externos pueden requerir verificación empresarial y revisión de la integración.
- El webhook actual responde automáticamente con IA a mensajes de texto y puede consultar servicios y reservas. Aún no incluye un panel completo de respuesta manual por parte del personal, ni procesamiento de imágenes, audio o documentos.
- Si el asistente detecta que la persona quiere hablar con un humano, la respuesta actual lo indica, pero no crea todavía una alerta operativa al equipo.
- Antes de cobrar a negocios o conectar números de terceros, prueba el flujo con cuentas de prueba autorizadas, valida consentimiento y privacidad, política de mensajería, ventana de atención y plantillas aprobadas de Meta.
- No reutilices el mismo número entre negocios. La base de datos mantiene un `phone_number_id` único y una conexión por negocio.

Documentación oficial: [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/) · [WhatsApp Business Account API](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/).


## Catálogo de servicios y precios predeterminados

Cada negocio administra su catálogo desde **Servicios**. Al crear un registro se define nombre, descripción, precio predeterminado en COP y duración estimada. El catálogo es por negocio y se sincroniza con `public.services` en Supabase.

La función `whatsapp-webhook` consulta únicamente los servicios activos de ese negocio. Cuando un cliente pregunta por los precios, el bot responde con el importe guardado en el catálogo; cuando el precio es `0`, informa que requiere cotización o valoración y nunca lo presenta como gratuito. En la confirmación de una reserva también comunica el precio registrado.

Para instalaciones existentes, ejecutar en Supabase SQL Editor la migración `supabase/migrations/202611150008_service_catalog_prices.sql` y volver a desplegar la Edge Function `whatsapp-webhook` para activar las reglas de precios en WhatsApp.


## Proyecto Supabase preconfigurado

Esta copia está configurada para conectarse al proyecto Supabase indicado por el propietario:
- Project URL: `https://knvrbldnxxeyweavdwuf.supabase.co`
- La publishable key pública se incluye en `billing-client.js` y el panel intenta conectarse automáticamente al abrirse.

La clave publishable es pública y puede estar en el navegador. No agregues nunca `service_role`, claves `secret`, contraseñas de base de datos ni tokens privados a `index.html`, `billing-client.js` o al repositorio. La conexión automática solo confirma que el navegador puede comunicarse con el proyecto; todavía hay que aplicar las migraciones, configurar Auth, desplegar Edge Functions y guardar los secretos del servidor en Supabase.
