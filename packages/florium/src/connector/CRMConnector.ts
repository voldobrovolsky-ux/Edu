// TODO: Wire this module descriptor into the host CRM shell / navigation when embedding Flörium.

export interface FlöriumCRMModule {
  id: "florium";
  label: "Flörium";
  route: string;
  render: "embedded" | "iframe";
}

export const CRMConnector: FlöriumCRMModule = {
  id: "florium",
  label: "Flörium",
  route: "/florium",
  render: "embedded",
};
