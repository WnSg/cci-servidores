# Estado del proyecto CCI Servicio

Ultima actualizacion: 2026-07-11

## Resumen

CCI Servicio es un MVP para registrar disponibilidad mensual de servidores de altar y multimedia de CCI Santa Ana.

La fase 1 esta funcional y probada manualmente:

- El servidor selecciona su nombre o agrega uno nuevo.
- Elige un mes disponible.
- Indica cuantas veces puede servir.
- Marca domingos en los que no puede servir.
- Agrega observaciones opcionales.
- Envia el registro a un Cloudflare Worker.
- El Worker actualiza archivos JSON en GitHub.

## URLs y despliegue

Frontend:

- Publicado en GitHub Pages.
- Origen permitido actual: `https://wnsg.github.io`.

Worker:

- URL: `https://cci-servicio-worker.cci-wsdev.workers.dev`
- Health check: `GET /api/health`
- Registro: `POST /api/registro-mensual`

Comando de despliegue del Worker:

```powershell
cd worker
npm run deploy
```

## Archivos importantes

Frontend:

- `index.html`: pantalla inicial.
- `registro.html`: formulario de disponibilidad.
- `css/styles.css`: diseno responsive e identidad visual.
- `js/config.js`: URL del Worker y rutas de datos.
- `js/registro.js`: carga datos, genera meses/domingos, valida formulario y hace POST real.

Datos:

- `data/servidores.json`: lista de servidores.
- `data/roles.json`: equipos y roles disponibles.
- `data/disponibilidad/YYYY-MM.json`: disponibilidad mensual.

Worker:

- `worker/src/index.js`: API, validaciones, CORS y GitHub API.
- `worker/wrangler.jsonc`: configuracion de Wrangler y variables normales.

Assets:

- `assets/logo-cci-santa-ana.svg`: logo temporal inspirado en la referencia del logo CCI.
- Cuando exista logo oficial en PNG, usar preferiblemente `assets/logo-cci-santa-ana.png`.

## Contrato del payload

Contrato oficial para `POST /api/registro-mensual`:

```json
{
  "codigoRegistro": "string",
  "mes": "YYYY-MM",
  "servidorExistenteId": "string | null",
  "nuevoServidor": {
    "primerNombre": "string",
    "primerApellido": "string",
    "equipo": "string",
    "rol": "string"
  },
  "vecesPuedeServir": 2,
  "fechasNoPuede": ["YYYY-MM-DD"],
  "observaciones": "string"
}
```

No volver a usar nombres anteriores como:

- `cantidadServicios`
- `domingosNoDisponibles`
- `servidorNuevo`
- `servidorId`

## Reglas de negocio actuales

- El codigo de registro se valida contra el secreto `REGISTRATION_CODE`.
- El token de GitHub solo vive como secreto `GITHUB_TOKEN` en Cloudflare.
- Un servidor se considera duplicado si coincide `primerNombre + primerApellido`.
- Si se intenta agregar un servidor duplicado, el Worker responde `409`.
- El frontend muestra mensajes visuales de exito, advertencia y error.
- Los meses disponibles se generan asi:
  - Si el mes actual no es diciembre, muestra desde el mes siguiente hasta diciembre del mismo ano.
  - Si el mes actual es diciembre, muestra enero a diciembre del ano siguiente.
- El administrador debe preparar los archivos JSON de disponibilidad antes del ano operativo.

## Archivos de disponibilidad creados

Existen archivos para:

- `data/disponibilidad/2026-08.json`
- `data/disponibilidad/2026-09.json`
- `data/disponibilidad/2026-10.json`
- `data/disponibilidad/2026-11.json`
- `data/disponibilidad/2026-12.json`

## CORS

`ALLOWED_ORIGIN` admite varios origenes separados por coma.

Valor usado:

```txt
https://wnsg.github.io,http://127.0.0.1:5500,http://localhost:5500
```

El Worker:

- Responde `OPTIONS`.
- Incluye headers CORS en todas las respuestas JSON.
- Devuelve error JSON para origenes no permitidos.

## Cache

El frontend evita cache al leer JSON:

- Agrega `?v=${Date.now()}` a las rutas.
- Usa `cache: "no-store"`.
- Tras guardar un servidor nuevo, refresca `servidores.json`.
- Si GitHub Pages aun sirve una version vieja, agrega localmente el nuevo servidor solo si el Worker respondio `servidorAgregado: true`.

## Identidad visual

Paleta aplicada:

- Azul principal: `#0C506B`
- Azul oscuro: `#063246`
- Gris institucional: `#3C464F`
- Amarillo: `#F7B51E`
- Naranja: `#F47B20`
- Rojo llama: `#E84B2C`

Pendiente opcional:

- Reemplazar el SVG temporal por el logo oficial en PNG/SVG.
- Recomendacion para PNG oficial: `640 x 240 px`, idealmente con fondo transparente.

## Pruebas manuales recomendadas antes de congelar fase 1

- Registrar disponibilidad con servidor existente.
- Registrar un servidor nuevo.
- Intentar agregar servidor duplicado y confirmar mensaje de advertencia.
- Probar codigo de registro incorrecto.
- Registrar en cada mes disponible.
- Confirmar que los domingos se regeneran al cambiar de mes.
- Confirmar que `data/servidores.json` y `data/disponibilidad/YYYY-MM.json` se actualizan en GitHub.

## Siguiente fase sugerida

Fase 2 podria incluir:

- Vista administrativa para revisar disponibilidad por mes.
- Generador de planificacion mensual.
- Exportacion a PDF o Excel.
- Control administrativo para abrir meses de servicio.
- Reemplazo del codigo compartido por autenticacion mas formal si el alcance crece.
