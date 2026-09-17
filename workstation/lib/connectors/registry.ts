import {
  definitionForOperation,
  operationsForCapability,
  PROVIDER_CAPABILITIES,
} from "./catalog";
import {
  CapabilityUnavailableError,
  ConnectorContractError,
} from "./errors";
import {
  ALLOWED_PROVIDER_IDS,
  LOGICAL_CAPABILITIES,
  type AllowedProviderId,
  type CapabilityDeclaration,
  type CapabilityState,
  type HostToolBroker,
  type LogicalCapability,
  type LogicalOperation,
} from "./types";

const ALLOWED_PROVIDER_SET = new Set<string>(ALLOWED_PROVIDER_IDS);

function isAllowedProviderId(provider: string): provider is AllowedProviderId {
  return ALLOWED_PROVIDER_SET.has(provider);
}

export function assertSafeProviderRoute(
  capability: LogicalCapability,
  provider: string,
): asserts provider is AllowedProviderId {
  if (!isAllowedProviderId(provider)) {
    throw new ConnectorContractError(
      "provider_not_allowed",
      `Provider ${provider} is not allowed for ${capability}.`,
    );
  }

  const supported = PROVIDER_CAPABILITIES[provider] as readonly LogicalCapability[];
  if (!supported.includes(capability)) {
    throw new ConnectorContractError(
      "provider_capability_mismatch",
      `Provider ${provider} cannot provide ${capability}.`,
    );
  }
}

function unavailableState(
  capability: LogicalCapability,
  checkedAt: string,
): CapabilityState {
  const isPdf = capability === "pdf.generate";
  return {
    capability,
    status: isPdf ? "pdf_builder_unavailable" : "connector_unavailable",
    provider: null,
    detail: isPdf
      ? "PDF generation requires an injected runtime broker capability."
      : "No host connector broker is available in standalone mode.",
    checkedAt,
    operations: operationsForCapability(capability),
  };
}

export class CapabilityRegistry {
  readonly #states: ReadonlyMap<LogicalCapability, CapabilityState>;

  constructor(states: readonly CapabilityState[]) {
    this.#states = new Map(states.map((state) => [state.capability, state]));
  }

  list(): readonly CapabilityState[] {
    return LOGICAL_CAPABILITIES.map((capability) => this.require(capability));
  }

  require(capability: LogicalCapability): CapabilityState {
    const state = this.#states.get(capability);
    if (!state) {
      throw new ConnectorContractError(
        "capability_not_registered",
        `Capability ${capability} is not registered.`,
      );
    }
    return state;
  }

  resolve(operation: LogicalOperation): CapabilityState {
    const definition = definitionForOperation(operation);
    const state = this.require(definition.capability);
    if (state.status !== "ready" || state.provider === null) {
      throw new CapabilityUnavailableError(state);
    }
    assertSafeProviderRoute(state.capability, state.provider);
    return state;
  }
}

export function createStandaloneCapabilityRegistry(
  now: Date = new Date(),
): CapabilityRegistry {
  const checkedAt = now.toISOString();
  return new CapabilityRegistry(
    LOGICAL_CAPABILITIES.map((capability) =>
      unavailableState(capability, checkedAt),
    ),
  );
}

export function createInjectedCapabilityRegistry(
  declarations: readonly CapabilityDeclaration[],
  now: Date = new Date(),
): CapabilityRegistry {
  const checkedAt = now.toISOString();
  const declared = new Map<LogicalCapability, CapabilityState>();

  for (const declaration of declarations) {
    assertSafeProviderRoute(declaration.capability, declaration.provider);
    if (declared.has(declaration.capability)) {
      throw new ConnectorContractError(
        "duplicate_capability",
        `Capability ${declaration.capability} has more than one provider declaration.`,
      );
    }
    declared.set(declaration.capability, {
      capability: declaration.capability,
      provider: declaration.provider,
      status: declaration.status,
      detail: declaration.detail ?? "Capability supplied by injected host broker.",
      checkedAt: declaration.checkedAt ?? checkedAt,
      operations: operationsForCapability(declaration.capability),
    });
  }

  return new CapabilityRegistry(
    LOGICAL_CAPABILITIES.map(
      (capability) => declared.get(capability) ?? unavailableState(capability, checkedAt),
    ),
  );
}

export async function registryFromBroker(
  broker: HostToolBroker | null | undefined,
  now: Date = new Date(),
): Promise<CapabilityRegistry> {
  if (!broker) return createStandaloneCapabilityRegistry(now);
  return createInjectedCapabilityRegistry(await broker.capabilities(), now);
}
