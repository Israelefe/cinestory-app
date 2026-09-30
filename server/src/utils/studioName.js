import { z } from 'zod';

export function cleanStudioName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
}

export function studioNameKey(value) {
  return cleanStudioName(value).toLowerCase();
}

export const studioNameSchema = z.string()
  .max(200, 'Use 100 characters or fewer for your Studio or Brand name.')
  .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Use visible letters, numbers, spaces, or punctuation in your name.')
  .transform(cleanStudioName)
  .pipe(z.string().min(2, 'Enter your Studio or Brand name.').max(100, 'Use 100 characters or fewer for your Studio or Brand name.'));

export const studioNameTaken = {
  success: false, code: 'STUDIO_NAME_TAKEN', field: 'studioName',
  message: 'This Studio or Brand name is already in use. Choose another name.'
};

export function isStudioNameDuplicate(error) {
  return error?.code === 11000 && (error.keyPattern?.studioNameKey || error.keyValue?.studioNameKey || /studio_name_unique/.test(error.message || ''));
}
