import { build } from "esbuild";
import { fork } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import JSON5 from "json5";
import { paths } from "node-dir";

const projectRoot = path.join(__dirname, "..");

const SHOULD_BUILD_CLI = true; // <- ignores target flags
const SHOULD_BUILD_LIB = true;

const tsConfig = JSON5.parse(
  fs.readFileSync(path.join(projectRoot, "tsconfig.json"), "utf8")
);

const fixPaths = (rootDir) => {
  return new Promise<void>((resolve, reject) => {
    paths(rootDir, (err, paths) => {
      if (err) return reject(err);
      for (const filePath of paths.files) {
        const dirname = path.join(filePath, "..");
        const relPath = path.relative(dirname, rootDir);
        fs.writeFileSync(
          filePath,
          fs
            .readFileSync(filePath, "utf8")
            .replace(/(["'])npm-lib-name\//g, `$1${relPath}/`)
        );
      }
      resolve();
    });
  });
};

const tsc = (config = tsConfig) => {
  fs.writeFileSync(path.join(projectRoot, "tsconfig.tmp.json"), JSON.stringify(config));
  return new Promise<void>((resolve, reject) => {
    const child = fork("./node_modules/.bin/tsc", ["--project", "tsconfig.tmp.json"], {
      cwd: projectRoot,
    });
    child.on("exit", (code) => {
      fs.removeSync(path.join(projectRoot, "tsconfig.tmp.json"));
      if (code) {
        reject(new Error(`Error code: ${code}`));
      } else {
        resolve();
      }
    });
  });
};

const generate = async () => {
  fs.removeSync(path.join(projectRoot, "dist"));

  if (SHOULD_BUILD_CLI) {
    await build({
      entryPoints: ["./cli/index.ts"],
      minify: true,
      bundle: true,
      outfile: "./dist/npm-lib-name",
      platform: "node",
      target: "es2017",
      logLevel: "info",
    });
  }

  if (SHOULD_BUILD_LIB) {
    // cjs
    await tsc({
      ...tsConfig,
      compilerOptions: {
        ...tsConfig.compilerOptions,
        outDir: "dist/cjs",
      },
      include: ["lib/**/*"],
    });
    fixPaths(path.join(projectRoot, "dist/cjs"));

    await tsc({
      ...tsConfig,
      compilerOptions: {
        ...tsConfig.compilerOptions,
        outDir: "dist/esm",
        module: "ES2020",
        moduleResolution: "node",
      },
      include: ["lib/**/*"],
    });
    fixPaths(path.join(projectRoot, "dist/esm"));
  }
};

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});