<div align="center">

<img src="https://normawatch.aiskaron.com/logo/normawatch-icon.svg" alt="Icono de NormaWatch" width="112">

# NormaWatch

**Las nuevas disposiciones generales del BOE, cada día, listas para usar.**

<img src="https://img.shields.io/badge/Versi%C3%B3n-1.8.0-1636B5?style=flat" alt="Versión 1.8.0"> <img src="https://img.shields.io/badge/Licencia-MIT-0AB8D8?style=flat" alt="Licencia MIT"> <img src="https://img.shields.io/badge/Actor%20de%20Apify-00E58C?style=flat" alt="Actor de Apify"> <img src="https://img.shields.io/badge/Node.js-24-339933?style=flat" alt="Node.js 24"> <img src="https://img.shields.io/badge/Fuentes-BOE%20%C2%B7%20BOJA%20%C2%B7%20DOG%20%C2%B7%20DOGC-5B6B8C?style=flat" alt="Fuentes: BOE, BOJA, DOG, DOGC">

</div>

<p align="center"><img src="https://normawatch.aiskaron.com/muestras/portada.png" alt="Vista de ejemplo de NormaWatch con cuatro filas de datos reales del BOE (fecha, tipo de norma y título)" width="100%"></p>

**NormaWatch** es un **Actor de Apify** (así llama Apify a los programas que se ejecutan en su plataforma) que lista las nuevas **disposiciones generales** (sección I) del Boletín Oficial del Estado (BOE), solo con metadatos y enlaces, para que puedas vigilar la normativa nueva sin leer el sumario cada día. Está pensado para quien sigue la normativa española: asesorías, despachos, equipos de cumplimiento normativo y periodistas. Es **gratuito**: no tiene precio ni suscripción.

