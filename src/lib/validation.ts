import { z } from 'zod';

export const emailSchema = z.string().trim().min(1).email().transform(s => s.toLowerCase());

export const passwordSchema = z.string().min(10).max(72);

export const wordSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .refine(s => !/[\x00-\x1F\x7F-\x9F]/.test(s), { message: 'Invalid characters' });

export const freeTextSchema = z.string()
  .trim()
  .max(5000)
  .refine(s => !/[\x00-\x1F\x7F-\x9F]/.test(s), { message: 'Invalid control characters' });

// helpers
export function safeParseEmail(input: unknown) {
  return emailSchema.safeParse(String(input || ''));
}

export function safeParsePassword(input: unknown) {
  return passwordSchema.safeParse(String(input || ''));
}

export function safeParseWord(input: unknown) {
  return wordSchema.safeParse(String(input || ''));
}

export function safeParseFreeText(input: unknown) {
  return freeTextSchema.safeParse(String(input || ''));
}

export default {
  emailSchema,
  passwordSchema,
  wordSchema,
  freeTextSchema,
};
