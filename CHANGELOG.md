# Registro de cambios

Todos los cambios relevantes de este proyecto se anotan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto aspira a seguir el [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

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
