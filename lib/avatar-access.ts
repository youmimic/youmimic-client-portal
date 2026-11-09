import type { Prisma } from "@/app/generated/prisma/client";

// The single definition of "may this user use this avatar" — owns it, or an
// admin marked it public (Avatar.isPublic). Every access-control site that
// used to check just { userId } must spread this in instead, so a public
// avatar behaves identically to an owned one everywhere a user can select or
// generate from one. Centralized here specifically so this never becomes a
// second enterpriseId-style flag that's inert at some call sites because
// nobody remembered to update them.
export function avatarAccessWhere(userId: string): Prisma.AvatarWhereInput {
  return { OR: [{ userId }, { isPublic: true }] };
}

// Strictly "this user's own, non-public avatars" — the complement of
// avatarAccessWhere. Used wherever a public avatar must never be treated as
// one of a user's own — the "Your avatars" gallery section, the dashboard
// home widget, and a new project's auto-picked starting avatar — even when
// that user happens to be the admin account a public avatar's row is
// nominally owned by (every public avatar still needs some real userId for
// the DB row and the /admin/avatars management UI, but that's bookkeeping,
// not personal ownership).
export function ownAvatarWhere(userId: string): Prisma.AvatarWhereInput {
  return { userId, isPublic: false };
}
