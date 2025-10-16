const MOCK_URL = "floating-ui:mock";

export function resolve(specifier, context, defaultResolve) {
  if (
    specifier === "@floating-ui/dom" ||
    specifier.endsWith("vendor/floating-ui.dom.bundle.min.js")
  ) {
    return { url: MOCK_URL, shortCircuit: true };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url === MOCK_URL) {
    const source = `const mock = globalThis.__floatingUiMock || {};
export const arrow = mock.arrow;
export const autoUpdate = mock.autoUpdate;
export const computePosition = mock.computePosition;
export const flip = mock.flip;
export const offset = mock.offset;
export const shift = mock.shift;
`;
    return { format: "module", source, shortCircuit: true };
  }

  return defaultLoad(url, context, defaultLoad);
}
