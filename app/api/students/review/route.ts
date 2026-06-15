import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const reviewSchema = z
  .object({
    applications: z
      .array(
        z.object({
          id: z.string().uuid(),
          expectedVersion: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(100),
    status: z.enum(["verified", "rejected", "needs_more_information"]),
    reason: z.string().trim().max(500).nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.status !== "verified" &&
      (!value.reason || value.reason.length < 3)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reason is required.",
        path: ["reason"],
      });
    }
  });

export async function POST(request: Request) {
  const parsed = reviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide the required review details." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Student review is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("review_student_applications", {
    target_application_ids: parsed.data.applications.map(
      (application) => application.id,
    ),
    target_expected_versions: parsed.data.applications.map(
      (application) => application.expectedVersion,
    ),
    target_status: parsed.data.status,
    target_reason: parsed.data.reason,
  });
  if (error) {
    const isStale = error.message
      .toLowerCase()
      .includes("changed; refresh");
    return NextResponse.json(
      {
        error: isStale
          ? "One or more students changed while you were reviewing them. Refresh and try again."
          : "The student status could not be updated.",
      },
      { status: isStale ? 409 : 400 },
    );
  }

  return NextResponse.json({
    result: data,
    status: parsed.data.status,
    updatedCount: parsed.data.applications.length,
  });
}
