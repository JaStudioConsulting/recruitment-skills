import { prepareCapabilityFromContext, type CapabilityPreparationOptions } from "@/lib/capabilities/prepare";
import { featureByPrimaryCapability } from "@/lib/capabilities/catalog";
import { capabilityById } from "@/lib/capabilities/registry";
import { ApiError } from "@/lib/server/api";
import { getCapabilityCaseContext } from "@/lib/server/case-repository";
import {
  createCapabilityRun,
  type CapabilityRunRecord,
} from "@/lib/server/capability-run-repository";
import { AVAILABLE_EXECUTOR_IDS } from "@/lib/server/capability-executors";
import { connectorCapabilities } from "@/lib/server/connectors";
import type { PreparedCapability } from "@/lib/capabilities/prepare";

export type CapabilityPreparationResponse = {
  preparation: PreparedCapability;
  run: CapabilityRunRecord | null;
};

export type CapabilityServiceDependencies = {
  getCapabilityCaseContext: typeof getCapabilityCaseContext;
  createCapabilityRun: typeof createCapabilityRun;
};

const DEFAULT_DEPENDENCIES: CapabilityServiceDependencies = {
  getCapabilityCaseContext,
  createCapabilityRun,
};

function effectivePreparationOptions(
  capabilityId: string,
  input: CapabilityPreparationOptions,
): CapabilityPreparationOptions {
  const executor = featureByPrimaryCapability(capabilityId);
  if (executor?.runtime !== "deterministic_server") return input;
  return {
    ...input,
    provider: "workstation",
    model: `${executor.id}-v1`,
  };
}

export async function prepareCapability(
  userId: string,
  caseId: string,
  capabilityId: string,
  input: CapabilityPreparationOptions,
): Promise<CapabilityPreparationResponse> {
  return prepareCapabilityWithDependencies(
    userId,
    caseId,
    capabilityId,
    input,
    DEFAULT_DEPENDENCIES,
  );
}

export async function prepareCapabilityWithDependencies(
  userId: string,
  caseId: string,
  capabilityId: string,
  input: CapabilityPreparationOptions,
  dependencies: CapabilityServiceDependencies,
): Promise<CapabilityPreparationResponse> {
  if (!capabilityById(capabilityId)) throw new ApiError(404, "Canonical capability was not found.");
  const context = await dependencies.getCapabilityCaseContext(userId, caseId);
  const effectiveInput = effectivePreparationOptions(capabilityId, input);
  const preparation = await prepareCapabilityFromContext(capabilityId, {
    ...context,
    connectors: connectorCapabilities,
    availableExecutorIds: AVAILABLE_EXECUTOR_IDS,
  }, effectiveInput);
  if (!preparation.canExecute) return { preparation, run: null };

  const run = await dependencies.createCapabilityRun(userId, {
    id: crypto.randomUUID(),
    caseId,
    prepared: preparation,
    input: {
      extraInput: effectiveInput.extraInput,
      provider: effectiveInput.provider,
      model: effectiveInput.model,
    },
  });
  return { preparation, run };
}
