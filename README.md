<div align="center">

<img src="https://normawatch.aiskaron.com/logo/normawatch-icon.svg" alt="Icono de NormaWatch" width="112">

# NormaWatch

**Las nuevas disposiciones generales del BOE, cada día, listas para usar.**

<img src="https://img.shields.io/badge/Versi%C3%B3n-1.1.0-1636B5?style=flat" alt="Versión 1.1.0"> <img src="https://img.shields.io/badge/Licencia-MIT-0AB8D8?style=flat" alt="Licencia MIT"> <img src="https://img.shields.io/badge/Actor%20de%20Apify-00E58C?style=flat" alt="Actor de Apify"> <img src="https://img.shields.io/badge/Node.js-24-339933?style=flat" alt="Node.js 24"> <img src="https://img.shields.io/badge/Fuente-BOE-5B6B8C?style=flat" alt="Fuente BOE">

</div>

<p align="center"><img src="https://normawatch.aiskaron.com/muestras/portada.png" alt="Vista de ejemplo de NormaWatch con cuatro filas de datos reales del BOE (fecha, tipo de norma y título)" width="100%"></p>

**NormaWatch** es un **Actor de Apify** (así llama Apify a los programas que se ejecutan en su plataforma) que lista las nuevas **disposiciones generales** (sección I) del Boletín Oficial del Estado (BOE), solo con metadatos y enlaces, para que puedas vigilar la normativa nueva sin leer el sumario cada día. Está pensado para quien sigue la normativa española: asesorías, despachos, equipos de cumplimiento normativo y periodistas. Es **gratuito**: no tiene precio ni suscripción.

