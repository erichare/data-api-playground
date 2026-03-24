import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasToken: !!process.env.ASTRA_DB_APPLICATION_TOKEN,
    hasEndpoint: !!process.env.ASTRA_DB_API_ENDPOINT,
  });
}
