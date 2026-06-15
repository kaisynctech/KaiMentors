import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  applicationIds: z.array(z.string().uuid()).max(1000),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the group details." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Student groups are not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc(
    "create_student_group_with_members",
    {
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_color: parsed.data.color,
      target_application_ids: parsed.data.applicationIds,
    },
  );
  if (error) {
    return NextResponse.json(
      {
        error: error.message.toLowerCase().includes("duplicate")
          ? "A group with this name already exists."
          : "The student group could not be created.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ groupId: data }, { status: 201 });
}
