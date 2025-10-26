const ACCESS_CONTROL_MOCK_URL = "bitvid:tests:access-control";
const MODERATION_SERVICE_MOCK_URL = "bitvid:tests:moderation-service";
const BOOTSTRAP_PATH_SUFFIX = "/js/bootstrap.js";

export function resolve(specifier, context, defaultResolve) {
  const parent = context?.parentURL || "";
  if (parent.endsWith(BOOTSTRAP_PATH_SUFFIX)) {
    if (specifier === "./accessControl.js") {
      return { url: ACCESS_CONTROL_MOCK_URL, shortCircuit: true };
    }
    if (specifier === "./services/moderationService.js") {
      return { url: MODERATION_SERVICE_MOCK_URL, shortCircuit: true };
    }
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url === ACCESS_CONTROL_MOCK_URL) {
    const source = `const mock = globalThis.__bootstrapAccessControlMock || null;
export const accessControl = mock;
export default accessControl;
`;
    return { format: "module", source, shortCircuit: true };
  }

  if (url === MODERATION_SERVICE_MOCK_URL) {
    const source = `const mock = globalThis.__bootstrapModerationServiceMock || {};
export const ModerationService = class {};
export default mock;
`;
    return { format: "module", source, shortCircuit: true };
  }

  return defaultLoad(url, context, defaultLoad);
}
