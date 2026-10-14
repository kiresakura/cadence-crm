/** Demo workspace accounts. They only work when APP_ENV is not "production". */
export const DEMO_PASSWORD = "cadence-demo";

export const DEMO_ACCOUNTS = [
  { label: "Owner", email: "owner@demo.local", name: "Olivia Owner", role: "OWNER" },
  { label: "Member", email: "member@demo.local", name: "Marco Member", role: "MEMBER" },
  { label: "Viewer", email: "viewer@demo.local", name: "Vera Viewer", role: "VIEWER" },
] as const;
