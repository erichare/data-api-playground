import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasKey: !!process.env.WATSONX_API_KEY,
    hasProjectId: !!process.env.WATSONX_PROJECT_ID,
  });
}
