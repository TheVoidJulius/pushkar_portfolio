import { z } from "zod";

/** Shared by the contact form (client) and /api/contact (server). */
export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Please tell me your name.").max(120, "That name is a bit long."),
  email: z.string().trim().email("That email doesn't look quite right.").max(200),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters.").optional().default(""),
  message: z
    .string()
    .trim()
    .min(10, "A little more detail, please (10+ characters).")
    .max(5000, "Messages are limited to 5,000 characters."),
  // Honeypot — real people leave this empty
  website: z.string().max(0).optional().default(""),
});

export type ContactInput = z.input<typeof ContactSchema>;
