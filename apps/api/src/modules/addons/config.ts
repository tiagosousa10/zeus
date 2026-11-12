import { z } from "zod";
const field = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .refine((v) => !["__proto__", "prototype", "constructor"].includes(v)),
  type: z.enum(["text", "number", "password", "checkbox", "select"]),
  title: z.string().max(200).optional(),
  default: z.string().max(1000).optional(),
  options: z.array(z.string().max(200)).max(100).optional(),
  required: z.boolean().optional(),
});
export type ConfigField = z.infer<typeof field>;
export function configFields(value: unknown): ConfigField[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((v) => {
    const parsed = field.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}
export function validateConfig(
  fields: ConfigField[],
  value: Record<string, unknown>,
) {
  const result: Record<string, string> = {};
  const keys = new Set(fields.map((f) => f.key));
  if (Object.keys(value).some((k) => !keys.has(k)))
    throw new Error("A configuração contém campos não declarados pelo Add-on.");
  for (const f of fields) {
    const raw =
      f.type === "checkbox" ? value[f.key] : (value[f.key] ?? f.default);
    if (f.type === "checkbox") {
      if (raw === true || raw === "on" || raw === "checked")
        result[f.key] = "on";
      continue;
    }
    if (raw === undefined || raw === "") {
      if (f.required) throw new Error(`Preenche ${f.title || f.key}.`);
      continue;
    }
    if (typeof raw !== "string" && typeof raw !== "number")
      throw new Error(`Valor inválido para ${f.title || f.key}.`);
    const text = String(raw);
    if (text.length > 4000)
      throw new Error("A configuração é demasiado longa.");
    if (f.type === "number" && !Number.isFinite(Number(text)))
      throw new Error(`Número inválido para ${f.title || f.key}.`);
    if (f.type === "select" && !f.options?.includes(text))
      throw new Error(`Escolha inválida para ${f.title || f.key}.`);
    result[f.key] = text;
  }
  return result;
}
