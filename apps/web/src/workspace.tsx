import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
export const Workspace = createContext<any>(null);
export const useWorkspace = () => useContext(Workspace);
export function useEndpoint(path: string) {
  const { data } = useWorkspace();
  return useQuery({
    queryKey: [path, data.run.id],
    queryFn: () => api("/api/v1" + path),
  });
}
export function useCommand() {
  const qc = useQueryClient();
  const { data } = useWorkspace();
  return async (path: string, body: any = {}) => {
    const result = await api("/api/v1" + path, { runId: data.run.id, ...body });
    await qc.invalidateQueries();
    return result;
  };
}
