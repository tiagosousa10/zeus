/** Allow only paths and locale variables required by native media parsers. */
export function nativeEnvironment(
  source?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
/** Add the explicit configuration keys needed by a child service. */
export function serviceEnvironment(
  names: string[],
  source?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
