# Registro de cambios

Todos los cambios relevantes de este proyecto se anotan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto aspira a seguir el [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [1.5.2] - 2026-10-20

### Documentación

- README: sección «In English» con un resumen en inglés (qué hace, para quién, opciones principales, gratuito y sin carácter oficial) para dar más alcance al Actor en la tienda de Apify. El resto de la documentación sigue en castellano.

## [1.5.1] - 2026-10-20

### Cambiado

- El formulario de la consola de Apify trae fechas de ejemplo (del 16 al 19 de octubre de 2026, días reales del BOE) mediante `prefill` en `dateFrom` y `dateTo`, para que la prueba diaria de la tienda y una primera ejecución devuelvan resultados. No hay valores `default`: quien llama por la API sin fechas sigue leyendo hoy, igual que en la 1.5.0.
- La descripción del Actor y la de `package.json` coinciden con la de la tienda.

## [1.5.0] - 2026-10-20

### Añadido

- Boletines autonómicos junto al BOE: el campo `bulletins` (selector con `"BOE"`, `"BOJA"` y `"DOG"`, por defecto `["BOE"]`). De cada uno se leen solo las disposiciones generales.
- BOJA (Junta de Andalucía, CC BY 4.0, «Reconocimiento 4.0 Internacional», según su portal de datos abiertos) por su API de datos abiertos, con una consulta por fecha y una lista de campos cerrada (sin texto íntegro ni HTML).
- DOG (Xunta de Galicia, CC BY-SA 4.0) por el RSS oficial de la sección I, leído con un lector XML propio y acotado (`src/xml.ts`) que rechaza `<!DOCTYPE` y declaraciones de entidad, con tope de tamaño, de profundidad y de elementos. El RSS solo contiene el último número: no sirve para días pasados.
- Campo `bulletin` en cada elemento (`"BOE"` en los del BOE, único cambio de su salida), y `id`, `section`, `source` y `sourceUrl` propios de cada boletín. `urlXml` falta donde la fuente no lo tiene.
- Aislamiento de fallos: un boletín roto registra el error y falla solo sus días, con su propio cortacircuitos; la ejecución termina con código 1 únicamente si fallan todos los elegidos. `STATE` guarda el boletín siguiente y el estado de cada fuente, y al reanudar no se repite ni se salta ningún día de ninguna fuente.
- Los resúmenes por correo, Telegram y Slack muestran el boletín de cada elemento cuando hay más de uno, y su pie recoge la atribución de cada fuente.
- README: sección «Boletines autonómicos» con fuentes, licencias, líneas de fuente, la nota de compartir igual del DOG, formas de identificador, límites y lo que no cubre (BOCM, DOGC, DOGV, BOA y BOPV).

### Cambiado

- El código del BOE pasa a `src/sources/boe.ts` sin cambiar su comportamiento; el cliente HTTP común (`src/http.ts`) lo usan todas las fuentes.
- La clave de `SEEN` y la huella de reanudación incluyen `bulletins` solo cuando no es `["BOE"]`: con el valor por defecto, son idénticas a las de la 1.4. La memoria de `SEEN` admite los identificadores de cada boletín.
- El `User-Agent` pasa a `normawatch-boe/1.5 (+https://github.com/saidcveltran/normawatch-boe)`.
- Con varios boletines, cualquier excepción de un adaptador es el fallo de esa fuente ese día y no detiene a las demás; una página del BOJA con más de 200 elementos es un fallo del BOJA. Con el BOE solo no cambia nada.
- El identificador del DOG se limita a 76 caracteres tras `DOG-` y un enlace de más de 2000 caracteres se descarta como enlace no válido.
- Un 404 del RSS del DOG ya no es un día vacío sino un fallo del DOG; el resultado (documento o fallo) se memoriza y el RSS se pide y se analiza una sola vez por ejecución.
- El lector XML rechaza los caracteres fuera de la producción `Char` de XML 1.0 y las referencias numéricas a controles y a caracteres de dirección; los textos de salida y los resúmenes pierden controles C0/C1 y caracteres bidireccionales.
- Los pies de los resúmenes del BOJA y del DOG llevan la dirección de su licencia; el README indica los cambios que hace el Actor y que ni la Junta de Andalucía ni la Xunta de Galicia respaldan el proyecto.

### No incluido

- BOPV (País Vasco): su API de Open Data Euskadi (CC BY 4.0) responde 404 al `User-Agent` identificado de NormaWatch, también con la forma `Mozilla/5.0 (compatible; normawatch-boe/1.5; +…)`, y solo responde a clientes genéricos. El Actor no se hace pasar por otro programa, así que BOPV queda fuera de la 1.5. Tampoco se extrae HTML.

## [1.4.0] - 2026-10-20

### Añadido

- Sección III del BOE («Otras disposiciones») como opción, **desactivada por defecto**: el campo `sections` (selector con `"1"` y `"3"`) permite añadirla. Sin él, una ejecución devuelve exactamente lo mismo que en la 1.3.
- Con la sección III activada solo se incluyen los elementos de un listado cerrado de 14 epígrafes (`Convenios`, `Encomienda de gestión`, `Delegación de competencias`, `Planes de estudios`, `Cartas de servicios`, `Subvenciones`, `Ayudas`, `Becas`, `Impacto ambiental`, `Instalaciones eléctricas`, `Homologaciones`, `Normalización`, `Mercado de divisas` y `Convenios colectivos de trabajo`), con comparación exacta, sin distinguir mayúsculas y en NFC.
- Filtro de adjudicaciones y personas para la sección III: se descartan los títulos con expresiones de adjudicación o de persona concreta (`se conceden`, `a favor de`, `interpuesto por`, `adjudica`, `relación de`…) y los que contienen un DNI o un NIE, también con puntos, guiones o espacios, o un DNI enmascarado. Se descartan además los tratamientos `Sr.`, `Sra.`, `señor`, `señora`, `Dr.` y `Dra.`, y sigue rigiendo el filtro de tratamientos personales de siempre. La comparación ignora tildes, espacios raros y formas de compatibilidad.
- El campo `section` vale `"3"` en los elementos de la sección III; sin la opción sigue valiendo siempre `"1"`.
- El registro añade, solo con la sección III activada, los recuentos de lo descartado por el listado y por el filtro, nunca títulos.
- La clave de `SEEN` y la huella de reanudación incluyen las secciones solo cuando se activa la III, de modo que la memoria de quien no la usa no cambia y la de quien la activa no se mezcla con la anterior.
- README: nueva sección «Sección III (opcional)» con el listado (las tildes del epígrafe deben coincidir exactamente), los filtros y sus límites, y las preguntas y la sección de datos personales actualizadas.
- Retirada de un título: la incidencia pública debe llevar **solo el identificador del BOE (`BOE-A-AAAA-N`) y la fecha**, nunca el título ni datos personales; se retira en un plazo máximo de 7 días.

### Cambiado

- El `User-Agent` pasa a `normawatch-boe/1.4`.

## [1.3.0] - 2026-10-20

### Añadido

- Historial más largo: una ejecución admite hasta 366 días de diferencia entre `dateFrom` y `dateTo` (antes 31). Una entrada de la 1.2 sigue siendo válida y se comporta igual.
- Con más de 31 días de diferencia, las peticiones siguen siendo de una en una, la pausa efectiva es de al menos 1000 ms y los días se leen del más reciente al más antiguo, de modo que `maxItems` conserva lo más reciente. Con 31 días o menos no cambia nada, salvo el cortacircuitos, que rige para todos los rangos.
- Cortacircuitos: cinco días seguidos fallidos (tras los reintentos) detienen la ejecución con código de salida `1`. Un día sin BOE (404) no cuenta como fallo. Se mantienen `Retry-After` y las esperas de 2, 4 y 8 s.
- Punto de control `STATE` en el almacén clave-valor de la ejecución: se guarda tras cada día y la ejecución se reanuda desde él tras una migración o un reinicio, sin repetir días ni elementos. Lo ya entregado se lee del conjunto de datos de la ejecución, `maxItems` cuenta también lo entregado antes de la interrupción, y `SEEN` y los avisos se comportan igual que antes (con aviso, `SEEN` se confirma una sola vez al final). `STATE` se borra al terminar bien y se conserva si la ejecución acaba con error.
- README: nuevos límites, la recomendación de una carga inicial seguida de ejecuciones diarias con `onlyNew`, el tiempo medido de una ejecución de un año y una pregunta frecuente sobre el historial.

### Cambiado

- El `User-Agent` pasa a `normawatch-boe/1.3`.

## [1.2.2] - 2026-10-20

### Corregido

- La columna Fecha de la vista de tabla muestra la fecha del BOE tal cual (antes aparecía el día anterior a las 22:00 UTC).

## [1.2.1] - 2026-10-20

### Corregido

- El registro de la ejecución de `apify/send-mail` (con la dirección de correo y el resumen) ya no se copia en el registro de NormaWatch.

## [1.2.0] - 2026-10-20

### Añadido

- Logotipo e icono de NormaWatch (`assets/logo`) e imágenes de ejemplo con datos reales (`assets/muestras`).
- Resumen por correo: campo de entrada secreto `emailTo`. Tras la ejecución se envía un resumen (asunto fijo, texto y HTML, agrupado por departamento, máximo 100 elementos con «y N más» y enlace al conjunto de datos) mediante el Actor `apify/send-mail` (256 MB, 120 s) a una sola dirección. En el plan gratuito de Apify solo se admite la dirección de la propia cuenta de Apify. El envío es una ejecución adicional que Apify factura al usuario.
- Avisos por Telegram (`telegramBotToken`, secreto, y `telegramChatId`) y por Slack (`slackWebhookUrl`, secreto): como máximo 10 mensajes por canal y ejecución, con la separación que piden ambos servicios, una sola espera ante un 429 (`retry_after` o `Retry-After`, máximo 30 s) y abandono del canal si persiste. Los servidores de destino son constantes (`api.telegram.org` y `hooks.slack.com`), sin redirecciones, con tiempo máximo de 15 s y lectura de respuesta limitada a 64 KB.
- Campo de entrada `notifyWhenEmpty`: por defecto solo se avisa si la ejecución entrega al menos un elemento.
- Código de salida `3`: los elementos se entregaron, pero al menos un aviso falló. Con avisos configurados, la memoria `SEEN` se confirma al final y solo si todos los avisos salieron bien; sin avisos, el comportamiento no cambia.
- El registro y el mensaje de estado nunca contienen direcciones, tokens, webhooks ni identificadores de chat: ante un error solo se anotan su nombre y el estado HTTP.

### Cambiado

- Versión 1.2.0; el `User-Agent` pasa a `normawatch-boe/1.2`.

### Corregido

- La memoria por defecto de cada ejecución pasa a 256 MB (`defaultRunOptions.memoryMbytes`); antes la plataforma usaba 4096 MB por defecto.

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
