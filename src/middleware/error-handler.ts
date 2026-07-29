import { Context } from "hono";
import { ZodError } from "zod";

export function errorHandler(err: Error, c: Context) {
  console.error(`❌ Error: ${err.message}`);
  console.error(err.stack);

  // Zod validation error
  if (err instanceof ZodError) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid request data",
        details: err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
      400
    );
  }

  // Database errors
  if (err.message.includes("unique_violation")) {
    return c.json(
      {
        error: "Duplicate Entry",
        message: "A record with this information already exists",
      },
      409
    );
  }

  if (err.message.includes("foreign_key_violation")) {
    return c.json(
      {
        error: "Reference Error",
        message: "Referenced record does not exist",
      },
      400
    );
  }

  if (err.message.includes("not_null_violation")) {
    return c.json(
      {
        error: "Missing Required Field",
        message: "A required field is missing",
      },
      400
    );
  }

  // JWT errors
  if (err.message.includes("JWT") || err.message.includes("jwt")) {
    return c.json(
      {
        error: "Authentication Error",
        message: "Invalid or expired token",
      },
      401
    );
  }

  // File upload errors
  if (err.message.includes("File too large") || err.message.includes("LIMIT_FILE_SIZE")) {
    return c.json(
      {
        error: "File Too Large",
        message: "The uploaded file exceeds the size limit",
      },
      413
    );
  }

  // Default error
  return c.json(
    {
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "An unexpected error occurred",
    },
    500
  );
}
