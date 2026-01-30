import { users } from "@shared/schema";
import { db } from "../../db.js";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<typeof users.$inferSelect | undefined>;
  upsertUser(user: ReplitAuthUser): Promise<typeof users.$inferSelect>;
}

interface ReplitAuthUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<typeof users.$inferSelect | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: ReplitAuthUser): Promise<typeof users.$inferSelect> {
    const name = [userData.firstName, userData.lastName].filter(Boolean).join(" ") || userData.email || "User";
    
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email || `${userData.id}@replit.user`,
        name,
        passwordHash: null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email || undefined,
          name,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();

export type User = typeof users.$inferSelect;
export type UpsertUser = ReplitAuthUser;
