import type { ConnectorCapability } from "@/lib/workstation-types";

// These statuses describe adapters callable by this runtime. The repository
// contains rules for these systems, but no host connector is bound here yet.
export const connectorCapabilities: ConnectorCapability[] = [
  {
    id: "pdf",
    label: "Branded resume PDF",
    status: "available",
    detail: "Brand resume sends the TTTG resume form to the hosted branded resume builder. External-client blind MPC is not available yet.",
  },
  {
    id: "gmail",
    label: "Gmail",
    status: "not_connected",
    detail: "No Gmail adapter is connected. No draft or message action is available.",
  },
  {
    id: "calendar",
    label: "Calendar",
    status: "not_connected",
    detail: "No Calendar adapter is connected. No event action is available.",
  },
  {
    id: "drive",
    label: "Drive",
    status: "not_connected",
    detail: "No Drive adapter is connected. No Drive file action is available.",
  },
  {
    id: "tracker",
    label: "Tracker",
    status: "not_connected",
    detail: "No Sheets adapter is connected. Tracker remains unchanged.",
  },
  {
    id: "loxo",
    label: "Loxo",
    status: "not_connected",
    detail: "No Loxo adapter is connected. No candidate record action is available.",
  },
];
