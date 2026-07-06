import type { Metadata } from "next";

export function portalTitle(label: string): Metadata {
  return { title: { absolute: label } };
}
