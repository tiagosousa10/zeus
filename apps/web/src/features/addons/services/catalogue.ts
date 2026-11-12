import { api } from "../../../shared/services/api";
import type { Addon } from "../models/addon";
export const loadAddons = () => api<{ addons: Addon[] }>("/addons");
