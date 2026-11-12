// Native media parsers need runtime paths and locale, never application credentials.
function nativeEnvironment(source = process.env) {
  const result = {};
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "TZ",
    "SystemRoot",
    "WINDIR",
  ]) {
    if (source[name] !== undefined) result[name] = source[name];
  }
  return result;
}
function serviceEnvironment(names, source = process.env) {
  const result = nativeEnvironment(source);
  for (const name of names)
    if (source[name] !== undefined) result[name] = source[name];
  return result;
}
module.exports = { nativeEnvironment, serviceEnvironment };
