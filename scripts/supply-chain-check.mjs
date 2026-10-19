// Supply-chain gate for the Actor. Run before every push:
//   node scripts/supply-chain-check.mjs [--snapshot FILE] [--save-snapshot]
// Checks: 7-day release-age rule on added/changed packages, `npm ls --all --package-lock-only` diff against the last
// release snapshot, `npm audit --audit-level=moderate`, and an OSV query over the lockfile.
// Exit codes: 0 clean, 1 finding, 2 tool or network error (fail closed). Standard library only.
// Accepted advisories live in package.json `supplyChain.acceptedAdvisories`; each entry needs
// non-empty `ids`, a non-empty `reason` and a parseable `recheck` date, or the run exits 2.
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

/** Registry packages in a lockfile v3 object, as sorted [{name, version}]. */
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

/** Flatten `npm ls --all --json` output into a sorted list of "name@version". */
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

/** Diff two flattened ls lists: added and removed package names, and changed versions. */
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

/** Packages whose version was published less than minDays before `now`. */
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

/** Reject malformed accepted-advisory entries (fail closed, exit 2). */
export function validateAccepted(accepted, now = new Date()) {
  if (!Array.isArray(accepted)) throw new Error('accepted advisories must be an array');
  accepted.forEach((a, i) => {
    const where = `accepted advisory #${i + 1}`;
    if (
      !a ||
      !Array.isArray(a.ids) ||
      a.ids.length === 0 ||
      a.ids.some((x) => typeof x !== 'string' || x.trim() === '')
    ) {
      throw new Error(`${where}: "ids" must be a non-empty list of advisory ids`);
    }
    if (typeof a.reason !== 'string' || a.reason.trim() === '') {
      throw new Error(`${where} (${a.ids.join(', ')}): "reason" must be a non-empty string`);
    }
    if (typeof a.recheck !== 'string' || Number.isNaN(new Date(a.recheck).getTime())) {
      throw new Error(`${where} (${a.ids.join(', ')}): "recheck" must be a parseable date`);
    }
    if (new Date(a.recheck).getTime() > now.getTime() + MAX_RECHECK_DAYS * DAY_MS) {
      throw new Error(
        `${where} (${a.ids.join(', ')}): "recheck" is more than ${MAX_RECHECK_DAYS} days away`,
      );
    }
  });
}

function isAccepted(id, accepted, now) {
  return accepted.some((a) => a.ids.includes(id) && new Date(a.recheck).getTime() >= now.getTime());
}

/** Advisories from `npm audit --json` at moderate or above, split into open and accepted. */
export function auditFindings(audit, accepted, now) {
  if (audit?.error) {
    const { code = 'unknown', summary = '', detail = '' } = audit.error;
    const message = typeof audit.message === 'string' ? audit.message : '';
    throw new Error(`npm audit failed (${code}): ${summary} ${detail} ${message}`.trim());
  }
  if (
    audit?.auditReportVersion !== 2 ||
    !audit.vulnerabilities ||
    typeof audit.vulnerabilities !== 'object' ||
    Array.isArray(audit.vulnerabilities)
  ) {
    throw new Error('npm audit report has an unexpected shape (need auditReportVersion 2)');
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

/** OSV results (one entry per queried package, same order) into open and accepted findings. */
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
    if (!res.ok) throw new Error(`OSV query failed: HTTP ${res.status}`);
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
          if (!res.ok) throw new Error(`registry lookup failed for ${name}: HTTP ${res.status}`);
          return (await res.json()).time ?? {};
        }),
      );
    }
    return (await cache.get(name))[version] ?? null;
  };
}

/** Core run with injected effects. Returns { code, lines }. */
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
      `npm ls diff: ${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed`,
    );
    for (const a of diff.added) lines.push(`  added: ${a}`);
    for (const r of diff.removed) lines.push(`  removed: ${r}`);
    for (const c of diff.changed) lines.push(`  changed: ${c}`);
    const touched = new Set(current.filter((e) => !previous.includes(e)));
    toCheck = packages.filter((p) => touched.has(`${p.name}@${p.version}`));
  } else {
    lines.push(
      `npm ls diff: no previous snapshot, all ${current.length} packages treated as added`,
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
        ? `FAIL release age: ${v.name}@${v.version} has no publish date`
        : `FAIL release age: ${v.name}@${v.version} is ${v.ageDays.toFixed(1)} days old (minimum ${MIN_AGE_DAYS})`,
    );
  }
  lines.push(`release age: ${toCheck.length} package(s) checked, ${young.length} too new`);

  const a = auditFindings(audit, accepted, now);
  for (const f of a.open) {
    failed = true;
    lines.push(`FAIL npm audit: ${f.id} in ${f.name} (${f.severity})`);
  }
  for (const f of a.waived) lines.push(`accepted npm audit: ${f.id} in ${f.name} (${f.severity})`);

  const o = osvFindings(await osv(packages), packages, accepted, now);
  for (const f of o.open) {
    failed = true;
    lines.push(`FAIL osv: ${f.id} in ${f.name}`);
  }
  for (const f of o.waived) lines.push(`accepted osv: ${f.id} in ${f.name}`);

  lines.push(failed ? 'supply-chain check: FAILED' : 'supply-chain check: ok');
  return { code: failed ? 1 : 0, lines };
}

/** Run npm and parse its JSON stdout; returns { status, json }. */
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
    throw new Error(`npm ${args.join(' ')} produced no JSON: ${(res.stderr || '').slice(0, 200)}`);
  }
  return { status: res.status, json };
}

export const LS_ARGS = ['ls', '--all', '--json', '--package-lock-only'];

/**
 * The dependency tree as pinned by the lockfile (never the installed node_modules), flattened.
 * Fails closed when npm ls exits non-zero or reports `error` or `problems`.
 */
export function lockfileTree(npm) {
  const { status, json } = npm(LS_ARGS);
  if (status !== 0) throw new Error(`npm ls failed with exit code ${status}`);
  if (json?.error) throw new Error(`npm ls reported an error: ${JSON.stringify(json.error).slice(0, 200)}`);
  if (json?.problems) {
    throw new Error(`npm ls reported problems: ${JSON.stringify(json.problems).slice(0, 200)}`);
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
    console.log(`snapshot saved: ${snapshotPath}`);
  }
  return result.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`supply-chain check error: ${err.message}`);
      process.exit(2);
    },
  );
}
