# Piscimadre 2.0: configuración Firebase

La versión 2.0 usa las reglas de Firestore ya publicadas para el proyecto Piscimadre. Las reglas conservan el directorio de establecimientos y permiten los nuevos campos de tipo de lugar, piscina infantil y menú estructurado, además de opiniones pendientes de moderación.

## Funciones incluidas sin activar facturación

- Botón **Cómo llegar** con las coordenadas del establecimiento.
- Tipo de lugar: piscina o quebrada.
- Indicador de piscina para niños.
- Menús organizados por categoría, descripción y precio.
- Opiniones con estrellas y comentarios; se publican después de aprobación del administrador.

El formulario no ofrece carga de fotografías porque Firebase Storage requiere el plan Blaze y el flujo de facturación mostró un prepago de S/ 100. No se debe crear un bucket ni activar facturación para esta versión. Los datos de imágenes existentes, si hubiera, se conservan al editar un establecimiento.

## Firestore

Base de datos: `(default)`.

Las reglas de Firestore para los campos y opiniones ya están publicadas en Firebase Console. El administrador configurado en las reglas es la cuenta propietaria del proyecto. Mantén ese correo sincronizado si cambia la cuenta administradora.

La aplicación usa `collectionGroup('reviews')` para mostrar al administrador las opiniones pendientes. Las opiniones públicas se consultan por estado aprobado.

## Publicación

Al integrar esta rama con `main`, Vercel publicará la interfaz de Piscimadre 2.0. No hace falta cambiar Authentication ni configurar Firebase Storage para las funciones indicadas arriba.
