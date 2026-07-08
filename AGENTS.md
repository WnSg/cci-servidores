# Proyecto: CCI Servicio

Este proyecto es un MVP para la planificación mensual de servidores de altar y multimedia de CCI Santa Ana.

## Objetivo de la fase 1

Construir un portal publicado en GitHub Pages donde cada servidor pueda:
- Seleccionar su nombre desde una lista.
- Agregarse como nuevo servidor si no aparece.
- Registrar el mes de servicio.
- Indicar cuántas veces puede servir en el mes.
- Marcar los domingos en los que no puede servir.
- Guardar la información usando un Cloudflare Worker.
- Persistir los datos en archivos JSON dentro del repositorio de GitHub.

## Arquitectura

Frontend:
- HTML
- CSS
- JavaScript puro
- Publicado con GitHub Pages

Backend mínimo:
- Cloudflare Worker
- GitHub API para actualizar archivos JSON

Base de datos inicial:
- Archivos JSON en GitHub

## Reglas técnicas

- No usar frameworks en la fase 1.
- No usar base de datos externa.
- No exponer tokens en JavaScript.
- El token de GitHub debe vivir únicamente como secreto del Cloudflare Worker.
- Mantener los datos personales mínimos: primer nombre, primer apellido, equipo y rol.
- No guardar teléfonos, dirección, identidad ni información sensible.
- Escribir código claro, simple y mantenible.
- Priorizar diseño responsive para celular.

## Archivos esperados

- index.html
- registro.html
- css/styles.css
- js/config.js
- js/registro.js
- data/servidores.json
- data/roles.json
- data/disponibilidad/YYYY-MM.json
- worker/src/index.js