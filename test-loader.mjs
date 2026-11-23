import { createRequire, registerHooks } from "node:module";

globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
globalThis.DOMRect ??= class DOMRect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.top = y;
    this.left = x;
    this.right = x + width;
    this.bottom = y + height;
  }
};

const requireCjs = createRequire(import.meta.url);
const VIRTUAL_THREE_URL = "file:///__khr3_body_test_three__/three.mjs";
const VIRTUAL_DREI_URL = "file:///__khr3_body_test_drei__/drei.mjs";

const identRe = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const reserved = new Set([
  "default", "__esModule", "arguments", "await", "break", "case", "catch", "class", "const",
  "continue", "debugger", "delete", "do", "else", "enum", "eval", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in", "instanceof", "interface",
  "let", "new", "null", "package", "private", "protected", "public", "return", "static", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield",
]);

function makeCjsWrapper(pkgName, globalKey) {
  const cjs = requireCjs(pkgName);
  globalThis[globalKey] = cjs;
  const keys = Object.keys(cjs).filter((k) => identRe.test(k) && !reserved.has(k));
  return [
    `const cjs = globalThis.${globalKey};`,
    `export const {\n  ${keys.join(",\n  ")},\n} = cjs;`,
    `export default cjs;`,
  ].join("\n");
}

const threeWrapperSource = makeCjsWrapper("three", "__KHR3_THREE_CJS__");
const dreiWrapperSource = makeCjsWrapper("@react-three/drei", "__KHR3_DREI_CJS__");

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isCjsRequire = Array.isArray(context.conditions) && context.conditions.includes("require");
    if (!isCjsRequire && specifier === "three" && context.parentURL !== VIRTUAL_THREE_URL) {
      return { url: VIRTUAL_THREE_URL, format: "module", shortCircuit: true };
    }
    if (!isCjsRequire && specifier === "@react-three/drei" && context.parentURL !== VIRTUAL_DREI_URL) {
      return { url: VIRTUAL_DREI_URL, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === VIRTUAL_THREE_URL) {
      return { format: "module", source: threeWrapperSource, shortCircuit: true };
    }
    if (url === VIRTUAL_DREI_URL) {
      return { format: "module", source: dreiWrapperSource, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
