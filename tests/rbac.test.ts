import test from "node:test";
import assert from "node:assert/strict";
import {
  can,
  canAssignRole,
  PERMISSIONS,
  protectedArea,
  roleFromDatabase,
  ROLES,
  type Permission,
} from "../lib/auth/roles";
import { safeNext } from "../lib/auth/redirect";

test("only owner and admin can open the admin panel", () => {
  assert.equal(can("owner", "admin.access"), true);
  assert.equal(can("admin", "admin.access"), true);
  for (const role of ["guide", "partner", "tourist"] as const)
    assert.equal(can(role, "admin.access"), false, role);
  assert.equal(can(null, "admin.access"), false);
  assert.equal(can(undefined, "admin.access"), false);
});

test("owner-only permissions are denied to admins", () => {
  for (const p of [
    "guides.manage",
    "payments.refund",
    "pricing.manage",
    "assistant.manage",
    "users.manage",
    "settings.manage",
  ] as const) {
    assert.equal(can("owner", p), true, p);
    assert.equal(can("admin", p), false, p);
  }
});

test("admins can run day-to-day operations", () => {
  for (const p of [
    "places.write",
    "places.import",
    "bookings.manage",
    "reviews.moderate",
    "assistant.conversations",
    "audit.view",
  ] as const)
    assert.equal(can("admin", p), true, p);
});

test("no staff permission ever leaks to tourists or guides", () => {
  const staffOnly = (Object.keys(PERMISSIONS) as Permission[]).filter(
    (p) => !["trip.book", "review.write", "guide.workspace"].includes(p),
  );
  for (const p of staffOnly) {
    assert.equal(can("tourist", p), false, p);
    assert.equal(can("guide", p), false, p);
    assert.equal(can("partner", p), false, p);
  }
  assert.equal(can("guide", "guide.workspace"), true);
  assert.equal(can("tourist", "guide.workspace"), false);
});

test("every permission lists only known roles and always includes a real role", () => {
  for (const [p, roles] of Object.entries(PERMISSIONS)) {
    assert.ok(roles.length > 0, p);
    for (const r of roles) assert.ok((ROLES as readonly string[]).includes(r), `${p}:${r}`);
  }
});

test("database roles map safely: legacy manager→admin, unknown→tourist", () => {
  assert.equal(roleFromDatabase("manager"), "admin");
  assert.equal(roleFromDatabase("admin"), "admin");
  assert.equal(roleFromDatabase("owner"), "owner");
  assert.equal(roleFromDatabase("guide"), "guide");
  assert.equal(roleFromDatabase(null), "tourist");
  assert.equal(roleFromDatabase(undefined), "tourist");
  assert.equal(roleFromDatabase("superuser"), "tourist");
  assert.equal(roleFromDatabase("OWNER"), "tourist");
});

test("only the owner assigns roles and the owner role cannot be granted or removed", () => {
  assert.equal(canAssignRole("owner", "admin", "tourist"), true);
  assert.equal(canAssignRole("owner", "guide", "admin"), true);
  assert.equal(canAssignRole("owner", "none", "admin"), true);
  assert.equal(canAssignRole("owner", "owner", "tourist"), false);
  assert.equal(canAssignRole("owner", "none", "owner"), false);
  assert.equal(canAssignRole("owner", "admin", "owner"), false);
  assert.equal(canAssignRole("admin", "admin", "tourist"), false);
  assert.equal(canAssignRole("admin", "none", "guide"), false);
  assert.equal(canAssignRole("tourist", "admin", "tourist"), false);
});

test("proxy protects admin and account areas only", () => {
  assert.equal(protectedArea("/admin"), "admin");
  assert.equal(protectedArea("/admin/places/new"), "admin");
  assert.equal(protectedArea("/administrator"), null);
  assert.equal(protectedArea("/account"), "account");
  assert.equal(protectedArea("/guide"), "account");
  assert.equal(protectedArea("/guides"), null);
  assert.equal(protectedArea("/bookings/tb_abc"), "account");
  assert.equal(protectedArea("/build"), null);
  assert.equal(protectedArea("/"), null);
  assert.equal(protectedArea("/places/medeu"), null);
});

test("post-login redirect accepts only same-site paths", () => {
  assert.equal(safeNext("/admin/places"), "/admin/places");
  assert.equal(safeNext("https://evil.example"), "");
  assert.equal(safeNext("//evil.example"), "");
  assert.equal(safeNext("/\\evil.example"), "");
  assert.equal(safeNext("/ok\nSet-Cookie: x"), "");
  assert.equal(safeNext(["/a", "/b"]), "/a");
  assert.equal(safeNext(undefined), "");
});
