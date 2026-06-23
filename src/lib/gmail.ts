import { google } from "googleapis";

import { loadServiceAccountCredentials } from "@/lib/google-service-account";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function encodeRawMessage(message: string): string {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getGmailClient() {
  const sendAs = process.env.GMAIL_SEND_AS?.trim();
  if (!sendAs) {
    throw new Error(
      "Email is not configured. Set GMAIL_SEND_AS to a Google Workspace user the service account can send as.",
    );
  }

  const credentials = loadServiceAccountCredentials();
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;

  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error("Service account credentials are missing client_email or private_key.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [GMAIL_SEND_SCOPE],
    subject: sendAs,
  });

  return google.gmail({ version: "v1", auth });
}

export async function sendEmail(options: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (options.to.length === 0) {
    throw new Error("No recipients configured.");
  }

  const gmail = getGmailClient();
  const message = [
    `To: ${options.to.join(", ")}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    options.html,
  ].join("\r\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeRawMessage(message),
    },
  });
}
