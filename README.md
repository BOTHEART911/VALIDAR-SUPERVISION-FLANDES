# VALIDAR-SUPERVISION-FLANDES

Web pública que valida el QR del **informe de supervisión** (código IDF#####) de la Alcaldía de Flandes.
Reemplaza a `id-firma`, que queda redirigiendo aquí para que los QR ya impresos sigan funcionando.

- Lee UNA ficha en Firestore (`flandes-avisos`, colección `firmas`). No llama a Apps Script.
- La ficha la escribe FLANDES-CORE (Validar.gs) al firmar cada informe.
- Copyright © Oscar Polania · Experto en soluciones digitales
