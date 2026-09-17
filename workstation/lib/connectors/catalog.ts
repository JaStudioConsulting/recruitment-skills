import type {
  AllowedProviderId,
  LogicalCapability,
  LogicalOperation,
  OperationMode,
} from "./types";

export interface OperationDefinition {
  capability: LogicalCapability;
  mode: OperationMode;
  approvalRequired: boolean;
}

export const OPERATION_DEFINITIONS = {
  "gmail.search": { capability: "gmail.read", mode: "read", approvalRequired: false },
  "gmail.read_message": { capability: "gmail.read", mode: "read", approvalRequired: false },
  "gmail.read_thread": { capability: "gmail.read", mode: "read", approvalRequired: false },
  "gmail.read_attachment": { capability: "gmail.read", mode: "read", approvalRequired: false },
  "gmail.create_draft": { capability: "gmail.draft", mode: "draft", approvalRequired: false },
  "gmail.update_draft": { capability: "gmail.draft", mode: "draft", approvalRequired: false },
  "gmail.send_draft": { capability: "gmail.send", mode: "write", approvalRequired: true },
  "calendar.search": { capability: "calendar.read", mode: "read", approvalRequired: false },
  "calendar.read_event": { capability: "calendar.read", mode: "read", approvalRequired: false },
  "calendar.read_availability": { capability: "calendar.read", mode: "read", approvalRequired: false },
  "calendar.create_event": { capability: "calendar.write", mode: "write", approvalRequired: true },
  "calendar.update_event": { capability: "calendar.write", mode: "write", approvalRequired: true },
  "drive.search": { capability: "drive.read", mode: "read", approvalRequired: false },
  "drive.read_metadata": { capability: "drive.read", mode: "read", approvalRequired: false },
  "drive.export": { capability: "drive.read", mode: "read", approvalRequired: false },
  "drive.upload": { capability: "drive.upload", mode: "write", approvalRequired: true },
  "sheets.read_metadata": { capability: "sheets.read", mode: "read", approvalRequired: false },
  "sheets.read_range": { capability: "sheets.read", mode: "read", approvalRequired: false },
  "tracker.prepare_update": { capability: "sheets.read", mode: "read", approvalRequired: false },
  "tracker.execute_update": { capability: "tracker.write", mode: "write", approvalRequired: true },
  "loxo.read_job": { capability: "loxo.read", mode: "read", approvalRequired: false },
  "loxo.read_candidate": { capability: "loxo.read", mode: "read", approvalRequired: false },
  "loxo.read_person": { capability: "loxo.read", mode: "read", approvalRequired: false },
  "loxo.prepare_update": { capability: "loxo.read", mode: "read", approvalRequired: false },
  "loxo.update_person": { capability: "loxo.write", mode: "write", approvalRequired: true },
  "loxo.create_person_event": { capability: "loxo.write", mode: "write", approvalRequired: true },
  "pdf.generate": { capability: "pdf.generate", mode: "write", approvalRequired: false },
} as const satisfies Record<LogicalOperation, OperationDefinition>;

export const PROVIDER_CAPABILITIES = {
  "host.gmail": ["gmail.read", "gmail.draft", "gmail.send"],
  "host.calendar": ["calendar.read", "calendar.write"],
  "host.drive": ["drive.read", "drive.upload"],
  "host.sheets": ["sheets.read", "tracker.write"],
  "host.loxo": ["loxo.read", "loxo.write"],
  "recruitment-mcp.pdf": ["pdf.generate"],
} as const satisfies Record<AllowedProviderId, readonly LogicalCapability[]>;

export function operationsForCapability(
  capability: LogicalCapability,
): readonly LogicalOperation[] {
  return (Object.entries(OPERATION_DEFINITIONS) as Array<
    [LogicalOperation, OperationDefinition]
  >)
    .filter(([, definition]) => definition.capability === capability)
    .map(([operation]) => operation);
}

export function definitionForOperation(
  operation: LogicalOperation,
): OperationDefinition {
  return OPERATION_DEFINITIONS[operation];
}
