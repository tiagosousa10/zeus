export type ConfigField = {
  key: string;
  title?: string;
  type?: string;
  options?: string[];
  default?: string | boolean;
  required?: boolean;
};
export type Addon = {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  version?: string;
  resources?: Array<string | { name: string }>;
  configFields?: ConfigField[];
  configurationRequired?: boolean;
  configurable?: boolean;
};
