# Registro de cambios

Todos los cambios relevantes de este proyecto se anotan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto aspira a seguir el [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [1.1.0] - 2026-10-20

### Añadido

- Vista de tabla en la consola de Apify: esquema del conjunto de datos con la vista «Resumen» (fecha, tipo de norma, departamento, título y enlaces al PDF y al BOE) y la vista «Todos los campos», más un esquema de salida que muestra la tabla en la pestaña de resultados. Las vistas solo afectan a la consola, no a las exportaciones JSON o CSV.
- Campo de entrada `normTypes`: filtra por tipo de norma (Ley, Ley Orgánica, Real Decreto, Real Decreto-ley, Orden, Resolución…). Vacío significa todos los tipos; un valor no admitido es una entrada no válida (código de salida 2).
- Campo de salida `normType`, derivado por el Actor a partir del inicio del título y marcado como derivado; no es un metadato del BOE. Los 12 campos anteriores conservan nombres y valores.
- La memoria `SEEN` distingue también el filtro `normTypes`, pero solo cuando se usa: quien no lo use conserva la memoria que ya tenía.

### Cambiado

- Versión 1.1.0; el `User-Agent` pasa a `normawatch-boe/1.1`.

## [1.0.0] - 2026-10-20

### Añadido

- Lectura del sumario diario del BOE (API de datos abiertos) para un intervalo en el que la fecha final es como máximo 31 días posterior a la inicial, limitada a la sección I (disposiciones generales).
- Salida con 12 campos por elemento: metadatos y enlaces (`urlHtml`, `urlPdf`, `urlXml`), sin texto íntegro, con la línea de fuente `source` y `sourceUrl` en cada elemento.
- Entrada validada antes de hacer ninguna petición: `dateFrom`, `dateTo`, `departments`, `keywords`, `onlyNew`, `maxItems` y `requestDelayMs`, con sus valores por defecto y límites.
- Filtros por departamento y por palabras del título, con coincidencia literal sin distinguir mayúsculas.
- Modo `onlyNew`: memoria de elementos ya entregados en el almacén clave-valor `SEEN`, una por cada combinación de filtros, con tope de 50 000 identificadores.
- Filtro de nombres que descarta los títulos con tratamientos personales, y descarte de identificadores o enlaces que no sean del BOE y de textos demasiado largos, con registro de solo recuentos.
- Cliente HTTP respetuoso: una petición a la vez, pausa mínima de 500 ms, tiempo máximo de 30 s, hasta 3 reintentos con espera creciente ante 429 o 5xx (respetando `Retry-After`), límite de tamaño de respuesta y `User-Agent` propio.
- Códigos de salida: 0 (correcto), 1 (fallo de la ejecución) y 2 (entrada no válida).
- Documentación en castellano (`README.md`) con la atribución al BOE, el aviso de que no es un servicio oficial y la sección de datos personales.
- Licencia MIT.

### Cambiado

- Las 8 dependencias indirectas de producción que tenían menos de 7 días de antigüedad (`baseline-browser-mapping`, `browserslist`, `caniuse-lite`, `electron-to-chromium`, `generative-bayesian-network`, `header-generator`, `node-releases` y `strtok3`) se fijan con `overrides` a versiones de más de 7 días.

### Corregido

- `SEEN` ya no se sobrescribe con una lista parcial cuando no se pudo leer ni al abrir ni al guardar: no se escribe nada y la ejecución termina con código de salida 1.
