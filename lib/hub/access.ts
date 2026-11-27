import { roleFromDatabase } from "@/lib/auth/roles";
import { getAuth } from "@/lib/auth/server";
import { ownerSession } from "@/lib/auth/owner";
import { database } from "@/lib/db";
import { HttpError } from "./security";
import type { Staff } from "./types";
export async function clientSession() {
  try {
    const { data } = await getAuth().getSession();
    const user = data?.user;
    return user?.emailVerified ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}
export async function staffSession(): Promise<Staff | null> {
  const owner = await ownerSession();
  if (owner)
    return {
      ...owner,
      role: "owner",
      restaurantIds: [],
      languages: ["en", "ru"],
    };
  const user = await clientSession();
  if (!user) return null;
  const rows =
    await database()`SELECT s.role,p.restaurant_ids,p.languages FROM staff_roles s LEFT JOIN hub_staff_profiles p ON p.user_id=s.user_id WHERE s.user_id=${user.id}`;
  const role = roleFromDatabase(rows[0]?.role);
  if (role !== "admin" && role !== "partner" && role !== "guide") return null;
  return {
    ...user,
    role,
    restaurantIds: rows[0].restaurant_ids || [],
    languages: rows[0].languages || ["en"],
  };
}
export async function requireStaff(
  roles: Staff["role"][] = ["owner", "admin"],
) {
  const staff = await staffSession();
  if (!staff)
    throw new HttpError(401, "Sign in with an approved staff account.");
  if (!roles.includes(staff.role))
    throw new HttpError(403, "This action requires a different staff role.");
  return staff;
}
export function partnerCan(staff: Staff, id: string) {
  return (
    staff.role === "owner" ||
    staff.role === "admin" ||
    staff.restaurantIds.includes(id)
  );
}
