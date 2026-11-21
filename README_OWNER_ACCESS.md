# Acceso de propietarios para Piscimadre

## Modelo
- El directorio y las fichas de piscinas son de lectura pública.
- Los propietarios crean una cuenta con correo y contraseña.
- Firebase exige verificar el correo.
- Al verificarse, se crea `ownerProfiles/{uid}` con `status: "pending"`.
- El administrador aprueba o rechaza solicitudes desde Panel Dueños.
- Solo propietarios aprobados pueden crear, editar o borrar sus propias piscinas.
- El administrador puede administrar todas las piscinas.

## Configuración necesaria en Firebase
1. Authentication → Método de acceso → habilitar **Correo electrónico/Contraseña**. Mantener Anónimo habilitado para navegación pública.
2. Authentication → Configuración → Dominios autorizados: añadir `piscimadre.vercel.app` y el hostname exacto de la URL Preview desde la que harás el primer registro y la verificación de correo.
3. Firestore → Reglas: pegar el contenido de `FIRESTORE_RULES_TEMPLATE.txt` y revisar que el correo administrador y la ruta `artifacts/default-app-id/public/data/pools` coincidan antes de publicar.

## Variables de Vercel
Mantener las seis variables `VITE_FIREBASE_*` ya configuradas. Añadir:
- `VITE_FIREBASE_DATASET_ID=default-app-id`
- `VITE_ADMIN_EMAIL=025240090g@uandina.edu.pe`

La colección de piscinas se conserva en `artifacts/default-app-id/public/data/pools`.
Las solicitudes se guardan en `ownerProfiles/{uid}`.

## Primer acceso de administrador
1. El administrador debe registrarse en Panel Dueños usando exactamente el correo configurado en `VITE_ADMIN_EMAIL`.
2. Verificar ese correo desde el enlace de Firebase.
3. Iniciar sesión de nuevo. El panel reconocerá la cuenta administradora.

No compartir contraseñas ni claves privadas. La API Key web de Firebase queda en la configuración pública del cliente; las reglas de Firestore son la protección de los datos.


## Administrador inicial
- Correo administrador configurado en Vercel: `025240090g@uandina.edu.pe`.
- No se crea una cuenta automáticamente. Registra esa dirección desde Panel para Dueños, verifica el correo y vuelve a iniciar sesión. La aplicación reconoce esa dirección como administradora.
- El correo debe estar controlado por el administrador. No compartas su contraseña.
