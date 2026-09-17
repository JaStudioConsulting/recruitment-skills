import { UnsupportedOperationError } from "./errors";
import { createStandaloneCapabilityRegistry } from "./registry";
import type {
  HostToolBroker,
  OperationRequest,
  OperationResult,
} from "./types";

export const standaloneCapabilityRegistry = createStandaloneCapabilityRegistry();

export class StandaloneBroker implements HostToolBroker {
  async capabilities() {
    return [];
  }

  async invoke<TPayload, TResult>(
    request: OperationRequest<TPayload>,
  ): Promise<OperationResult<TResult>> {
    throw new UnsupportedOperationError(
      request.operation,
      "Standalone mode has no injected host-tool broker.",
    );
  }
}
