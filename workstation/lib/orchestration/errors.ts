export class OrchestrationContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OrchestrationContractError";
    this.code = code;
  }
}

export class ApprovalContractError extends OrchestrationContractError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "ApprovalContractError";
  }
}

export class IdempotencyContractError extends OrchestrationContractError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "IdempotencyContractError";
  }
}
