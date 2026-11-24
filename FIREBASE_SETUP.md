# Ajustes de Firebase para Piscimadre 2.0

Este cambio conserva las reglas de Firestore que ya utiliza la aplicación. No reemplaces las reglas activas completas: integra únicamente los bloques indicados.

## 1. Activar Firebase Storage

En Firebase Console, abre **Storage** y verifica que el bucket esté creado. Luego entra en **Storage → Rules** y pega el contenido de `storage.rules`.

Antes de publicar, reemplaza `REEMPLAZA_CON_EL_CORREO_ADMIN` en ese archivo por el correo de administrador que ya está configurado en `VITE_ADMIN_EMAIL` de Vercel. Las reglas permiten leer las imágenes públicamente, pero solo permiten subirlas a propietarios aprobados o al administrador autenticado. Cada archivo queda limitado a 8 MB y a formatos de imagen.

Al guardar las reglas que consultan Firestore desde Storage, Firebase puede pedir que habilites el permiso de conexión entre ambos productos. Acéptalo solo si la regla revisada es la que estás publicando.

## 2. Añadir reglas para opiniones

Dentro del bloque existente `service cloud.firestore { match /databases/{database}/documents { ... }`, integra el siguiente helper y los dos bloques `match`. No borres ni sustituyas las reglas de piscinas, propietarios o autenticación que ya funcionan.

Reemplaza `REEMPLAZA_CON_EL_CORREO_ADMIN` por el correo administrador real. El nombre `isPiscimadreReviewAdmin` es específico para evitar colisionar con helpers que ya existan.

```javascript
function isPiscimadreReviewAdmin() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email == 'REEMPLAZA_CON_EL_CORREO_ADMIN';
}

match /artifacts/{appId}/public/data/pools/{poolId}/reviews/{reviewId} {
  allow read: if isPiscimadreReviewAdmin() || resource.data.status == 'approved';

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

  allow update, delete: if isPiscimadreReviewAdmin();
}

// Esta regla adicional es necesaria para que el panel administrativo
// pueda consultar opiniones pendientes mediante collectionGroup('reviews').
match /{path=**}/reviews/{reviewId} {
  allow read: if isPiscimadreReviewAdmin();
}
```

La regla de grupo de colecciones es necesaria porque el panel usa `collectionGroup('reviews')` para localizar pendientes en todas las piscinas. La consulta pública de cada piscina solo obtiene opiniones con estado `approved`. Firebase requiere una regla explícita de grupo de colecciones para las consultas `collectionGroup` y `rules_version = '2'`.

La aplicación publica solo opiniones aprobadas. El panel de administración mostrará las pendientes para que puedas publicarlas o rechazarlas.

## 3. Permitir los nuevos campos de las piscinas

Si la regla existente valida campos con `keys().hasOnly(...)`, incorpora también: `venueType`, `hasKidsPool`, `images` y `foodItems`. Conserva el resto de condiciones de autorización por propietario y administrador.

## 4. Probar antes de producción

El formulario nuevo utiliza Firebase Storage para fotos de piscinas y platos. Si las reglas de Storage o Firestore todavía no se han actualizado, la carga de fotos o el envío de opiniones mostrará un error de permisos. La publicación de esta rama en Preview no cambia las reglas activas ni la web de producción.