> Basado en datos de la [Agencia Estatal Boletín Oficial del Estado](https://www.boe.es) y, si lo eliges, de la Junta de Andalucía (BOJA, CC BY 4.0), la Xunta de Galicia (DOG, CC BY-SA 4.0) y la Generalitat de Catalunya (DOGC, Llicència oberta d'ús d'informació - Catalunya; ver [Boletines autonómicos](#boletines-autonómicos)). Este Actor no es un servicio oficial del BOE ni de la AEBOE, y su resultado no es un texto oficial. La Agencia no participa en este Actor, ni lo patrocina, ni lo respalda. Ni la Junta de Andalucía ni la Xunta de Galicia participan en este proyecto ni lo respaldan, y la Generalitat de Catalunya no participa en NormaWatch ni lo respalda.

## In English

**NormaWatch** is a Spain official gazette API in the form of an Apify Actor. It lists the new general provisions (Section I) of Spain's Official State Gazette (BOE, Boletín Oficial del Estado) and, optionally, of the BOJA (Andalusia) and DOG (Galicia) regional gazettes, every day, as JSON and as a table in the Apify console. Each item carries metadata and official links only, never the full text.

It suits Spanish legislation monitoring and regulatory alerts for Spain: compliance teams, law firms, journalists and developers who feed their own alerts or dashboards with a BOE API.

Since 1.8, the optional `bulletins` setting also accepts `"DOGC"`, the Catalonia gazette (Diari Oficial de la Generalitat de Catalunya): laws, decree-laws, decrees, legislative decrees and orders only (no resolutions, and the dataset has no department field), the same day, with history supported. The data come from the open-data portal of the Generalitat de Catalunya (licence "Llicència oberta d'ús d'informació - Catalunya"), items link to the Portal Jurídic de Catalunya (not an official authentic edition), and the Generalitat does not take part in NormaWatch or endorse it.

Since 1.6, the optional `relations` and `followIds` settings tell you which laws each BOE provision repeals, amends or replaces (based on data from the Agencia Estatal Boletín Oficial del Estado; the links to consolidated texts are informational only, not official), and let you follow specific laws by their BOE id.

Since 1.7, the optional Section II-B ("Oposiciones y concursos", public-sector job calls) can be added with `sections: ["2B"]`: by default only the calls (convocatorias) are delivered, and `includeProcessUpdates` adds the follow-up notices (admitted lists, tribunals, corrections). The `stage` field is derived from the title and is a hint, not an official datum. Section II-A (appointments) is never read, and no document text is fetched.

Key options: a date range of up to one year, filters by department, title keywords and norm type, `onlyNew` for daily scheduled runs that return only what you have not received before, and optional e-mail, Telegram or Slack notices.

It is free: no price and no subscription. It is not an official BOE or AEBOE service, and its output is not an official text. The full documentation below is in Spanish.

## Contenido

- [In English](#in-english)
- [Qué hace](#qué-hace)
- [Para quién es](#para-quién-es)
- [Cómo usarlo](#cómo-usarlo)
- [Entrada](#entrada)
- [Salida](#salida)
- [Tipo de norma (derivado)](#tipo-de-norma-derivado)
- [Sección III (opcional)](#sección-iii-opcional)
- [Oposiciones (sección II-B)](#oposiciones-sección-ii-b)
- [Boletines autonómicos](#boletines-autonómicos)
- [Qué cambia cada disposición (relations)](#qué-cambia-cada-disposición-relations)
- [Vista de tabla en la consola de Apify](#vista-de-tabla-en-la-consola-de-apify)
- [Ejemplo de resultado](#ejemplo-de-resultado)
- [Cómo funciona onlyNew](#cómo-funciona-onlynew)
- [Avisos por correo, Telegram y Slack](#avisos-por-correo-telegram-y-slack)
- [Precio y límites](#precio-y-límites)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Atribución y condiciones de reutilización](#atribución-y-condiciones-de-reutilización)
- [No es un servicio oficial](#no-es-un-servicio-oficial)
- [Datos personales](#datos-personales)
- [Mantenimiento](#mantenimiento)
- [Cambios](#cambios)
- [Licencia](#licencia)
- [Contacto](#contacto)

## Qué hace

- Consulta el sumario diario del BOE (API de datos abiertos) para las fechas que indiques, hasta 367 días (un año) en una ejecución.
- Se queda solo con la **sección I (disposiciones generales)** y devuelve, por cada una, sus **metadatos y los enlaces** oficiales en HTML, PDF y XML.
- Filtra por **departamento**, por **palabras del título** y por **tipo de norma**.
- Opcionalmente, y **desactivado por defecto**, añade una parte restringida de la **sección III** («Otras disposiciones»): solo ciertos epígrafes y con filtros contra los datos personales (ver [Sección III](#sección-iii-opcional)).
- Con `onlyNew` entrega solo lo que no se había entregado antes, pensado para una ejecución programada cada día.
- Añade el **tipo de norma**, deducido del título y marcado como derivado (ver [Tipo de norma](#tipo-de-norma-derivado)).
- Muestra el resultado como una **tabla en la consola de Apify** (ver [Vista de tabla](#vista-de-tabla-en-la-consola-de-apify)) y lo puedes descargar en los formatos que Apify ofrece para cualquier conjunto de datos (por ejemplo JSON o CSV).
- Si lo configuras, envía un **resumen** de lo entregado por **correo** (a tu propia cuenta de Apify), por **Telegram** o por **Slack** (ver [Avisos](#avisos-por-correo-telegram-y-slack)).
- Incluye en cada elemento la **línea de fuente** que piden las condiciones de reutilización del BOE.

## Para quién es

Para quien necesita enterarse de la normativa nueva sin revisar el BOE a mano: despachos y asesorías, equipos de cumplimiento normativo, periodistas, desarrolladores que alimentan sus propios avisos o paneles, y cualquiera que quiera programar una ejecución diaria y recibir solo lo nuevo.

## Cómo usarlo

1. Abre el Actor en tu cuenta de Apify.
2. Rellena la entrada: las fechas (`dateFrom` y `dateTo`) y, si quieres, los filtros; una entrada vacía devuelve las disposiciones de hoy (ver [Entrada](#entrada)).
   El formulario de la consola trae fechas de ejemplo (del 16 al 19 de octubre de 2026) para que una primera ejecución muestre resultados; para leer el BOE de hoy, borra ambas fechas.
3. Ejecútalo, o programa una ejecución diaria con `onlyNew` activado para recibir solo lo nuevo (ver [Cómo funciona `onlyNew`](#cómo-funciona-onlynew)).
4. Lee el resultado en la pestaña de resultados, en la vista **Resumen** de la tabla.
5. Descarga el conjunto de datos en el formato que necesites (por ejemplo JSON o CSV) o léelo por la API de Apify.

## Entrada

Todos los campos son opcionales. Una entrada vacía devuelve las disposiciones de hoy (fecha de Madrid, zona horaria Europe/Madrid).

| Campo | Tipo | Valor por defecto | Límites |
|---|---|---|---|
| `dateFrom` | texto `AAAA-MM-DD` | hoy (Europe/Madrid) | Fecha real del calendario; no puede ser posterior a hoy. |
| `dateTo` | texto `AAAA-MM-DD` | el valor de `dateFrom` | No puede ser anterior a `dateFrom` ni posterior a hoy; como máximo 366 días después de `dateFrom` (367 fechas, algo más de un año). Con más de 31 días de diferencia se leen primero los días más recientes y la pausa entre peticiones es de al menos 1000 ms. |
| `departments` | lista de textos | sin filtro | Máximo 50 entradas de 200 caracteres cada una. Se conserva el elemento si su departamento contiene alguno de los textos (sin distinguir mayúsculas; texto literal, no expresión regular). |
| `keywords` | lista de textos | sin filtro | Máximo 50 entradas de 200 caracteres cada una. Se conserva el elemento si su título contiene alguno de los textos (sin distinguir mayúsculas; texto literal). |
| `normTypes` | lista de tipos de norma | sin filtro (todos los tipos) | Selector múltiple. Valores admitidos, tal como los escribe el BOE: `Corrección de errores`, `Instrumento de ratificación`, `Real Decreto Legislativo`, `Real Decreto-ley`, `Real Decreto`, `Ley Orgánica`, `Ley Foral`, `Ley`, `Decreto Legislativo`, `Decreto-ley`, `Decreto`, `Orden`, `Resolución`, `Circular`, `Acuerdo internacional` y `Otro`. Un valor distinto hace fallar la ejecución con código de salida 2. Ver [Tipo de norma](#tipo-de-norma-derivado). |
| `sections` | lista de secciones | `["1"]` (solo la sección I) | Selector múltiple con `"1"` (disposiciones generales), `"2B"` (oposiciones y concursos, desde la 1.7) y `"3"` (otras disposiciones, restringida y con filtros). Un valor distinto hace fallar la ejecución con código de salida 2. Ver [Oposiciones](#oposiciones-sección-ii-b) y [Sección III](#sección-iii-opcional). |
| `includeProcessUpdates` | verdadero o falso | `false` | Desde la 1.7. Solo tiene efecto con la sección II-B: por defecto se entregan solo las convocatorias; con `true`, también las actualizaciones y los elementos sin fase reconocida. Ver [Oposiciones](#oposiciones-sección-ii-b). |
| `bulletins` | lista de boletines | `["BOE"]` | Selector múltiple con `"BOE"`, `"BOJA"`, `"DOG"` y, desde la 1.8, `"DOGC"` (Cataluña). Un valor distinto hace fallar la ejecución con código de salida 2. Ver [Boletines autonómicos](#boletines-autonómicos). |
| `relations` | verdadero o falso | `false` | Desde la 1.6. Lee, para cada disposición de la sección I del BOE, qué normas deroga, modifica, sustituye… Una petición más por disposición. Ver [Qué cambia cada disposición](#qué-cambia-cada-disposición-relations). |
| `followIds` | lista de textos | sin lista | Desde la 1.6. Máximo 100 identificadores del BOE con la forma `BOE-A-AAAA-N`; se recortan, se pasan a mayúsculas y se unifican los repetidos. Activa `relations` y entrega, aunque los filtros las dejaran fuera, las disposiciones que cambian alguna de esas normas. Un valor no válido hace fallar la ejecución con código de salida 2. Ver [Qué cambia cada disposición](#qué-cambia-cada-disposición-relations). |
| `onlyNew` | verdadero o falso | `false` | Ver [Cómo funciona `onlyNew`](#cómo-funciona-onlynew). |
| `emailTo` | texto (secreto) | sin correo | Una sola dirección. En el plan gratuito de Apify debe ser la de tu propia cuenta de Apify. Se guarda cifrada. Ver [Avisos](#avisos-por-correo-telegram-y-slack). |
| `notifyWhenEmpty` | verdadero o falso | `false` | Por defecto solo se avisa si la ejecución entrega algo; con `true` se avisa también cuando no hay novedades. |
| `telegramBotToken` | texto (secreto) | sin Telegram | Token del bot, con la forma `<número>:<texto>`. Requiere `telegramChatId`. Se guarda cifrado. |
| `telegramChatId` | texto | sin Telegram | Número del chat (negativo en grupos y canales) o `@nombre_del_canal`. Requiere `telegramBotToken`. |
| `slackWebhookUrl` | texto (secreto) | sin Slack | Webhook entrante de Slack (`https://hooks.slack.com/services/…`). Se guarda cifrado. |
| `maxItems` | entero | `500` | De 1 a 10 000. La ejecución se detiene al alcanzar este número de elementos. |
| `requestDelayMs` | entero | `1000` | De 500 a 10 000. Pausa en milisegundos entre dos peticiones al BOE. |

Si se rellenan varios de los filtros `departments`, `keywords` y `normTypes`, el elemento debe cumplir todos (dentro de cada lista basta una coincidencia). Las entradas en blanco se ignoran.

Ejemplo de entrada (ejemplo ilustrativo, en el formato de entrada de Apify):

```json
{
  "dateFrom": "2026-10-12",
  "dateTo": "2026-10-16",
  "departments": ["hacienda"],
  "keywords": ["modelo", "orden"],
  "onlyNew": true,
  "maxItems": 200
}
```

## Salida

Cada elemento del conjunto de datos tiene estos 12 campos, más el campo derivado `normType` y, desde la 1.5, `bulletin` (ver la tabla siguiente y [Boletines autonómicos](#boletines-autonómicos), donde se explican los valores de `id`, `section`, `source` y `sourceUrl` de cada boletín):

| Campo | Descripción |
|---|---|
| `id` | Identificador del BOE, con la forma `BOE-A-AAAA-N`. |
| `date` | Fecha de publicación del sumario (`AAAA-MM-DD`). |
| `bulletin` | Desde la versión 1.5: boletín de origen, `"BOE"`, `"BOJA"`, `"DOG"` o (desde la 1.8) `"DOGC"`. |
| `section` | `"1"` (sección I). Vale `"3"` solo en los elementos de la sección III, y solo si activas `sections` (ver [Sección III](#sección-iii-opcional)). |
| `department` | Departamento que emite la disposición, tal como lo publica el BOE. |
| `epigraph` | Epígrafe bajo el que aparece, o texto vacío si no tiene. |
| `title` | Título de la disposición, sin modificar. |
| `urlHtml` | Enlace a la versión HTML en `www.boe.es`. Puede faltar si el BOE no la ofrece. |
| `urlPdf` | Enlace al PDF en `www.boe.es`. Puede faltar. |
| `urlXml` | Enlace al XML en `www.boe.es`. Puede faltar. |
| `retrievedAt` | Campo derivado: momento (ISO 8601, UTC) en que el Actor obtuvo el dato. No procede del BOE. |
| `source` | Línea de fuente: `Fuente de los datos: Agencia Estatal Boletín Oficial del Estado`. |
| `sourceUrl` | `https://www.boe.es`. |
| `stage` | Desde la versión 1.7 y solo en la sección II-B: `convocatoria`, `actualizacion` u `otro`, derivada del título (una pista, no un dato oficial). Ver [Oposiciones](#oposiciones-sección-ii-b). |
| `changes` | Desde la versión 1.6 y solo con `relations` (o `followIds`), en la sección I del BOE: lista de normas que la disposición cambia. Ver [Qué cambia cada disposición](#qué-cambia-cada-disposición-relations). |
| `changesStatus` | Desde la versión 1.6 y solo con `relations`: `ok`, `pending`, `error` o `skipped`. |
| `followed` | Desde la versión 1.6 y solo con `followIds`: los identificadores seguidos que la disposición cambia (lista vacía si ninguno). |
| `sourceUpdated` | Desde la versión 1.8 y solo en el DOGC: fecha (`AAAA-MM-DD`, hora de Madrid) de la última actualización del conjunto de datos de la Generalitat de Catalunya. Falta si no se pudo leer. Ver [DOGC (Cataluña)](#dogc-cataluña). |
| `normType` | Campo derivado (desde la versión 1.1): tipo de norma que el Actor deduce del inicio del título, por ejemplo `Real Decreto-ley` u `Orden`. No es un metadato del BOE. Vale `Otro` si no se reconoce ningún tipo. |

Los enlaces solo se conservan si apuntan a `https://www.boe.es`.

Elemento de ejemplo (**inventado**, solo para mostrar el formato; no corresponde a una disposición real):

```json
{
  "id": "BOE-A-2026-99999",
  "date": "2026-10-16",
  "section": "1",
  "department": "MINISTERIO DE EJEMPLO",
  "epigraph": "Procedimientos administrativos",
  "title": "Orden EJE/0000/2026, de 15 de octubre, por la que se regula un procedimiento de ejemplo.",
  "urlHtml": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-99999",
  "urlPdf": "https://www.boe.es/boe/dias/2026/10/16/pdfs/BOE-A-2026-99999.pdf",
  "urlXml": "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-99999",
  "retrievedAt": "2026-10-16T09:30:00.000Z",
  "normType": "Orden",
  "source": "Fuente de los datos: Agencia Estatal Boletín Oficial del Estado",
  "sourceUrl": "https://www.boe.es"
}
```

## Tipo de norma (derivado)

El BOE no publica el tipo de norma en el sumario, así que el Actor lo deriva del título: compara el inicio del título con una lista fija de tipos, de más largo a más corto (`Real Decreto-ley` antes que `Real Decreto`, `Ley Orgánica` antes que `Ley`). Los títulos que empiezan por «Corrección de errores» son de ese tipo, sea cual sea la norma corregida. `Acuerdo internacional` solo se asigna a títulos que empiezan por «Acuerdo», «Canje de Notas» o «Convenio» del departamento de Asuntos Exteriores. Lo que no encaja en ninguno es `Otro`.

Es un campo derivado por este Actor, no un dato del BOE, y puede equivocarse: por ejemplo, un título que no empiece por el nombre de la norma (como una sentencia o un acuerdo de otro departamento) se clasifica como `Otro`, y los tipos que el BOE escribe de otra forma no se reconocen. Si lo reutilizas, indícalo como derivado.

## Sección III (opcional)

Desde la versión 1.4 puedes añadir la **sección III** del BOE («Otras disposiciones»), donde se publican convenios, ayudas, becas, planes de estudios y otros actos que no son de carácter general. Está **desactivada por defecto**: una ejecución sin el campo `sections` devuelve exactamente lo mismo que en la 1.3. Para activarla, indica `"sections": ["1", "3"]` (o `["3"]` si solo quieres esa sección). Cada elemento de la sección III lleva `"section": "3"`.

La sección III incluye muchos títulos que nombran a personas físicas (indultos, premios, condecoraciones, recursos, listas de adjudicatarios…). Por eso el Actor **no la lee entera**: aplica cuatro controles.

1. **Listado cerrado de epígrafes.** Solo pasan los elementos cuyo epígrafe es exactamente uno de estos (sin distinguir mayúsculas, pero las tildes deben coincidir exactamente: `Normalizacion` sin tilde no pasa): `Convenios`, `Encomienda de gestión`, `Delegación de competencias`, `Planes de estudios`, `Cartas de servicios`, `Subvenciones`, `Ayudas`, `Becas`, `Impacto ambiental`, `Instalaciones eléctricas`, `Homologaciones`, `Normalización`, `Mercado de divisas` y `Convenios colectivos de trabajo`. Todo lo demás se descarta, también los epígrafes parecidos (por ejemplo `Comunitat Valenciana. Convenio`, que no está en el listado), los elementos sin epígrafe y epígrafes como indultos, premios, títulos nobiliarios, recursos, condecoraciones, fundaciones, reales academias o sentencias.
2. **Filtro de tratamientos personales**, el mismo de la sección I (`don`, `doña`, `D.`, `D.ª`, `Dª`, `Dña`), al que en la sección III se suman `Sr.`, `Sra.`, `señor`, `señora`, `Dr.` y `Dra.`.
3. **Filtro de adjudicaciones y personas.** Se descarta el título que contiene alguna de estas expresiones, sin distinguir mayúsculas: `se conceden`, `se concede`, `concesión de los premios`, `a favor de`, `interpuesto por`, `se emplaza`, `beneficiari`, `adjudica` o `relación de`. La comparación ignora las tildes, los espacios repetidos o raros (por ejemplo el espacio de no separación) y las formas de compatibilidad (letras de ancho completo). Así se conservan las convocatorias, las bases y los convenios, y se descartan las listas de premiados o adjudicatarios.
4. **Documentos de identidad.** Se descarta el título que contiene algo con la forma de un DNI (ocho cifras y una letra, también con puntos, guion o espacio, como `12.345.678-Z`), de un NIE (X, Y o Z, siete cifras y una letra, también con separadores, como `X-1234567-L`) o de un DNI enmascarado (como `***4567*` o `***4.567**`).

Como en la sección I, solo se guardan metadatos y enlaces a `www.boe.es`: nunca el texto íntegro ni los anexos. En el registro de la ejecución solo aparecen los **recuentos** de lo descartado por el listado y por los filtros, nunca los títulos.

Límites, con toda claridad:

- **El filtro puede no detectar un nombre.** Es un filtro de texto sencillo, no entiende el contenido: un título de un epígrafe admitido que nombre a una persona de una forma que ninguna de las reglas anteriores reconoce (por ejemplo, el nombre de un autónomo que figura como razón social) pasará. Y puede descartar elementos que no tenían ningún problema.
- **No sustituye a una revisión.** Si vas a tratar, publicar o cruzar estos datos, el tratamiento posterior es **responsabilidad tuya**, incluido el cumplimiento del RGPD, de la LOPDGDD y de las condiciones de reutilización del BOE. Si usas la sección III, revisa lo que obtienes antes de difundirlo.
- **Es opcional**: si no la necesitas, déjala desactivada.
- El listado se amplía solo mediante un cambio revisado del Actor. Si ves en un resultado un título que nombra a una persona, abre una incidencia como se explica en [Contacto](#contacto), indicando **solo el identificador del BOE (`BOE-A-AAAA-N`) y la fecha**, nunca el título, ningún nombre ni ningún otro dato personal; lo retiramos en un plazo máximo de 7 días actualizando el filtro.
- El `normType` de estos elementos también se deriva del título y suele ser `Resolución` u `Otro`. Los filtros `departments`, `keywords` y `normTypes` se aplican igual.
- `onlyNew` guarda una memoria distinta cuando la sección III está activada, de modo que activarla no oculta nada ni mezcla lo ya entregado.

## Oposiciones (sección II-B)

Desde la versión 1.7 puedes añadir la **sección II-B** del BOE («II. Autoridades y personal. B. Oposiciones y concursos»): convocatorias de oposiciones y concursos de personal funcionario y laboral, sobre todo de administración local y universidades. Está **desactivada por defecto**. Para activarla, indica `"sections": ["2B"]` (o `["1", "2B"]` si también quieres la sección I). Cada elemento lleva `"section": "2B"` y el campo `stage`.

- **Por defecto, solo convocatorias.** Se entregan los elementos cuyo título anuncia una convocatoria (`se convoca`, `proceso selectivo`, `referente a la convocatoria`, `publica la convocatoria`, `anuncia convocatoria`, `bases de la convocatoria`, `provisión de puestos`). Con `"includeProcessUpdates": true` se entregan además las **actualizaciones** (relaciones provisionales o definitivas de admitidos y excluidos, tribunal, convocatorias desiertas, correcciones de errores, listas de aprobados, nombramientos) y los elementos sin fase reconocida (`otro`). Ejemplo de entrada: `{"sections": ["2B"], "departments": ["administración local"], "includeProcessUpdates": false}`.
- **La fase es una pista.** `stage` (`convocatoria`, `actualizacion` u `otro`) la deriva este Actor del título, sin distinguir mayúsculas ni tildes; no es un dato oficial y puede equivocarse en títulos poco habituales. Con `includeProcessUpdates` aumenta la probabilidad de que aparezcan títulos que se refieren a personas concretas (nombramientos, recursos); se descartan los que llevan tratamientos personales, documentos de identidad o expresiones como «a favor de» o «interpuesto por», pero el filtro no es infalible. Si un título encaja en una actualización y en una convocatoria (por ejemplo, «se aprueba la relación de admitidos en el proceso selectivo»), cuenta como actualización.
- **Lo que nunca se lee.** La sección II-A (nombramientos y ceses de personas) no se lee nunca, y no se pide ningún documento: solo metadatos y enlaces a `www.boe.es` del sumario, nunca el texto ni el contenido de las listas de admitidos o aprobados.
- **Filtro de nombres.** Se aplica el mismo filtro de tratamientos personales de la sección I (`don`, `doña`, `D.`, `D.ª`, `Dª`, `Dña`). Los títulos que lo activan se descartan y se cuentan. Es un filtro de texto sencillo: puede descartar algún título sin problema. Un «Don» o «Doña» dentro del nombre de un municipio tras «Ayuntamiento de» (por ejemplo, «Puebla de Don Fadrique (Granada)») no lo activa si el nombre va seguido de «(» o «,», es corto, no contiene palabras como «por», «que» o «nombra» y el tratamiento va con mayúscula justo detrás de «de» o «del», seguido solo de palabras con mayúscula hasta el final del nombre; un tratamiento al principio del nombre o detrás de otra palabra («Ayuntamiento de Valencia don …») hace que el título se descarte, y ante la duda también. Límite: una persona escrita como «Ayuntamiento de X de Don Nombre Apellido (» no se distingue de un municipio como «Valencia de Don Juan (León)» y no se descarta. Los títulos observados son institucionales, pero el filtro no garantiza la ausencia de datos personales y el tratamiento posterior es responsabilidad tuya.
- **Volumen.** Unas 35 disposiciones al día en total, de las que la gran mayoría son convocatorias. `maxItems` y los avisos las acotan igual que en las demás secciones; los filtros `departments`, `keywords` y `normTypes` funcionan igual. La opción `relations` no se aplica a la sección II-B.
- **Registro.** Solo aparecen recuentos: elementos descartados por el filtro de nombres y actualizaciones u otros omitidos por fase, nunca títulos.
- `onlyNew` guarda una memoria distinta cuando la sección II-B está activada, y otra si además se activa `includeProcessUpdates`.
- En los avisos, las oposiciones salen agrupadas por departamento con la etiqueta «Oposiciones» y, si no son convocatorias, su fase.

## Boletines autonómicos

Desde la versión 1.5 puedes leer, junto al BOE, las **disposiciones generales** de boletines autonómicos con el campo `bulletins`: el BOJA y el DOG desde la 1.5 y el DOGC (Cataluña) desde la 1.8. Por defecto vale `["BOE"]` y una ejecución sin el campo devuelve lo mismo que en la 1.4, con un campo más (`bulletin: "BOE"`). Ejemplo: `"bulletins": ["BOE", "BOJA", "DOG", "DOGC"]`.

| Boletín | Fuente oficial | Licencia | Línea de fuente (`source`) |
|---|---|---|---|
| BOJA (Andalucía) | API de datos abiertos de la Junta de Andalucía, `datos.juntadeandalucia.es/api/v0/boja`, sección «1. Disposiciones generales» | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) («Reconocimiento 4.0 Internacional»), según el conjunto [BOJA disposiciones del año 2026](https://www.juntadeandalucia.es/datosabiertos/portal/dataset/27e79cef-d68d-4b7c-9c87-ae82309d4dcb) del portal de datos abiertos de la Junta | `Fuente: Junta de Andalucía, BOJA (CC BY 4.0)` |
| DOG (Galicia) | RSS oficial de la sección I del Diario Oficial de Galicia, `www.xunta.gal/diario-oficial-galicia` | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es) (conjunto «Actualidade do Diario Oficial de Galicia» de [Abertos Xunta](https://abertos.xunta.gal/catalogo/administracion-publica/-/dataset/0262/actualidade-diario-oficial-galicia)) | `Fuente: Xunta de Galicia, Diario Oficial de Galicia (CC BY-SA 4.0)` |
| DOGC (Cataluña) | Conjunto «Normativa del DOGC i del Portal Jurídic de Catalunya» del portal de datos abiertos de la Generalitat, `analisi.transparenciacatalunya.cat` (leyes, decretos-ley, decretos, decretos legislativos y órdenes) | [Llicència oberta d'ús d'informació - Catalunya](https://web.gencat.cat/ca/generalitat/dades-indicadors/dades-obertes/llicencies) | `Fuente: Generalitat de Catalunya. Entitat Autònoma del Diari Oficial i de Publicacions de la Generalitat de Catalunya (EADOP)` |

### Qué cambia en la salida

- Todos los elementos llevan `bulletin` (`"BOE"`, `"BOJA"`, `"DOG"` o `"DOGC"`) y los mismos 12 campos de siempre. `source` y `sourceUrl` son los del boletín de origen; `section` es la etiqueta de su sección (`1. Disposiciones generales` en el BOJA, `I. Disposiciones generales` en el DOG, `1` en el DOGC).
- **Identificadores** de cada boletín (no siguen el formato `BOE-A-` del BOE): BOE `BOE-A-AAAA-N`; BOJA `disposition.AAAA.N.N` (el identificador del propio BOJA); DOG `DOG-código`, donde el código es el nombre del anuncio en la dirección oficial (por ejemplo `DOG-AnuncioC3K1-280926-0001`); DOGC `DOGC-número` (el número de control del conjunto de datos, por ejemplo `DOGC-26289051`).
- `urlXml` lo ofrece el BOE y el DOGC; el BOJA ofrece `urlPdf` y el DOG ofrece `urlHtml`. Los enlaces solo se conservan si apuntan al sitio oficial del boletín.
- `normType` se deduce del título; en el BOJA, si el título no empieza por un tipo conocido, se usa el tipo que publica el boletín; en el DOGC, al revés, se usa el rango de la norma que publica el boletín y solo si falta se deduce del título. Si no se reconoce, vale `Otro`. Los filtros `departments`, `keywords` y `normTypes` funcionan igual en todos los boletines.
- La opción `sections` (sección III) se aplica **solo al BOE**.
- El filtro de tratamientos personales (don, doña, D.…) se aplica a todos los boletines. De los boletines autonómicos solo se leen las disposiciones generales; nombramientos, adjudicaciones y anuncios se descartan por su sección y se cuentan en el registro.

### DOGC (Cataluña)

Desde la versión 1.8, `"DOGC"` lee el Diari Oficial de la Generalitat de Catalunya a través del conjunto de datos abiertos «Normativa del DOGC i del Portal Jurídic de Catalunya» (`analisi.transparenciacatalunya.cat`).

- **Qué cubre**: solo **leyes, decretos-ley, decretos, decretos legislativos y órdenes** (la sección 1 del DOGC). **No hay resoluciones** ni anuncios: el conjunto de datos no los incluye, así que una ejecución con el DOGC no ve toda la actividad del boletín.
- **Sin departamento**: el conjunto de datos no publica el órgano que emite la norma, así que `department` vale siempre texto vacío y el filtro `departments` **no encuentra elementos del DOGC**. Los filtros `keywords` y `normTypes` sí funcionan (el tipo sale del rango de la norma: `Ley`, `Decreto-ley`, `Decreto`, `Decreto Legislativo` u `Orden`). En los avisos, esos elementos aparecen bajo «DOGC (Cataluña)».
- **Sin retraso y con historial**: las normas aparecen el mismo día de su publicación en el DOGC. A diferencia del DOG, se puede pedir cualquier fecha del pasado: una petición por día (más páginas si un día supera 500 elementos). Un día sin normas (por ejemplo, un domingo) no es un error.
- **Título y enlaces**: el título es el texto en castellano que publica la Generalitat (si falta, el catalán), sin modificar salvo la retirada de caracteres de control y de dirección. `urlHtml`, `urlPdf` y `urlXml` apuntan al [Portal Jurídic de Catalunya](https://portaljuridic.gencat.cat) (versión en castellano; en catalán si no hay otra) y solo se conservan si son `https` de ese sitio. **El Portal Jurídic no es una edición auténtica oficial**: para cualquier efecto jurídico, consulta el texto publicado en el DOGC.
- **Atribución y licencia** ([Llicència oberta d'ús d'informació - Catalunya](https://web.gencat.cat/ca/generalitat/dades-indicadors/dades-obertes/llicencies)): se permite la reutilización, también en obras derivadas, citando la fuente, sin alterar el contenido ni su sentido e indicando la fecha de la última actualización de la información. Cada elemento lleva `source` (`Fuente: Generalitat de Catalunya. Entitat Autònoma del Diari Oficial i de Publicacions de la Generalitat de Catalunya (EADOP)`), `sourceUrl` (la página de la licencia) y `sourceUpdated`, la fecha de la última actualización del conjunto, que se lee con una sola petición adicional por ejecución (`api/views`); si esa petición falla, el campo se omite y la ejecución sigue. El pie de los resúmenes por correo, Telegram y Slack lleva la atribución, la dirección de la licencia, esa fecha y la frase «La Generalitat de Catalunya no participa en NormaWatch ni lo respalda.».
- `relations` y la sección II-B no se aplican al DOGC. Las peticiones llevan el `User-Agent` identificado, una pausa entre peticiones y un tope de 5 páginas por día.

### Memoria y reanudación

`onlyNew` y la reanudación (`STATE`) tienen en cuenta los boletines elegidos solo cuando no es el BOE solo, así que quien no usa la opción conserva su memoria. Si un boletín falla (error, límite de peticiones o cortacircuitos), solo fallan sus días y el resto sigue; la ejecución termina con código 1 únicamente si fallan todos los boletines elegidos. En el registro y en el resultado, los días fallidos de un boletín autonómico aparecen como `BOJA:AAAA-MM-DD`. Al reanudar tras una migración se continúa en el mismo día y en el mismo boletín, sin repetir ni saltar ninguno.

### Límites

- BOJA: una petición por fecha (hasta 200 elementos por página, como máximo 5 páginas), con la lista de campos cerrada: no se pide nunca el texto íntegro ni HTML. Un día sin boletín no es un error.
- DOG: el RSS solo contiene el **último número** con disposiciones generales, no admite una fecha. Un día se lee si la fecha del RSS coincide con la pedida. **El DOG sirve para ejecuciones diarias programadas, no para recuperar historial**: los días pasados devuelven siempre cero elementos; el registro de la ejecución lo avisa (una sola vez, con la fecha del número que trae el RSS y cuántas fechas pedidas no se pueden consultar). Se pide una sola vez por ejecución.
- DOGC: una petición por fecha (hasta 500 elementos por página, como máximo 5 páginas), más una petición de metadatos por ejecución para `sourceUpdated`. Un día sin normas devuelve una lista vacía, no un error.
- El DOG se pide una vez por ejecución y, si el RSS no responde (también con un 404), fallan solo los días del DOG.
- Pausa mínima, `User-Agent` identificado (`normawatch-boe/1.8 (+https://github.com/saidcveltran/normawatch-boe)`), sin seguir redirecciones, tope de tamaño de respuesta y tiempo máximo por petición, igual que con el BOE.

### Licencias y atribución

Mantén la línea de fuente (`source`) de cada elemento y la licencia de su boletín. **DOG (CC BY-SA 4.0, «compartir igual»)**: si compartes o publicas datos del DOG, incluidos los resúmenes que enviamos por correo, Telegram o Slack, o un conjunto que los combine con otros, debes citar la fuente, indicar si los has modificado y **distribuir tu obra derivada con la misma licencia CC BY-SA 4.0**, o una compatible. Eso afecta a lo que tú publicas con esos datos, no al uso interno. Los datos del BOJA (CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>) exigen citar la fuente, **enlazar la licencia** e **indicar si se han hecho cambios**; también los del DOG (CC BY-SA 4.0, <https://creativecommons.org/licenses/by-sa/4.0/>). En este Actor los cambios son: el campo `normType`, que se deriva del título; la selección de las disposiciones generales y de lo que cumple tus filtros; y la retirada de caracteres de control y de dirección del texto. Los resúmenes por correo, Telegram y Slack llevan en el pie la línea de fuente y la dirección de la licencia. **DOGC**: cita la fuente tal como figura en `source`, no alteres el contenido ni su sentido e indica la fecha de la última actualización (`sourceUpdated`); la licencia está en <https://web.gencat.cat/ca/generalitat/dades-indicadors/dades-obertes/llicencies>. Consulta el texto legal de cada licencia para los detalles.

### Qué no cubre

No se leen BOCM (Madrid), DOGV (Comunitat Valenciana) ni BOA (Aragón) porque no hay un punto de acceso automático y una licencia abierta confirmados. **BOPV (País Vasco)** tampoco está en la 1.5: su API de Open Data Euskadi (`api.euskadi.eus`, licencia CC BY 4.0) existe, pero el servidor responde 404 a las peticiones con el `User-Agent` identificado de NormaWatch (probado también con la forma `Mozilla/5.0 (compatible; normawatch-boe/1.5; +…)`) y solo responde a clientes genéricos; este Actor no se hace pasar por un navegador ni por otro programa. Se retomará si Open Data Euskadi admite un cliente identificado. No se hace extracción de páginas HTML. Cada boletín puede cambiar su formato; si falla, solo falla ese boletín.

## Qué cambia cada disposición (`relations`)

Desde la versión 1.6, con `relations` activada, el Actor pide a `www.boe.es` el documento XML de cada disposición de la **sección I** del BOE y lee únicamente su **análisis jurídico oficial** (las referencias a normas anteriores). Cada elemento añade:

- `changes`: lista de normas que la disposición deroga, modifica, sustituye, añade, desarrolla, transpone, corrige, etc. Cada entrada tiene `action` (la palabra en castellano: `deroga`, `modifica`, `sustituye`…), `code` (el código de la tabla oficial de relaciones del BOE), `targetId` (identificador de la norma afectada), `targetUrl` (solo para identificadores `BOE-A`: enlace a su texto consolidado en `www.boe.es`) y `detail` (texto breve del BOE sobre lo afectado, de hasta 300 caracteres; falta si empieza por `=`, `+`, `-` o `@` o contiene `<` o `>` (para que una hoja de cálculo o un navegador no lo tomen por fórmula o marcas; trátalo siempre como texto al mostrarlo o exportarlo), y falta si el filtro de tratamientos personales y de personas, el mismo que se aplica a los títulos, lo detecta).
- `changesStatus`: `ok` (análisis leído; `changes` puede estar vacío), `pending` (el BOE aún no ha publicado el análisis de ese documento), `error` (no se pudo leer el documento tras los reintentos) o `skipped` (no se consultó, por el tope de peticiones o por fallos seguidos).

Las relaciones débiles (`330` cita, `331` en relación con, `440` de conformidad con) no se incluyen. Las demás sí, aunque su código no tenga una palabra propia: entonces `action` es el texto oficial en minúsculas.

Basado en datos de la Agencia Estatal Boletín Oficial del Estado. El enlace `targetUrl` lleva a un texto consolidado **de carácter meramente informativo**, no oficial: solo el texto publicado en el BOE tiene validez oficial. El Actor guarda únicamente estas referencias, nunca el texto íntegro de las normas.

Ejemplo de entrada:

```json
{
  "dateFrom": "2026-10-15",
  "dateTo": "2026-10-15",
  "relations": true,
  "followIds": ["BOE-A-2021-3698"]
}
```

Fragmento del elemento resultante para el Real Decreto 824/2026 (datos reales del BOE del 15 de octubre de 2026, abreviado):

```json
{
  "id": "BOE-A-2026-21445",
  "changes": [
    { "action": "deroga", "code": 210, "targetId": "BOE-A-2025-5828", "targetUrl": "https://www.boe.es/buscar/act.php?id=BOE-A-2025-5828", "detail": "la Orden PJC/281/2025, de 21 de marzo" },
    { "action": "sustituye", "code": 245, "targetId": "BOE-A-2021-3698", "targetUrl": "https://www.boe.es/buscar/act.php?id=BOE-A-2021-3698", "detail": "los anexos II y III del Reglamento aprobado por Real Decreto 141/2021, de 9 de marzo" }
  ],
  "changesStatus": "ok",
  "followed": ["BOE-A-2021-3698"]
}
```

### Seguir normas (`followIds`)

Con `followIds` el Actor marca en `followed` las disposiciones que cambian alguna de esas normas, las entrega **aunque los filtros de `departments`, `keywords` o `normTypes` las dejaran fuera** y, en los avisos, las pone primero bajo «Cambia una ley que sigues» (con una frase como «El Real Decreto 824/2026 sustituye BOE-A-2021-3698»; el resto de elementos muestra un resumen corto, por ejemplo «deroga 1, modifica 2»). Para poder hacerlo se consulta el documento de **todas** las disposiciones de la sección I de cada día, también las que los filtros descartarían, y solo se entregan las que cambian una norma seguida o cumplen los filtros. Una disposición fuera de los filtros cuyo análisis aún está `pending` o falla no se entrega. Si el tope o los fallos seguidos impiden consultar una disposición fuera de los filtros (`skipped`), tampoco se entrega y el registro la cuenta aparte en `followCheckSkipped`.

**Aviso para rangos largos:** con `followIds` y un rango de muchos días se hacen muchas peticiones (de 2 a 11 por día, a razón de una por segundo como mínimo de pausa). Hay un tope de **1000 documentos por ejecución**; a partir de él el resto queda como `skipped` y el registro lo cuenta. Para vigilar normas, lo habitual es una ejecución diaria con `onlyNew`.

### Coste, límites y cuidados

- Una petición más por disposición de la sección I (de 2 a 11 al día), de una en una, con la misma pausa entre peticiones (`requestDelayMs`), el mismo `User-Agent`, el mismo tiempo máximo y tope de tamaño, sin seguir redirecciones y con los mismos reintentos que el resto. La dirección se construye solo con el identificador de la disposición, nunca con una dirección que venga en una respuesta.
- Tope de 1000 documentos por ejecución. Tras cinco fallos seguidos (ya reintentados), tras 50 fallos en total, o al llegar a 1500 peticiones HTTP (reintentos incluidos) para relaciones, no se piden más documentos en esa ejecución.
- Un fallo de un documento nunca hace fallar la ejecución ni cambia el código de salida: el elemento se entrega con `changesStatus` `error` o `skipped`. El registro muestra solo recuentos.
- **El análisis puede publicarse un día después.** Si el BOE aún no lo tiene, `changesStatus` vale `pending` y `changes` está vacío. Con `onlyNew` ese elemento no se vuelve a entregar, así que no se completará solo; para ese caso, lanza una ejecución de revisión sin `onlyNew` unos días después.
- No se aplica a la sección III ni a BOJA, DOG y DOGC: esos elementos no llevan estos campos.
- Con `relations` o `followIds` la memoria de `onlyNew` y el punto de control son distintos de los de antes (por eso la primera ejecución con la opción puede repetir elementos entregados sin ella). Sin la opción, la salida, las peticiones y la memoria son los de la 1.5.3.

## Vista de tabla en la consola de Apify

Desde la versión 1.1, la pestaña de resultados de la consola de Apify muestra una tabla con la vista **Resumen**: fecha, tipo de norma (derivado), departamento, título, enlace al PDF y enlace «Ver en el BOE». La vista **Todos los campos** muestra los campos base, `normType`, `stage` (solo en la sección II-B) y, con las opciones de relaciones, `bulletin`, `changes`, `changesStatus` y `followed`, con los enlaces como enlaces. Las vistas solo cambian cómo se ve el resultado en la consola; los datos que descargas (JSON, CSV…) y la API no cambian.

## Ejemplo de resultado

Representación de la vista Resumen con datos reales del BOE de los días 16, 17 y 19 de octubre de 2026, obtenidos con una ejecución real del Actor (no es una captura de la consola de Apify).

![Representación de la vista Resumen con datos reales del BOE](https://normawatch.aiskaron.com/muestras/tabla-resumen.png)

Una disposición completa en JSON: son datos reales del BOE del 16 de octubre de 2026.

![Ficha JSON de una disposición con datos reales del BOE](https://normawatch.aiskaron.com/muestras/ficha-json.png)

## Cómo funciona `onlyNew`

Con `onlyNew: true`, el Actor omite las disposiciones que ya entregó en ejecuciones anteriores de tu cuenta. Está pensado para ejecuciones programadas (por ejemplo, una al día).

- Recuerda los identificadores en el almacén clave-valor con nombre `SEEN`, de tu propia cuenta de Apify.
- Mantiene **una memoria por cada combinación de filtros** (`departments`, `keywords` y, solo si los usas, `normTypes` y la sección III): dos configuraciones distintas no se ocultan elementos entre sí. El orden de las entradas y las mayúsculas no cuentan. Quien no usa `normTypes` ni la sección III conserva la memoria que ya tenía.
- Cada memoria guarda hasta **50 000** identificadores; al superarlos se olvidan los más antiguos.
- Solo se recuerdan los elementos **realmente entregados**: los que quedan fuera por los filtros o por `maxItems` se podrán entregar en una ejecución posterior.
- Con `onlyNew: false` no se lee ni se escribe `SEEN`.
- En cualquier caso, un mismo identificador se entrega una sola vez por ejecución.
- **Evita que se solapen ejecuciones** con los mismos filtros: antes de guardar, el Actor vuelve a leer la memoria y la fusiona, pero lo más seguro es programar las ejecuciones con margen entre sí.
- Si `SEEN` no se puede leer, se avisa en el registro y se empieza con la memoria vacía. Si además tampoco se puede leer al guardar, no se escribe nada para no borrar la lista existente y la ejecución termina con código de salida 1.

## Avisos por correo, Telegram y Slack

Desde la versión 1.2 puedes recibir un resumen de lo que entrega cada ejecución. Es opcional: si no rellenas ningún campo de aviso, el Actor funciona exactamente como antes. Está pensado para una ejecución programada cada día con `onlyNew` activado; entonces recibes cada día solo lo nuevo. (El propio BOE ofrece un servicio gratuito de avisos, [Mi BOE](https://www.boe.es/mi_boe/), por materia y búsqueda guardada; NormaWatch añade tus filtros exactos de departamento, palabras y tipo de norma y la memoria de lo ya entregado.)

- **Correo (`emailTo`).** El resumen se envía con el Actor público `apify/send-mail` de Apify, en una ejecución aparte de 256 MB. En el plan gratuito de Apify solo se puede enviar a **la dirección de tu propia cuenta de Apify**; con un plan de pago, Apify admite más destinatarios, pero NormaWatch envía a una sola dirección. El asunto es siempre del tipo «NormaWatch: N disposiciones nuevas en el BOE (dd/mm/aaaa)» y el correo lleva el resumen agrupado por departamento (máximo 100 elementos, y «y N más» con el enlace al conjunto de datos).
- **Telegram (`telegramBotToken` y `telegramChatId`).** Se envían como máximo 10 mensajes por ejecución, con la separación que pide Telegram (si Telegram pide esperar, se espera una sola vez y, si persiste, se abandona el canal).
- **Slack (`slackWebhookUrl`).** Se envían como máximo 10 mensajes por ejecución, con una pausa entre ellos.
- **Cuándo se avisa.** Solo si la ejecución entrega al menos un elemento, salvo que actives `notifyWhenEmpty`.
- **Si un aviso falla.** La ejecución termina con código de salida `3` y el mensaje de estado indica qué canal falló (por ejemplo «Slack: error http-404»). Con avisos configurados y `onlyNew`, la memoria `SEEN` se actualiza **al final y solo si todos los avisos salieron bien**: como `SEEN` no se guarda, **todos los elementos de la ejecución** se entregarán de nuevo en la siguiente y se **reenviarán a todos los canales**, también a los que sí funcionaron. El conjunto de datos de la ejecución fallida sí los contiene. Un canal que sigue fallando (por ejemplo, un webhook de Slack revocado) hace que cada ejecución programada reenvíe la lista acumulada (hasta 10 mensajes por canal) y termine con código `3` hasta que lo arregles o vacíes ese campo.
- **Privacidad.** Los campos secretos (`emailTo`, `telegramBotToken` y `slackWebhookUrl`) usan la entrada secreta de Apify, que los guarda cifrados. El Actor no los escribe en el registro, en el mensaje de estado, en el conjunto de datos ni en `SEEN`; en caso de error solo registra el nombre del error y el estado HTTP. Los mensajes llevan solo los metadatos de la sección I (y de la III, si la activas) y los enlaces a `www.boe.es`, con la línea de fuente y el aviso de que no son un texto oficial. La dirección de correo y el resumen quedan guardados en texto plano en la entrada de la ejecución de `apify/send-mail`, dentro de tu propia cuenta de Apify, fuera del cifrado de la entrada secreta de NormaWatch. Si publicas el resumen en un canal público, lo estás publicando tú.

## Precio y límites

NormaWatch es gratuito: el autor no cobra nada por usarlo ni hay suscripción. Cada ejecución consume los recursos de tu propia cuenta de Apify, según las condiciones de la plataforma.

Límites del Actor:

- La fecha final puede ser como máximo 366 días posterior a la inicial (hasta 367 días en total), y ninguna fecha puede ser posterior a hoy.
- Máximo de elementos por ejecución: de 1 a 10 000 (500 por defecto).
- Memoria configurada: 256 MB (también por defecto en cada ejecución). Tiempo máximo de ejecución por defecto: 3600 s.

### Límites y trato respetuoso con el BOE

En pocas palabras: el Actor consulta el BOE con calma, haciendo las peticiones de una en una. Si el BOE está saturado, espera y reintenta hasta 3 veces; si sigue sin responder, pasa al día siguiente.

Detalles técnicos:

- Las peticiones se hacen de una en una, con una pausa mínima de 500 ms entre ellas (1000 ms por defecto).
- Una petición por día del intervalo; la fecha final puede ser como máximo 366 días posterior a la inicial (hasta 367 días en total).
- Con más de 31 días de diferencia entre `dateFrom` y `dateTo` (ejecuciones largas, hasta 366), la pausa efectiva entre peticiones es de al menos 1000 ms aunque configures `requestDelayMs` con menos, y los días se leen del más reciente al más antiguo, de modo que `maxItems` conserva lo más reciente. Con 31 días o menos todo sigue como antes.
- Cortacircuitos: si cinco días seguidos fallan (tras sus reintentos), la ejecución se detiene con código de salida `1` para no seguir cargando a un servidor con problemas. Un día sin BOE (404) no cuenta como fallo.
- Tiempo máximo de 30 s por petición.
- Ante una respuesta 429 o 5xx se reintenta hasta 3 veces con esperas de 2, 4 y 8 s (respetando `Retry-After` si lo envía el BOE, hasta 60 s). Si el BOE responde con límite de peticiones o error del servidor en dos días seguidos, la ejecución se detiene.
- Un 404 se interpreta como un día sin BOE (sin elementos).
- Las respuestas de más de 4 MiB se descartan.
- El Actor se identifica ante el BOE con un `User-Agent` propio.
- Con `relations` (1.6) se añade una petición por disposición de la sección I, con estos mismos límites y un tope de 1000 documentos por ejecución (ver [Qué cambia cada disposición](#qué-cambia-cada-disposición-relations)).

### Historial largo (hasta un año)

Una sola ejecución puede cubrir hasta 366 días de diferencia (367 fechas). Las peticiones son secuenciales, a razón de una por segundo como máximo, así que una ejecución así tarda unos 7 o 8 minutos (medido el 20 de octubre de 2026 en una ejecución local de 367 días: 367 peticiones, 7 min 19 s, sin fallos; en Apify puede variar). El BOE no publica un límite de peticiones, pero sus condiciones de reutilización le permiten suspender el acceso, por eso el Actor es prudente y se detiene ante fallos repetidos.

Cómo se comporta:

- **Punto de control.** Tras cada día el Actor guarda en el almacén clave-valor de la ejecución, bajo la clave `STATE`, la siguiente fecha por leer y lo entregado. Si Apify migra la ejecución a otro servidor o la reinicia, continúa desde esa fecha sin repetir días. Lo ya entregado se lee del propio conjunto de datos de la ejecución, así que no se duplica ningún elemento ni se pierde para el aviso o para `SEEN`. `maxItems` cuenta también lo entregado antes de la interrupción. Al terminar correctamente, `STATE` se borra.
- **`SEEN` y avisos.** Sin cambios: con aviso configurado, `SEEN` se confirma una sola vez al final y solo si el aviso salió bien; sin aviso, se confirma tras cada día, como en 1.2.
- **Orden.** Con más de 31 días, del más reciente al más antiguo.
- **Consejo.** Haz **una carga inicial** del historial que necesites (una ejecución) y después **ejecuciones diarias con `onlyNew`**: así cada día solo se consulta un día del BOE.

### Errores y códigos de salida

| Código | Significado |
|---|---|
| `0` | Ejecución correcta. Puede haber días con error aislado: se registran las fechas, y el resto de días se entrega. |
| `1` | Falló todo el intervalo (todos los días con error), el BOE respondió con límite de peticiones o error del servidor en días seguidos, fallaron cinco días seguidos (cortacircuitos), no se pudo guardar `SEEN`, o hubo un error inesperado. |
| `2` | Entrada no válida (por ejemplo, fecha futura, intervalo con fecha final más de 366 días posterior a la inicial, un campo con el tipo equivocado o un campo de aviso mal formado). El mensaje del registro indica el campo, nunca su valor. |
| `3` | Los elementos se entregaron al conjunto de datos, pero al menos un aviso (correo, Telegram o Slack) no salió. |

El registro contiene solo recuentos, fechas y estados, nunca títulos ni contenido de la respuesta.

## Preguntas frecuentes

### ¿Qué no hace?

- No incluye el texto íntegro de las disposiciones: solo metadatos y enlaces. Para leer el texto, usa los enlaces que devuelve.
- No lee otras secciones del BOE (II, IV, V…) ni otros boletines. De la sección III solo lee, si la activas, los epígrafes del listado y con los filtros descritos; no lee anexos ni textos íntegros, e indultos, premios, nombramientos y otros epígrafes con personas quedan fuera siempre.
- No garantiza que la sección III esté libre de datos personales: su filtro puede no detectar un nombre (ver [Sección III](#sección-iii-opcional)).
- No sustituye al BOE: el texto oficial y con validez es el que publica la Agencia.
- No guarda datos fuera de tu propio almacenamiento de Apify (los avisos solo envían el resumen a los canales que configures).

### ¿De dónde salen los datos?

Del sumario diario del BOE, que la Agencia Estatal Boletín Oficial del Estado publica como datos abiertos. Cada elemento lleva la línea de fuente en el campo `source` y su enlace en `sourceUrl`. Ver [Atribución y condiciones de reutilización](#atribución-y-condiciones-de-reutilización).

### ¿El tipo de norma es oficial?

No. El BOE no lo publica en el sumario: lo deduce este Actor del inicio del título, puede equivocarse y se marca como derivado. Ver [Tipo de norma (derivado)](#tipo-de-norma-derivado).

### ¿Puedo traer el historial de un año?

Sí, desde la versión 1.3: una ejecución admite hasta 366 días de diferencia entre `dateFrom` y `dateTo` (367 fechas). Tarda unos 7 u 8 minutos, porque hace una petición por segundo. El BOE conserva sumarios de muchos años, pero esta versión solo se ha probado con el último año. Si necesitas más, lanza varias ejecuciones de hasta 366 días. Haz la carga una vez y después programa ejecuciones diarias con `onlyNew`.

### ¿Cómo recibo solo lo nuevo cada día?

Activa `onlyNew` y programa una ejecución diaria. Ver [Cómo funciona `onlyNew`](#cómo-funciona-onlynew).

### ¿A qué dirección llega el correo?

Solo a la que indiques en `emailTo`. En el plan gratuito de Apify, la plataforma solo permite enviar a **la dirección de tu propia cuenta de Apify**; no se pueden añadir copias ni otros destinatarios. Con un plan de pago, Apify admite más destinatarios, pero NormaWatch sigue enviando a una sola dirección.

### ¿Cuánto cuesta enviar el correo?

NormaWatch sigue siendo gratuito, pero el correo se envía con una ejecución adicional del Actor `apify/send-mail`, que Apify factura a tu cuenta según su consumo de recursos y las condiciones de la plataforma. Consulta la [página de precios de Apify](https://apify.com/pricing) para ver el importe vigente. Telegram y Slack no tienen coste por este uso, más allá de unas pocas llamadas HTTPS dentro de la propia ejecución.

### ¿Cómo creo un bot de Telegram y obtengo su token?

En Telegram, abre una conversación con el bot oficial `@BotFather`, usa el comando `/newbot` y sigue los pasos: te entregará un token con la forma `<número>:<texto>`. Pégalo en `telegramBotToken` (no lo compartas ni lo publiques). Para el identificador del chat, escribe primero un mensaje a tu bot (o añádelo al grupo o canal donde quieras recibir el resumen) y usa el número del chat en `telegramChatId`; en un canal público también vale `@nombre_del_canal`, y el bot debe ser administrador con permiso para publicar.

### ¿Cómo creo un webhook entrante de Slack?

En la configuración de Slack de tu espacio de trabajo, crea una aplicación, activa los webhooks entrantes («Incoming Webhooks») y añade un webhook al canal que quieras. Slack te dará una dirección con la forma `https://hooks.slack.com/services/<T>/<B>/<clave>`. Pégala en `slackWebhookUrl`: es un secreto, porque quien la tenga puede publicar en ese canal. Solo se admiten direcciones de `hooks.slack.com`.

### ¿Es un servicio oficial del BOE o asesoramiento jurídico?

No es ninguna de las dos cosas. NormaWatch no es un servicio oficial del BOE ni de la AEBOE, su resultado no es un texto oficial y no sustituye al asesoramiento jurídico; para cualquier efecto jurídico, consulta el texto publicado por la Agencia.

## Atribución y condiciones de reutilización

Basado en datos de la [Agencia Estatal Boletín Oficial del Estado](https://www.boe.es).

Si reutilizas estos datos, mantén estas condiciones de la reutilización de la información del BOE:

- Cita la fuente: «Fuente de los datos: Agencia Estatal Boletín Oficial del Estado». Cada elemento ya la lleva en el campo `source`.
- Menciona la fecha de la última actualización de los documentos, cuando el documento original la incluya.
- No desnaturalices el sentido de la información: mantén sin alterar fechas, títulos y enlaces.
- No presentes el resultado como un texto oficial.
- Si modificas la información, hazlo de forma que se distinga qué elementos no proceden del original.
- Indica como derivado cualquier campo que añadas tú. En este Actor, `retrievedAt` y `normType` son derivados; con `relations`, también `action` (la palabra en castellano que el Actor da a cada código de relación), `changesStatus` y `followed`. Las referencias de `changes` proceden del análisis jurídico del BOE (basado en datos de la Agencia Estatal Boletín Oficial del Estado) y los enlaces `targetUrl` llevan a textos consolidados de carácter meramente informativo.
- No sugieras que el BOE o la Agencia respaldan tu producto o tu uso de los datos.

Estas condiciones resumen el aviso legal del BOE, cuyo texto es la fuente de referencia: <https://www.boe.es/informacion/aviso_legal/index.php>.

La salida de este Actor no es un texto oficial; para cualquier efecto jurídico, consulta el texto publicado por la Agencia en <https://www.boe.es>.

## No es un servicio oficial

NormaWatch no es un servicio oficial del BOE ni de la AEBOE. La Agencia Estatal Boletín Oficial del Estado no participa en este Actor, ni lo patrocina, ni lo respalda. Del mismo modo, ni la Junta de Andalucía ni la Xunta de Galicia participan en este proyecto ni lo respaldan, y la Generalitat de Catalunya no participa en NormaWatch ni lo respalda.

## Datos personales

El Actor no trata datos personales a propósito. Para evitarlo, aplica estos controles:

- **Por defecto, solo la sección I** (disposiciones generales), y solo metadatos y enlaces: nunca el texto íntegro, que es donde figuran los nombres de los firmantes.
- **Filtro de nombres**: se descarta cualquier título que contenga un tratamiento personal (`don`, `doña`, `D.`, `D.ª`, `Dª`, `Dña`) seguido de un espacio. Ante la duda, se descarta. En el registro solo queda el recuento de lo descartado, nunca el contenido.
- **Sección III, solo si la activas**: listado cerrado de epígrafes, filtro de adjudicaciones y personas y filtro de documentos de identidad, además del filtro de nombres (ver [Sección III](#sección-iii-opcional)). Estos filtros **reducen el riesgo pero no lo eliminan**: pueden no detectar un nombre dentro de un título admitido, y quien activa la opción es responsable del tratamiento posterior de los datos, incluido el cumplimiento del RGPD.

El Actor no guarda datos fuera de tu propio almacenamiento de Apify (conjunto de datos de la ejecución y, si lo activas, el almacén `SEEN`, que contiene solo identificadores del BOE).

Si activas los avisos, los datos que tú aportas (tu dirección de correo, el identificador del chat de Telegram, el token del bot o el webhook de Slack) se usan solo para enviar el resumen: el autor del Actor no los ve ni los recibe, Apify los trata como proveedor de tu cuenta, y el Actor no los escribe en el registro ni en ningún resultado. El resumen se envía a los servicios que elijas (Apify para el correo, Telegram, Slack) y contiene solo metadatos de la sección I (y de la III, si la activas).

## Mantenimiento

Tras cualquier cambio en las dependencias (`package.json` o `package-lock.json`), ejecuta `npm run deps:check` antes de confirmar los cambios. El control comprueba la antigüedad mínima de 7 días de los paquetes añadidos o cambiados respecto a la última versión publicada (instantánea `scripts/last-release-ls.json`), además de `npm audit` y OSV.

Las pruebas se mantienen fuera del repositorio público, por lo que `npm test` falla en un clon sin ellas.

## Cambios

Los cambios de cada versión están en el [registro de cambios](CHANGELOG.md).

## Licencia

MIT: puedes usar, copiar, modificar y distribuir el código, incluso con fines comerciales, siempre que conserves el aviso de copyright y de licencia; se ofrece sin garantía. El archivo `LICENSE` está en inglés, que es el texto con validez.

## Contacto

Dudas, errores o sugerencias: abre una incidencia en [GitHub](https://github.com/saidcveltran/normawatch-boe/issues). Las incidencias son públicas.

**Para pedir la retirada de un título** (por ejemplo, uno de la sección III que nombre a una persona), abre una incidencia con **solo el identificador del BOE (`BOE-A-AAAA-N`) y la fecha**. **Nunca escribas el título, ningún nombre ni ningún otro dato personal**, porque la incidencia es pública. Lo retiramos en un plazo máximo de 7 días actualizando el filtro.
