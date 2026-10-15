// O build do plugin: um `main.js` em CommonJS, como o Obsidian carrega.
// `obsidian` e o que o Obsidian já traz ficam de fora do pacote. `producao`
// minifica e tira o mapa; sem ele, vigia e reconstrói a cada mudança.
import esbuild from "esbuild";
import { builtinModules } from "node:module";

const producao = process.argv[2] === "producao";

const contexto = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2022",
  platform: "browser",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  logLevel: "info",
  sourcemap: producao ? false : "inline",
  minify: producao,
  treeShaking: true,
  outfile: "main.js",
});

if (producao) {
  await contexto.rebuild();
  await contexto.dispose();
} else {
  await contexto.watch();
}
