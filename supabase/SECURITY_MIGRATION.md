# Migracion segura de cuentas y preferencias

Estado: preparacion local. No se han aplicado cambios remotos.

## Hallazgos confirmados

- `auth.users` tiene 0 cuentas; la aplicacion actual autentica contra `public.usuarios_scada` desde el cliente.
- `usuarios_scada` contiene 4 cuentas de prueba descartables, no identidades reales que deban migrarse. La tabla almacena `pass` y `password` como texto y su clave primaria es `user`.
- RLS esta activado en `usuarios_scada`, pero tiene dos politicas `ALL` para `anon` con `USING true` y `WITH CHECK true`.
- Hay politicas `ALL` para `anon` o `public` en otras tablas, incluida `config_ai_keys`. La tabla `config_ai_keys` no tiene RLS activado.
- La CLI esta autenticada y el proyecto `gjtqyodpgwfvfvkhlhik` esta enlazado.

## Riesgo de despliegue

No se deben retirar ahora las politicas heredadas: el cliente actual depende de las claves anonimas para leer y modificar tablas. Tampoco se deben aplicar permisos de preferencias a `usuarios_scada`; esas cuentas no tienen un `auth.users.id` que permita aislarlas por usuario autenticado.

La migracion `20261019000100_auth_profiles_and_appearance.sql` crea una base separada de perfiles y preferencias ligada a Supabase Auth. No cambia las politicas heredadas, no migra contrasenas y no debe aplicarse hasta que la autenticacion y los flujos de administracion del cliente esten listos para el corte.

## Secuencia de migracion

1. Crear/verificar una cuenta Auth real de superadministracion con el correo unico del administrador. No reutilizar la credencial maestra embebida en el cliente.
2. Mantener el correo compartido del administrador como `contact_email`; no se requiere hacerlo unico. `api/admin-accounts.js` puede heredarlo al invitar cuentas sin contacto propio.
3. Crear nuevas cuentas desde el endpoint administrativo. Para `gmail.com`/`googlemail.com`, genera una identidad Auth unica `+biofleet-username` que entrega al mismo buzon; en otros proveedores se debe indicar un correo Auth unico o configurar alias. No migrar las cuatro cuentas de prueba ni sus contrasenas en texto plano.
4. El trigger crea perfiles `OPERADOR` y `PENDIENTE`; asignar el rol superadministrador solo mediante el bootstrap SQL. Los usuarios no pueden elegir roles desde metadata de signup.
5. Cambiar login, recuperacion y operaciones de usuario para usar Auth y perfiles. Las preferencias personales se guardan mediante `save_my_appearance_preferences`; los overrides solo mediante `set_user_appearance_overrides`.
6. Probar con superadministrador, operador y usuario pendiente. Confirmar que cada cuenta solo lee su perfil/preferencias, que las llamadas de administracion fallan para no-admin y que las invitaciones/recuperaciones llegan al buzon central.
7. Configurar SMTP de produccion. Auth cubre invitaciones y recuperacion; para enviar reportes/datos solicitados se requiere un servicio de correo desde una Edge Function/API protegida, no desde el navegador.
8. Solo despues de la prueba, retirar las politicas abiertas de anon/public tabla por tabla, proteger `config_ai_keys`, revisar secretos expuestos y rotar claves/credenciales que correspondan.

## Bootstrap y configuracion del servidor

La migracion crea cada perfil Auth nuevo con rol `OPERADOR` y estado `PENDIENTE`; no acepta un rol privilegiado desde metadata del navegador. Para habilitar el primer administrador:

1. Aplicar la migracion solo despues de preparar el corte Auth y respaldar la base.
2. Crear en Supabase Auth el usuario superadministrador con un email unico y verificado.
3. Ejecutar `supabase/bootstrap_superadmin.sql` desde SQL Editor tras reemplazar el email de ejemplo. Confirmar que `RETURNING` presenta exactamente una fila.
4. Configurar en Vercel las variables de servidor `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN` y `AUTH_REDIRECT_URL`. `SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar prefijo `VITE_` ni estar en el bundle del navegador.

`api/admin-accounts.js` proporciona operaciones administrativas de lista, invitacion, actualizacion de perfil y override visual. Verifica un Bearer JWT de Supabase y exige que el perfil del actor tenga rol privilegiado y estado activo. No debe habilitarse hasta que el cliente use Supabase Auth y exista el superadministrador inicial.

La invitacion y recuperacion por Auth requieren que la entrega de correo de produccion este configurada (SMTP verificado en Supabase Auth). El envio de informes/archivos solicitado por usuarios requiere ademas un proveedor de correo en una funcion de servidor; no debe hacerse desde React ni incluir secretos en el frontend.

## Preferencias

El perfil mantiene separados `auth_email` (unico, para iniciar sesion y recuperacion) y `contact_email` (puede repetirse, para el buzon de contacto del administrador). Solo el propietario o un administrador activo puede leer el perfil. El usuario guarda tema, fondo y transparencia en sus preferencias; el administrador puede definir overrides parciales. La precedencia es: override administrativo, preferencia personal y, por ultimo, valor predeterminado.
