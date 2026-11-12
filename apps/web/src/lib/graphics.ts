export async function loadThree() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
  return import("./three-runtime");
}
