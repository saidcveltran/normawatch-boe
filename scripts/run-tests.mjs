// Ejecuta las pruebas con el ejecutor de Node. Las pruebas no se publican en este
// repositorio: si no hay carpeta `test/`, falla en lugar de dar un verde vacío.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(new URL("../test/", import.meta.url))) {
  console.error("Las pruebas no se publican en este repositorio: no hay carpeta test/, así que no se ejecuta nada.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test"], { stdio: "inherit" });
process.exit(result.status ?? 1);
