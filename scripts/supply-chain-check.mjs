// Control de cadena de suministro del Actor. Se ejecuta antes de cada publicación:
//   node scripts/supply-chain-check.mjs [--snapshot ARCHIVO] [--save-snapshot]
// Comprobaciones: regla de antigüedad de 7 días en los paquetes añadidos o cambiados, diferencia de
// `npm ls --all --package-lock-only` con la última instantánea de publicación, `npm audit --audit-level=moderate`
// y una consulta OSV sobre el archivo de bloqueo.
// Códigos de salida: 0 limpio, 1 hallazgo, 2 error de herramienta o de red (falla en cerrado). Solo biblioteca estándar.
// Los avisos aceptados están en `supplyChain.acceptedAdvisories` de package.json; cada entrada necesita
// `ids` no vacío, `reason` no vacío y una fecha `recheck` válida, o la ejecución termina con código 2.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_AGE_DAYS = 7;
const DAY_MS = 86_400_000;
export const MAX_RECHECK_DAYS = 30;
const OSV_URL = 'https://api.osv.dev/v1/querybatch';
const REGISTRY_URL = 'https://registry.npmjs.org/';
const MODERATE_UP = new Set(['moderate', 'high', 'critical']);

const here = dirname(fileURLToPath(import.meta.url));
const actorDir = resolve(here, '..');

function nameFromPath(path) {
  const i = path.lastIndexOf('node_modules/');
  return i < 0 ? null : path.slice(i + 'node_modules/'.length);
}

/** Paquetes del registro de un archivo de bloqueo v3, como [{name, version}] ordenado. */
export function lockPackages(lock) {
  const seen = new Map();
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    const name = nameFromPath(path);
    if (!name || meta.link || !meta.version) continue;
    seen.set(`${name}@${meta.version}`, { name, version: meta.version });
  }
  return [...seen.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

/** Aplana la salida de `npm ls --all --json` en una lista ordenada de "name@version". */
export function flattenLs(ls) {
  const out = new Set();
  const walk = (deps) => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      if (node.version) out.add(`${name}@${node.version}`);
      walk(node.dependencies);
    }
  };
  walk(ls.dependencies);
  return [...out].sort();
}

function byName(list) {
  const map = new Map();
  for (const entry of list) {
    const at = entry.lastIndexOf('@');
    const name = entry.slice(0, at);
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(entry.slice(at + 1));
  }
  return map;
}

