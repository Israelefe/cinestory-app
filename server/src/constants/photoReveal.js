import { z } from 'zod';

export const revealSchema = z.object({ style: z.enum(['curtain', 'fade', 'lift']), movement: z.boolean(), ending: z.enum(['triptych', 'single']) }).strict();
