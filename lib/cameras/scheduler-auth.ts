import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
const jwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);
export function allowedWorkflow(p: JWTPayload) {
  return (
    p.repository_id === "1458725366" &&
    p.repository_owner_id === "354138630" &&
    p.repository === "aslansaid69-coder/travel-guide" &&
    p.ref === "refs/heads/main" &&
    p.workflow_ref ===
      "aslansaid69-coder/travel-guide/.github/workflows/camera-health.yml@refs/heads/main" &&
    ["schedule", "workflow_dispatch"].includes(String(p.event_name))
  );
}
export async function githubScheduleToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: `${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/cameras`,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
    });
    return allowedWorkflow(payload);
  } catch {
    return false;
  }
}
