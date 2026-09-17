import type { ZodType } from "zod";
import { ZodError } from "zod";
import { StorageBindingError } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  return schema.parse(value);
}

export async function apiRoute(
  handler: (userId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new ApiError(401, "Sign in with ChatGPT to use the workstation.");
    return await handler(user.userId);
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Request validation failed.", details: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof StorageBindingError) {
      return Response.json(
        {
          error: `${error.binding} storage is not connected. No data was written.`,
          connector: error.binding,
          status: "not_connected",
        },
        { status: 503 },
      );
    }
    console.error("workstation API error", error);
    return Response.json({ error: "The workstation request failed." }, { status: 500 });
  }
}