/** Diferencia entre dos listas aplanadas: paquetes añadidos y quitados, y versiones cambiadas. */
export function diffSnapshots(previous, current) {
  const before = byName(previous);
  const after = byName(current);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [name, versions] of after) {
    if (!before.has(name)) {
      added.push(`${name}@${[...versions].sort().join(',')}`);
    } else {
      const old = [...before.get(name)].sort().join(',');
      const now = [...versions].sort().join(',');
      if (old !== now) changed.push(`${name}: ${old} -> ${now}`);
    }
  }
  for (const [name, versions] of before) {
    if (!after.has(name)) removed.push(`${name}@${[...versions].sort().join(',')}`);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

/** Paquetes cuya versión se publicó hace menos de minDays días respecto a `now`. */
export function ageViolations(entries, publishedAt, now, minDays = MIN_AGE_DAYS) {
  const bad = [];
  for (const { name, version } of entries) {
    const stamp = publishedAt[`${name}@${version}`];
    if (!stamp) {
      bad.push({ name, version, ageDays: null });
      continue;
    }
    const ageDays = (now.getTime() - new Date(stamp).getTime()) / DAY_MS;
    if (ageDays < minDays) bad.push({ name, version, ageDays });
  }
  return bad;
}

/** Rechaza las entradas mal formadas de avisos aceptados (falla en cerrado, código 2). */
export function validateAccepted(accepted, now = new Date()) {
  if (!Array.isArray(accepted)) throw new Error('los avisos aceptados deben ser una lista');
  accepted.forEach((a, i) => {
    const where = `aviso aceptado n.º ${i + 1}`;
    if (
      !a ||
      !Array.isArray(a.ids) ||
      a.ids.length === 0 ||
      a.ids.some((x) => typeof x !== 'string' || x.trim() === '')
    ) {
      throw new Error(`${where}: "ids" debe ser una lista no vacía de identificadores de aviso`);
    }
    if (typeof a.reason !== 'string' || a.reason.trim() === '') {
      throw new Error(`${where} (${a.ids.join(', ')}): "reason" debe ser un texto no vacío`);
    }
    if (typeof a.recheck !== 'string' || Number.isNaN(new Date(a.recheck).getTime())) {
      throw new Error(`${where} (${a.ids.join(', ')}): "recheck" debe ser una fecha válida`);
    }
    if (new Date(a.recheck).getTime() > now.getTime() + MAX_RECHECK_DAYS * DAY_MS) {
      throw new Error(
        `${where} (${a.ids.join(', ')}): "recheck" está a más de ${MAX_RECHECK_DAYS} días`,
      );
    }
  });
}

function isAccepted(id, accepted, now) {
  return accepted.some((a) => a.ids.includes(id) && new Date(a.recheck).getTime() >= now.getTime());
}

/** Avisos de `npm audit --json` de nivel moderado o superior, separados en abiertos y aceptados. */
export function auditFindings(audit, accepted, now) {
  if (audit?.error) {
    const { code = 'unknown', summary = '', detail = '' } = audit.error;
    const message = typeof audit.message === 'string' ? audit.message : '';
    throw new Error(`npm audit falló (${code}): ${summary} ${detail} ${message}`.trim());
  }
  if (
    audit?.auditReportVersion !== 2 ||
    !audit.vulnerabilities ||
    typeof audit.vulnerabilities !== 'object' ||
    Array.isArray(audit.vulnerabilities)
  ) {
    throw new Error('el informe de npm audit tiene una forma inesperada (se necesita auditReportVersion 2)');
  }
  const open = [];
  const waived = [];
  const seen = new Set();
  for (const [pkg, vuln] of Object.entries(audit.vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object') continue;
      if (!MODERATE_UP.has(via.severity)) continue;
      const id =
        String(via.url ?? '')
          .split('/')
          .pop() || String(via.source);
      const name = via.name ?? pkg;
      if (seen.has(`${name}:${id}`)) continue;
      seen.add(`${name}:${id}`);
      const item = { id, name, severity: via.severity };
      (isAccepted(id, accepted, now) ? waived : open).push(item);
    }
  }
  return { open, waived };
}

/** Resultados de OSV (una entrada por paquete consultado, en el mismo orden) como hallazgos abiertos y aceptados. */
export function osvFindings(results, packages, accepted, now) {
  const open = [];
  const waived = [];
  results.forEach((result, i) => {
    for (const vuln of result?.vulns ?? []) {
      const item = { id: vuln.id, name: `${packages[i].name}@${packages[i].version}` };
      (isAccepted(vuln.id, accepted, now) ? waived : open).push(item);
    }
  });
  return { open, waived };
}

export async function queryOsv(packages, fetchFn = fetch) {
  const results = [];
  for (let i = 0; i < packages.length; i += 500) {
    const slice = packages.slice(i, i + 500);
    const body = {
      queries: slice.map((p) => ({
        package: { name: p.name, ecosystem: 'npm' },
        version: p.version,
      })),
    };
    const res = await fetchFn(OSV_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`la consulta a OSV falló: HTTP ${res.status}`);
    results.push(...(await res.json()).results);
  }
  return results;
}

export function makePublishTimeLookup(fetchFn = fetch) {
  const cache = new Map();
  return async (name, version) => {
    if (!cache.has(name)) {
      cache.set(
        name,
        fetchFn(REGISTRY_URL + name.replace('/', '%2F'), {
          headers: { accept: 'application/json' },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`la consulta al registro falló para ${name}: HTTP ${res.status}`);
          return (await res.json()).time ?? {};
        }),
      );
    }
    return (await cache.get(name))[version] ?? null;
  };
}

