import { toolsRequest } from "./client";
import type { ToolsCatalogResponse } from "./types";

export function fetchToolsCatalog(): Promise<ToolsCatalogResponse> {
  return toolsRequest<ToolsCatalogResponse>("/tools/catalog");
}
