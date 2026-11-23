import { z } from "zod";
import { CHART_PRICE_MAX } from "@/lib/chart-markets";

const price = z.number().finite().positive().max(CHART_PRICE_MAX);
const stamp = z.number().int().positive();

export const chartDrawingSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal("level"),
    price,
    label: z.string().trim().max(40),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("trend"),
    time1: stamp,
    price1: price,
    time2: stamp,
    price2: price,
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("zone"),
    time1: stamp,
    price1: price,
    time2: stamp,
    price2: price,
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("note"),
    time: stamp,
    price,
    text: z.string().trim().min(1).max(80),
  }),
]);

export const chartDrawingsSchema = z.array(chartDrawingSchema).max(150);

export type ChartDrawing = z.infer<typeof chartDrawingSchema>;
