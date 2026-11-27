"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { canAssignRole, roleFromDatabase, type Role } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit";
import { database } from "@/lib/db";
import { back, failure, isRedirect, parseForm } from "@/lib/admin/form";

const schema = z.object({
  userId: z.string().trim().min(1).max(120),
  role: z.enum(["none", "admin", "guide", "partner"]),
});

export async function setRole(formData: FormData) {
  try {
    const actor = await authorize("users.manage");
    const input = parseForm(schema, formData);
    if (input.userId === actor.id) back("/admin/users", "You cannot change your own role.", "bad");
    const sql = database();
    const user = (
      await sql`SELECT u.id,u.email,s.role FROM neon_auth."user" u LEFT JOIN staff_roles s ON s.user_id=u.id WHERE u.id=${input.userId} AND u."emailVerified"=true`
    )[0];
    if (!user) back("/admin/users", "User not found or email not verified.", "bad");
    const current: Role = roleFromDatabase(user.role as string | null);
    if (!canAssignRole(actor.role, input.role, current))
      back("/admin/users", "This role change is not allowed.", "bad");
    if (input.role === "none")
      await sql`DELETE FROM staff_roles WHERE user_id=${input.userId} AND role<>'owner'`;
    else
      await sql`INSERT INTO staff_roles(user_id,email,role,updated_by) VALUES(${input.userId},${user.email},${input.role},${actor.id}) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,updated_at=now(),updated_by=EXCLUDED.updated_by WHERE staff_roles.role<>'owner'`;
    await recordAudit(actor, "user.role.set", input.userId, {
      email: user.email,
      from: current,
      to: input.role === "none" ? "tourist" : input.role,
    });
    revalidatePath("/admin/users");
    back("/admin/users", `Role updated for ${user.email}.`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/users", failure(error), "bad");
  }
}