/** Ejecución principal con efectos inyectados. Devuelve { code, lines }. */
export async function run(deps) {
  const { now, lock, previous, current, audit, accepted, osv, publishTime } = deps;
  validateAccepted(accepted, now);
  const lines = [];
  let failed = false;
  const packages = lockPackages(lock);

  let toCheck = packages;
  if (previous) {
    const diff = diffSnapshots(previous, current);
    lines.push(
      `diferencia de npm ls: ${diff.added.length} añadidos, ${diff.removed.length} quitados, ${diff.changed.length} cambiados`,
    );
    for (const a of diff.added) lines.push(`  añadido: ${a}`);
    for (const r of diff.removed) lines.push(`  quitado: ${r}`);
    for (const c of diff.changed) lines.push(`  cambiado: ${c}`);
    const touched = new Set(current.filter((e) => !previous.includes(e)));
    toCheck = packages.filter((p) => touched.has(`${p.name}@${p.version}`));
  } else {
    lines.push(
      `diferencia de npm ls: sin instantánea previa, los ${current.length} paquetes se tratan como añadidos`,
    );
  }

  const publishedAt = {};
  for (const p of toCheck) {
    publishedAt[`${p.name}@${p.version}`] = await publishTime(p.name, p.version);
  }
  const young = ageViolations(toCheck, publishedAt, now);
  for (const v of young) {
    failed = true;
    lines.push(
      v.ageDays === null
        ? `FALLO antigüedad: ${v.name}@${v.version} no tiene fecha de publicación`
        : `FALLO antigüedad: ${v.name}@${v.version} tiene ${v.ageDays.toFixed(1)} días (mínimo ${MIN_AGE_DAYS})`,
    );
  }
  lines.push(`antigüedad: ${toCheck.length} paquete(s) comprobados, ${young.length} demasiado nuevos`);

  const a = auditFindings(audit, accepted, now);
  for (const f of a.open) {
    failed = true;
    lines.push(`FALLO npm audit: ${f.id} en ${f.name} (${f.severity})`);
  }
  for (const f of a.waived) lines.push(`aceptado npm audit: ${f.id} en ${f.name} (${f.severity})`);

  const o = osvFindings(await osv(packages), packages, accepted, now);
  for (const f of o.open) {
    failed = true;
    lines.push(`FALLO osv: ${f.id} en ${f.name}`);
  }
  for (const f of o.waived) lines.push(`aceptado osv: ${f.id} en ${f.name}`);

  lines.push(failed ? 'control de cadena de suministro: FALLIDO' : 'control de cadena de suministro: correcto');
  return { code: failed ? 1 : 0, lines };
}

/** Ejecuta npm y analiza su salida JSON; devuelve { status, json }. */
function npmRun(args) {
  const res = spawnSync('npm', args, {
    cwd: actorDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  let json;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    throw new Error(`npm ${args.join(' ')} no produjo JSON: ${(res.stderr || '').slice(0, 200)}`);
  }
  return { status: res.status, json };
}

export const LS_ARGS = ['ls', '--all', '--json', '--package-lock-only'];

/**
 * El árbol de dependencias fijado por el archivo de bloqueo (nunca el node_modules instalado), aplanado.
 * Falla en cerrado si npm ls termina con código distinto de cero o informa de `error` o `problems`.
 */
export function lockfileTree(npm) {
  const { status, json } = npm(LS_ARGS);
  if (status !== 0) throw new Error(`npm ls falló con código de salida ${status}`);
  if (json?.error) throw new Error(`npm ls informó de un error: ${JSON.stringify(json.error).slice(0, 200)}`);
  if (json?.problems) {
    throw new Error(`npm ls informó de problemas: ${JSON.stringify(json.problems).slice(0, 200)}`);
  }
  return flattenLs(json);
}

async function main(argv) {
  const snapIdx = argv.indexOf('--snapshot');
  const snapshotPath =
    snapIdx >= 0 ? resolve(argv[snapIdx + 1]) : resolve(here, 'last-release-ls.json');
  const pkg = JSON.parse(readFileSync(resolve(actorDir, 'package.json'), 'utf8'));
  const current = lockfileTree(npmRun);
  const result = await run({
    now: new Date(),
    lock: JSON.parse(readFileSync(resolve(actorDir, 'package-lock.json'), 'utf8')),
    previous: existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, 'utf8')) : null,
    current,
    audit: npmRun(['audit', '--audit-level=moderate', '--json']).json,
    accepted: pkg.supplyChain?.acceptedAdvisories ?? [],
    osv: (packages) => queryOsv(packages),
    publishTime: makePublishTimeLookup(),
  });
  console.log(result.lines.join('\n'));
  if (argv.includes('--save-snapshot') && result.code === 0) {
    writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + '\n');
    console.log(`instantánea guardada: ${snapshotPath}`);
  }
  return result.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`error del control de cadena de suministro: ${err.message}`);
      process.exit(2);
    },
  );
}
