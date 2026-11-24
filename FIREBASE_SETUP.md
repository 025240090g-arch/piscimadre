# Ajustes de Firebase para Piscimadre 2.0

Este cambio conserva las reglas de Firestore que ya utiliza la aplicación. No reemplaces el archivo de reglas activo por este texto: integra únicamente el bloque indicado.

## 1. Activar Firebase Storage

En Firebase Console, abre **Storage** y verifica que el bucket esté creado. Luego entra en **Storage → Rules** y pega el contenido de \`storage.rules\`.

Antes de publicar, reemplaza \`REEMPLAZA_CON_EL_CORREO_ADMIN\` por el correo de administrador que ya está configurado en la variable \`VITE_ADMIN_EMAIL\` de Vercel. La regla deja leer imágenes públicamente, pero solo permite subirlas a propietarios aprobados o al administrador autenticado. Limita cada archivo a 8 MB y a formatos de imagen habituales.

## 2. Añadir reglas para opiniones

Dentro del bloque existente \`service cloud.firestore { match /databases/{database}/documents { ... }\`, agrega el siguiente bloque. No borres ni sustituyas las reglas de piscinas, propietarios o autenticación que ya funcionan.

Reemplaza también \`REEMPLAZA_CON_EL_CORREO_ADMIN\` por el correo administrador real:

\`\`\`javascript
function isPiscimadreAdmin() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email == 'REEMPLAZA_CON_EL_CORREO_ADMIN';
}

match /artifacts/{appId}/public/data/pools/{poolId}/reviews/{reviewId} {
  allow read: if isPiscimadreAdmin() || resource.data.status == 'approved';

  allow create: if request.auth != null
    && request.resource.data.keys().hasOnly([
      'displayName', 'userId', 'rating', 'comment', 'status', 'createdAt'
    ])
    && request.resource.data.userId == request.auth.uid
    && request.resource.data.status == 'pending'
    && request.resource.data.displayName is string
    && request.resource.data.displayName.size() >= 1
    && request.resource.data.displayName.size() <= 60
    && request.resource.data.rating is int
    && request.resource.data.rating >= 1
    && request.resource.data.rating <= 5
    && request.resource.data.comment is string
    && request.resource.data.comment.size() >= 3
    && request.resource.data.comment.size() <= 500
    && request.resource.data.createdAt == request.time;

  allow update, delete: if isPiscimadreAdmin();
}
\`\`\`

La aplicación publica solo opiniones aprobadas. El panel de administración mostrará las pendientes para que puedas publicarlas o rechazarlas.

## 3. Permitir los nuevos campos de las piscinas

Si la regla que ya tienes valida los campos del documento con \`keys().hasOnly(...)\`, incorpora también estos nombres a la lista permitida: \`venueType\`, \`hasKidsPool\`, \`images\` y \`foodItems\`. Conserva el resto de condiciones de autorización por propietario y administrador.

## 4. Probar antes de producción

El formulario nuevo utiliza Firebase Storage para fotos de piscinas y platos. Si las reglas de Storage o Firestore todavía no se han actualizado, la carga de fotos o el envío de opiniones mostrará un error de permisos; las demás funciones del directorio no deberían necesitar cambios.
