import {
  type config,
  createDefaultFirstRunFile,
  compareSemVer,
  logger,
  autoRead,
  autoWrite,
  download,
  extract,
} from "@secureyoursoul/soulapi";
import fs from "node:fs/promises";
import os from "node:os";
import { join, dirname } from "node:path";

const log = logger("SoulUpdater");
type Apps = Record<string, config>;
async function getApps(config: config) {
  const Apps: Apps = {};
  try {
    const companyDir =
      process.platform === "win32"
        ? process.env.LOCALAPPDATA + "\\" + config.company.name
        : os.homedir() + `.${config.company.name}`;

    const folders = await fs
      .readdir(companyDir, { withFileTypes: true })
      .catch(() => []);

    for (const dirent of folders) {
      if (!dirent.isDirectory()) continue;
      const installFile = `${companyDir}/${dirent.name}/Data/install.json`;

      try {
        const appData = await autoRead(installFile);
        if (appData) Apps[dirent.name] = appData as config;
      } catch {
        continue;
      }
    }
  } catch (e: any) {
    log(`[SoulUpdater] [Apps] [GetApps] [Error 1]` + e, "error");
  }
  log(Apps);
  return Apps;
}

async function Update(config: config) {
  let token: string = "";

  // --- ZABEZPIECZENIE TOKENA (Poprawione z Twoim autoRead) ---
  token = (await autoRead("config.json", "utf-8"))?.token ?? "";

  const headers: Record<string, string> = {
    "User-Agent": "SoulUpdater",
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `token ${token}`;

  const Apps: Apps = await getApps(config);
  log(`[SoulUpdater] [Apps] ${Object.keys(Apps)}`);

  for (const key of Object.keys(Apps)) {
    const app: config = Apps[key];
    const fallbackUrl = `https://api.github.com/repos/8989denis/${app.name}`;

    // Twoja oryginalna logika URL
    let url: string =
      app.repository.url.length > 8
        ? app.repository.url
        : `https://api.github.com/repos/${config.company.name.replace(
            /\s+/g,
            "-"
          )}/${app.name}`;

    try {
      // --- CHECKING REPO ---
      let repoRes = await fetch(url, { headers });
      if (repoRes.status === 404) {
        log(
          `[SoulUpdater] [${key}] [Update] [Server] [Error 2] Server Not Found ${url}`,
          "warn"
        );
        const fallBackRes = await fetch(fallbackUrl, { headers });
        if (fallBackRes.status === 404) continue;
        url = fallbackUrl;
        log(`[SoulUpdater] [${key}] [Update] [Server] [Fallback] Found ${url}`);
      }

      // --- CHECKING RELEASE ---
      let releaseRes = await fetch(`${url}/releases/latest`, { headers });
      if (releaseRes.status === 404) {
        log(
          `[SoulUpdater] [${key}] [Update] [Server] [Error 3] Release Not Found ${url}/releases/latest`,
          "warn"
        );
        const fallBackRes = await fetch(fallbackUrl, { headers });
        if (fallBackRes.status === 404) continue;
        url = fallbackUrl;
        log(
          `[SoulUpdater] [${key}] [Update] [Server] [Fallback] Release Found ${url}/releases/latest`
        );
        releaseRes = fallBackRes;
      }

      if (releaseRes.ok) {
        const json = (await releaseRes.json()) as any;
        const cmp: number = compareSemVer(json.tag_name, app.version);

        if (cmp > 0) {
          log(
            `[SoulUpdater] [${key}] [Update] (${app.version}) -> (${json.tag_name}) Update Available`
          );

          // --- TWOJE FILTRY ASSETÓW (ZACHOWANE 1:1) ---
          const releaseAsset = json.assets.find((asset: any) => {
            const platform = process.platform;
            const arch = process.arch;
            const name = asset?.name;
            if (!name) return false;
            if (
              platform === "win32" &&
              arch === "x64" &&
              name.includes("win-x64")
            )
              return true;
            if (
              platform === "win32" &&
              arch === "arm64" &&
              name.includes("win-arm64")
            )
              return true;
            if (
              platform === "linux" &&
              arch === "x64" &&
              name.includes("linux-x64")
            )
              return true;
            if (
              platform === "linux" &&
              arch === "arm64" &&
              name.includes("linux-arm64")
            )
              return true;
            if (
              platform === "darwin" &&
              arch === "x64" &&
              name.includes("macos-x64")
            )
              return true;
            if (
              platform === "darwin" &&
              arch === "arm64" &&
              name.includes("macos-arm64")
            )
              return true;
            return false;
          });

          if (!releaseAsset) {
            log(
              `[SoulUpdater] [${key}] [Server] [Error 4] No Suitable Release Asset Found for ${process.platform}-${process.arch}`,
              "error"
            );
            continue;
          }

          // --- POBIERANIE I INSTALACJA (Ulepszone Twoim download/extract) ---
          const tempFilePath: string = join(os.tmpdir(), releaseAsset.name);

          try {
            // 3. POBIERANIE (SoulFS)
            await download(releaseAsset.browser_download_url, tempFilePath);
            log(
              `[SoulUpdater] [${key}] [Update] Downloaded Update to ${tempFilePath}`
            );

            // 4. INSTALACJA (WYPAKOWYWANIE)
            // Folder główny aplikacji
            const appFolder = dirname(app.installPath);

            log(`[SoulUpdater] [${key}] Installing to ${appFolder}...`);
            await extract(tempFilePath, appFolder);

            // 5. AKTUALIZACJA METADANYCH
            app.version = json.tag_name;
            app.lastUpdate = new Date().toISOString();

            // Zapisujemy nową wersję używając autoWrite
            await autoWrite(app.installPath, app);

            // Usuwamy pobrany ZIP (fs.promises.unlink obsługuje .catch)
            await fs.unlink(tempFilePath).catch(() => {});

            log(
              `[SoulUpdater] [${key}] Success! App updated to ${json.tag_name}`
            );
            log(`[SoulUpdater] [${key}] [Update] Updated`);
            continue;
          } catch (e: any) {
            log(
              `[SoulUpdater] [${key}] [Update] [Download] [Error 5] Error: ${e.message}`,
              "error"
            );
          }
        } else if (cmp === 0)
          log(`[SoulUpdater] [${key}] [Update] (${app.version}) Up To Date`);
        else
          log(
            `[SoulUpdater] [${key}] [Update] Installed (${app.version}) > (${json.tag_name}) Is Newer Than Latest`
          );
      } else
        log(
          `[SoulUpdater] [${key}] [Update] [Server] [Error 6] ${releaseRes.status}`,
          "error"
        );
    } catch (e: any) {
      if (e instanceof SyntaxError)
        log(
          `[SoulUpdater] [${key}] [Update] [JSON] [Error 7] Parse Error: ${e.message}`,
          "error"
        );
      else
        log(
          `[SoulUpdater] [${key}] [Update] [Connection] [Error 8] Error: ${e.message}`,
          "error"
        );
    }
    log(`[SoulUpdater] [${key}] [Update] Canceled`);
  }
}

// Nieobsłużone błędy
process.on("uncaughtException", (e: any) => {
  log(`[SoulUpdater] [UncaughtException] [Error 9] ${e.message}`, "error");
  process.exit(1);
});

async function main() {
  try {
    const config: config = (await import("./changedPackage.json")).default;
    await createDefaultFirstRunFile(config);
    const runUpdate = async () => {
      await Update(config);
      setTimeout(runUpdate, 4 * 60 * 60 * 1000);
    };
    await runUpdate();
  } catch (e: any) {
    log(`[SoulUpdater] [Error 10] ${e.message}`, "error");
  }
}

main();