> Basado en datos de la [Agencia Estatal Boletín Oficial del Estado](https://www.boe.es). Este Actor no es un servicio oficial del BOE ni de la AEBOE, y su resultado no es un texto oficial. La Agencia no participa en este Actor, ni lo patrocina, ni lo respalda.

## Contenido

- [Qué hace](#qué-hace)
- [Para quién es](#para-quién-es)
- [Cómo usarlo](#cómo-usarlo)
- [Entrada](#entrada)
- [Salida](#salida)
- [Tipo de norma (derivado)](#tipo-de-norma-derivado)
- [Vista de tabla en la consola de Apify](#vista-de-tabla-en-la-consola-de-apify)
- [Ejemplo de resultado](#ejemplo-de-resultado)
- [Cómo funciona onlyNew](#cómo-funciona-onlynew)
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

- Consulta el sumario diario del BOE (API de datos abiertos) para las fechas que indiques, hasta 32 días en una ejecución.
- Se queda solo con la **sección I (disposiciones generales)** y devuelve, por cada una, sus **metadatos y los enlaces** oficiales en HTML, PDF y XML.
- Filtra por **departamento**, por **palabras del título** y por **tipo de norma**.
- Con `onlyNew` entrega solo lo que no se había entregado antes, pensado para una ejecución programada cada día.
- Añade el **tipo de norma**, deducido del título y marcado como derivado (ver [Tipo de norma](#tipo-de-norma-derivado)).
- Muestra el resultado como una **tabla en la consola de Apify** (ver [Vista de tabla](#vista-de-tabla-en-la-consola-de-apify)) y lo puedes descargar en los formatos que Apify ofrece para cualquier conjunto de datos (por ejemplo JSON o CSV).
- Incluye en cada elemento la **línea de fuente** que piden las condiciones de reutilización del BOE.

## Para quién es

Para quien necesita enterarse de la normativa nueva sin revisar el BOE a mano: despachos y asesorías, equipos de cumplimiento normativo, periodistas, desarrolladores que alimentan sus propios avisos o paneles, y cualquiera que quiera programar una ejecución diaria y recibir solo lo nuevo.

## Cómo usarlo

1. Abre el Actor en tu cuenta de Apify.
2. Rellena la entrada: las fechas (`dateFrom` y `dateTo`) y, si quieres, los filtros; una entrada vacía devuelve las disposiciones de hoy (ver [Entrada](#entrada)).
3. Ejecútalo, o programa una ejecución diaria con `onlyNew` activado para recibir solo lo nuevo (ver [Cómo funciona `onlyNew`](#cómo-funciona-onlynew)).
4. Lee el resultado en la pestaña de resultados, en la vista **Resumen** de la tabla.
5. Descarga el conjunto de datos en el formato que necesites (por ejemplo JSON o CSV) o léelo por la API de Apify.

## Entrada

Todos los campos son opcionales. Una entrada vacía devuelve las disposiciones de hoy (fecha de Madrid, zona horaria Europe/Madrid).

| Campo | Tipo | Valor por defecto | Límites |
|---|---|---|---|
| `dateFrom` | texto `AAAA-MM-DD` | hoy (Europe/Madrid) | Fecha real del calendario; no puede ser posterior a hoy. |
| `dateTo` | texto `AAAA-MM-DD` | el valor de `dateFrom` | No puede ser anterior a `dateFrom` ni posterior a hoy; como máximo 31 días después de `dateFrom`. |
| `departments` | lista de textos | sin filtro | Máximo 50 entradas de 200 caracteres cada una. Se conserva el elemento si su departamento contiene alguno de los textos (sin distinguir mayúsculas; texto literal, no expresión regular). |
| `keywords` | lista de textos | sin filtro | Máximo 50 entradas de 200 caracteres cada una. Se conserva el elemento si su título contiene alguno de los textos (sin distinguir mayúsculas; texto literal). |
| `normTypes` | lista de tipos de norma | sin filtro (todos los tipos) | Selector múltiple. Valores admitidos, tal como los escribe el BOE: `Corrección de errores`, `Instrumento de ratificación`, `Real Decreto Legislativo`, `Real Decreto-ley`, `Real Decreto`, `Ley Orgánica`, `Ley Foral`, `Ley`, `Decreto Legislativo`, `Decreto-ley`, `Decreto`, `Orden`, `Resolución`, `Circular`, `Acuerdo internacional` y `Otro`. Un valor distinto hace fallar la ejecución con código de salida 2. Ver [Tipo de norma](#tipo-de-norma-derivado). |
| `onlyNew` | verdadero o falso | `false` | Ver [Cómo funciona `onlyNew`](#cómo-funciona-onlynew). |
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

Cada elemento del conjunto de datos tiene estos 12 campos, más el campo derivado `normType` (ver la tabla siguiente):

| Campo | Descripción |
|---|---|
| `id` | Identificador del BOE, con la forma `BOE-A-AAAA-N`. |
| `date` | Fecha de publicación del sumario (`AAAA-MM-DD`). |
| `section` | Siempre `"1"` (sección I). |
| `department` | Departamento que emite la disposición, tal como lo publica el BOE. |
| `epigraph` | Epígrafe bajo el que aparece, o texto vacío si no tiene. |
| `title` | Título de la disposición, sin modificar. |
| `urlHtml` | Enlace a la versión HTML en `www.boe.es`. Puede faltar si el BOE no la ofrece. |
| `urlPdf` | Enlace al PDF en `www.boe.es`. Puede faltar. |
| `urlXml` | Enlace al XML en `www.boe.es`. Puede faltar. |
| `retrievedAt` | Campo derivado: momento (ISO 8601, UTC) en que el Actor obtuvo el dato. No procede del BOE. |
| `source` | Línea de fuente: `Fuente de los datos: Agencia Estatal Boletín Oficial del Estado`. |
| `sourceUrl` | `https://www.boe.es`. |
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

## Vista de tabla en la consola de Apify

Desde la versión 1.1, la pestaña de resultados de la consola de Apify muestra una tabla con la vista **Resumen**: fecha, tipo de norma (derivado), departamento, título, enlace al PDF y enlace «Ver en el BOE». La vista **Todos los campos** muestra los 12 campos y `normType`, con los enlaces como enlaces. Las vistas solo cambian cómo se ve el resultado en la consola; los datos que descargas (JSON, CSV…) y la API no cambian.

## Ejemplo de resultado

Representación de la vista Resumen con datos reales del BOE de los días 16, 17 y 19 de octubre de 2026, obtenidos con una ejecución real del Actor (no es una captura de la consola de Apify).

![Representación de la vista Resumen con datos reales del BOE](https://normawatch.aiskaron.com/muestras/tabla-resumen.png)

Una disposición completa en JSON: son datos reales del BOE del 16 de octubre de 2026.

![Ficha JSON de una disposición con datos reales del BOE](https://normawatch.aiskaron.com/muestras/ficha-json.png)

## Cómo funciona `onlyNew`

Con `onlyNew: true`, el Actor omite las disposiciones que ya entregó en ejecuciones anteriores de tu cuenta. Está pensado para ejecuciones programadas (por ejemplo, una al día).

- Recuerda los identificadores en el almacén clave-valor con nombre `SEEN`, de tu propia cuenta de Apify.
- Mantiene **una memoria por cada combinación de filtros** (`departments`, `keywords` y, solo si lo usas, `normTypes`): dos configuraciones distintas no se ocultan elementos entre sí. El orden de las entradas y las mayúsculas no cuentan. Quien no usa `normTypes` conserva la memoria que ya tenía.
- Cada memoria guarda hasta **50 000** identificadores; al superarlos se olvidan los más antiguos.
- Solo se recuerdan los elementos **realmente entregados**: los que quedan fuera por los filtros o por `maxItems` se podrán entregar en una ejecución posterior.
- Con `onlyNew: false` no se lee ni se escribe `SEEN`.
- En cualquier caso, un mismo identificador se entrega una sola vez por ejecución.
- **Evita que se solapen ejecuciones** con los mismos filtros: antes de guardar, el Actor vuelve a leer la memoria y la fusiona, pero lo más seguro es programar las ejecuciones con margen entre sí.
- Si `SEEN` no se puede leer, se avisa en el registro y se empieza con la memoria vacía. Si además tampoco se puede leer al guardar, no se escribe nada para no borrar la lista existente y la ejecución termina con código de salida 1.

## Precio y límites

NormaWatch es gratuito: el autor no cobra nada por usarlo ni hay suscripción. Cada ejecución consume los recursos de tu propia cuenta de Apify, según las condiciones de la plataforma.

Límites del Actor:

- La fecha final puede ser como máximo 31 días posterior a la inicial (hasta 32 días en total), y ninguna fecha puede ser posterior a hoy.
- Máximo de elementos por ejecución: de 1 a 10 000 (500 por defecto).
- Memoria configurada: 256 MB. Tiempo máximo de ejecución por defecto: 3600 s.

### Límites y trato respetuoso con el BOE

En pocas palabras: el Actor consulta el BOE con calma, haciendo las peticiones de una en una. Si el BOE está saturado, espera y reintenta hasta 3 veces; si sigue sin responder, pasa al día siguiente.

Detalles técnicos:

- Las peticiones se hacen de una en una, con una pausa mínima de 500 ms entre ellas (1000 ms por defecto).
- Una petición por día del intervalo; la fecha final puede ser como máximo 31 días posterior a la inicial (hasta 32 días en total).
- Tiempo máximo de 30 s por petición.
- Ante una respuesta 429 o 5xx se reintenta hasta 3 veces con esperas de 2, 4 y 8 s (respetando `Retry-After` si lo envía el BOE, hasta 60 s). Si el BOE responde con límite de peticiones o error del servidor en dos días seguidos, la ejecución se detiene.
- Un 404 se interpreta como un día sin BOE (sin elementos).
- Las respuestas de más de 4 MiB se descartan.
- El Actor se identifica ante el BOE con un `User-Agent` propio.

### Errores y códigos de salida

| Código | Significado |
|---|---|
| `0` | Ejecución correcta. Puede haber días con error aislado: se registran las fechas, y el resto de días se entrega. |
| `1` | Falló todo el intervalo (todos los días con error), el BOE respondió con límite de peticiones o error del servidor en días seguidos, no se pudo guardar `SEEN`, o hubo un error inesperado. |
| `2` | Entrada no válida (por ejemplo, fecha futura, intervalo con fecha final más de 31 días posterior a la inicial o un campo con el tipo equivocado). El mensaje del registro indica el campo. |

El registro contiene solo recuentos, fechas y estados, nunca títulos ni contenido de la respuesta.

## Preguntas frecuentes

### ¿Qué no hace?

- No incluye el texto íntegro de las disposiciones: solo metadatos y enlaces. Para leer el texto, usa los enlaces que devuelve.
- No lee otras secciones del BOE (II, III, IV, V…) ni otros boletines.
- No sustituye al BOE: el texto oficial y con validez es el que publica la Agencia.
- No guarda datos fuera de tu propio almacenamiento de Apify.

### ¿De dónde salen los datos?

Del sumario diario del BOE, que la Agencia Estatal Boletín Oficial del Estado publica como datos abiertos. Cada elemento lleva la línea de fuente en el campo `source` y su enlace en `sourceUrl`. Ver [Atribución y condiciones de reutilización](#atribución-y-condiciones-de-reutilización).

### ¿El tipo de norma es oficial?

No. El BOE no lo publica en el sumario: lo deduce este Actor del inicio del título, puede equivocarse y se marca como derivado. Ver [Tipo de norma (derivado)](#tipo-de-norma-derivado).

### ¿Cómo recibo solo lo nuevo cada día?

Activa `onlyNew` y programa una ejecución diaria. Ver [Cómo funciona `onlyNew`](#cómo-funciona-onlynew).

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
- Indica como derivado cualquier campo que añadas tú. En este Actor, `retrievedAt` y `normType` son derivados.
- No sugieras que el BOE o la Agencia respaldan tu producto o tu uso de los datos.

Estas condiciones resumen el aviso legal del BOE, cuyo texto es la fuente de referencia: <https://www.boe.es/informacion/aviso_legal/index.php>.

La salida de este Actor no es un texto oficial; para cualquier efecto jurídico, consulta el texto publicado por la Agencia en <https://www.boe.es>.

## No es un servicio oficial

NormaWatch no es un servicio oficial del BOE ni de la AEBOE. La Agencia Estatal Boletín Oficial del Estado no participa en este Actor, ni lo patrocina, ni lo respalda.

## Datos personales

El Actor no trata datos personales a propósito. Para evitarlo, aplica dos controles:

- **Solo la sección I** (disposiciones generales), y solo metadatos y enlaces: nunca el texto íntegro, que es donde figuran los nombres de los firmantes.
- **Filtro de nombres**: se descarta cualquier título que contenga un tratamiento personal (`don`, `doña`, `D.`, `D.ª`, `Dª`, `Dña`) seguido de un espacio. Ante la duda, se descarta. En el registro solo queda el recuento de lo descartado, nunca el contenido.

El Actor no guarda datos fuera de tu propio almacenamiento de Apify (conjunto de datos de la ejecución y, si lo activas, el almacén `SEEN`, que contiene solo identificadores del BOE).

## Mantenimiento

Tras cualquier cambio en las dependencias (`package.json` o `package-lock.json`), ejecuta `npm run deps:check` antes de confirmar los cambios. El control comprueba la antigüedad mínima de 7 días de los paquetes añadidos o cambiados respecto a la última versión publicada (instantánea `scripts/last-release-ls.json`), además de `npm audit` y OSV.

## Cambios

Los cambios de cada versión están en el [registro de cambios](CHANGELOG.md).

## Licencia

MIT: puedes usar, copiar, modificar y distribuir el código, incluso con fines comerciales, siempre que conserves el aviso de copyright y de licencia; se ofrece sin garantía. El archivo `LICENSE` está en inglés, que es el texto con validez.

## Contacto

Dudas, errores o sugerencias: contacto@aiskaron.com
