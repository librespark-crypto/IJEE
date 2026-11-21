import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwindcssPostcss from "@tailwindcss/postcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "public", "offline");

fs.mkdirSync(outDir, { recursive: true });

function inlineCssFonts(cssText, cssDir) {
  return cssText.replace(/url\((['"]?)([^)'"]+)\1\)/g, (match, _quote, urlPath) => {
    if (urlPath.startsWith("data:") || urlPath.startsWith("http")) {
      return match;
    }
    const cleanPath = urlPath.split("?")[0].split("#")[0];
    const absPath = path.resolve(cssDir, cleanPath);
    if (!fs.existsSync(absPath)) {
      return match;
    }
    const ext = path.extname(absPath).toLowerCase();
    const mime =
      ext === ".woff2"
        ? "font/woff2"
        : ext === ".woff"
          ? "font/woff"
          : ext === ".ttf"
            ? "font/ttf"
            : "application/octet-stream";
    const b64 = fs.readFileSync(absPath).toString("base64");
    return `url("data:${mime};base64,${b64}")`;
  });
}

async function buildJs() {
  const aliasPlugin = {
    name: "offline-aliases",
    setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({
        path: path.join(rootDir, "src", "offline", "next-shim.tsx"),
      }));
      build.onResolve({ filter: /^next\/link$/ }, () => ({
        path: path.join(rootDir, "src", "offline", "next-shim.tsx"),
      }));
      build.onResolve({ filter: /^@\/lib\/storage$/ }, () => ({
        path: path.join(rootDir, "src", "offline", "storage-shim.ts"),
      }));
      build.onResolve({ filter: /^@\/components\/store$/ }, () => ({
        path: path.join(rootDir, "src", "offline", "store-shim.tsx"),
      }));
      build.onResolve({ filter: /^\.\/store$/ }, (args) => {
        if (args.importer.includes(`${path.sep}src${path.sep}components${path.sep}`)) {
          return { path: path.join(rootDir, "src", "offline", "store-shim.tsx") };
        }
        return undefined;
      });
      build.onResolve({ filter: /^@\// }, (args) => {
        const rel = args.path.slice(2);
        const base = path.join(rootDir, "src", rel);
        for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
          if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
            return { path: base + ext };
          }
        }
        return { path: base };
      });
    },
  };

  await esbuild.build({
    entryPoints: [path.join(rootDir, "src", "offline", "offline-entry.tsx")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020"],
    outfile: path.join(outDir, "offline-app.js"),
    plugins: [aliasPlugin],
    loader: {
      ".woff2": "empty",
      ".woff": "empty",
      ".ttf": "empty",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
  console.log("Built public/offline/offline-app.js");
}

async function buildCss() {
  const globalsPath = path.join(rootDir, "src", "app", "globals.css");
  const globalsRaw = fs.readFileSync(globalsPath, "utf8");
  const result = await postcss([tailwindcssPostcss({ base: rootDir })]).process(globalsRaw, {
    from: globalsPath,
  });

  const katexCssPath = path.join(rootDir, "node_modules", "katex", "dist", "katex.min.css");
  let katexCss = "";
  if (fs.existsSync(katexCssPath)) {
    katexCss = inlineCssFonts(fs.readFileSync(katexCssPath, "utf8"), path.dirname(katexCssPath));
  }

  const combined = `${result.css}\n${katexCss}`;
  fs.writeFileSync(path.join(outDir, "offline-app.css"), combined, "utf8");
  console.log("Built public/offline/offline-app.css");
}

await Promise.all([buildJs(), buildCss()]);
