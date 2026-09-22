import { z } from "zod";

export const documentBlockSchema = z.object({ text: z.string().min(1) });
export const documentIrSchema = z.object({ id: z.string().uuid(), title: z.string().nullable(), blocks: z.array(documentBlockSchema) });
export type DocumentIr = z.infer<typeof documentIrSchema>;
