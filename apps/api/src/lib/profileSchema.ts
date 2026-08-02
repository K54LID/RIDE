import { z } from 'zod';

/** Shared shape for onboarding and profile edit. */

const shortText = z.string().trim().max(60);
const tagList = z.array(z.string().trim().min(1).max(40)).max(20);

export const ProfileCoreSchema = z.object({
  display_name: z.string().trim().min(1).max(50),
  /**
   * Required. The handle is how a person is addressed everywhere except
   * their own profile header and the Discover grid, so an account
   * without one cannot be referred to at all.
   */
  handle: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{1,24}$/, 'Username: 1–24 letters, numbers or underscores'),
  bio: z.string().trim().max(500).optional(),
  gender: shortText.optional(),
  pronouns: shortText.optional(),
  orientation: shortText.optional(),
  relationship_status: shortText.optional(),
  body_type: shortText.optional(),
  looking_for: tagList.optional(),
  interests: tagList.optional(),
  languages: tagList.optional(),
  tribes: tagList.optional(),
  height_cm: z.number().int().min(100).max(250).optional(),
  weight_kg: z.number().int().min(30).max(300).optional(),
});

export const OnboardingSchema = ProfileCoreSchema.extend({
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

export type ProfileCore = z.infer<typeof ProfileCoreSchema>;

/** Age in whole years, UTC, avoiding timezone drift at the boundary. */
export function ageOn(today: Date, birth: Date): number {
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export const MIN_AGE = 18;
