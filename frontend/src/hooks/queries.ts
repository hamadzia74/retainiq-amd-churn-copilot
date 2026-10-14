import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { api, type AtRiskParams } from "../api/client";

export const useHealth = () =>
  useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 15_000 });

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

export const useAtRisk = (params: AtRiskParams) =>
  useQuery({ queryKey: ["at-risk", params], queryFn: () => api.atRisk(params), placeholderData: keepPreviousData });

export const useCustomer = (id: string) =>
  useQuery({ queryKey: ["customer", id], queryFn: () => api.customer(id), enabled: !!id });

export const useMessage = () => useMutation({ mutationFn: api.message });

export const usePlan = (budget: number) =>
  useQuery({ queryKey: ["plan", budget], queryFn: () => api.plan(budget), placeholderData: keepPreviousData });

export const useModel = () => useQuery({ queryKey: ["model"], queryFn: api.model });
