export class ApiError extends Error {
  constructor(message, status, fieldErrors = {}, code = "") {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

const NOT_CONNECTED =
  "The customer platform is not connected on this host yet. Message us on WhatsApp (+234 906 392 4288) and we will enable your account.";

export async function api(path, { method = "GET", body, formData } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new ApiError(NOT_CONNECTED, response.status, {}, "PLATFORM_UNAVAILABLE");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.error || "Something went wrong. Please try again.",
      response.status,
      data.fieldErrors || {},
      data.code || ""
    );
  }

  return data;
}
