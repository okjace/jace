import { NextResponse } from "next/server";
import { authorizeAppeals, listAppeals } from "@/lib/integration";

/** Every appeal sent to Jace Official, newest activity first. Jace Official's owner and admins only. */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeAppeals(request);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json({ appeals: await listAppeals() });
}
