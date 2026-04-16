const ASTRA_MISSING_CREDENTIALS = "Missing Astra DB token or endpoint";
const HCD_MISSING_CREDENTIALS = "Missing HCD endpoint, username, or password";

export function isDataApiBadRequestMessage(message: string) {
  return (
    message === ASTRA_MISSING_CREDENTIALS ||
    message === HCD_MISSING_CREDENTIALS ||
    message === "Endpoint must be a valid Astra DB API endpoint" ||
    message === "Request body must contain an operation" ||
    message.startsWith("Unsupported operation:")
  );
}

export function toLegacyAstraCredentialMessage(message: string) {
  return message === ASTRA_MISSING_CREDENTIALS
    ? "token and endpoint are required"
    : message;
}

export function getDataApiErrorStatus(message: string, defaultStatus = 500) {
  return isDataApiBadRequestMessage(message) ? 400 : defaultStatus;
}
