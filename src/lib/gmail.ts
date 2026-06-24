import { google } from "googleapis";

import { loadServiceAccountCredentials } from "@/lib/google-service-account";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

type GmailSendConfig = {
  fromAddress: string;
  fromName: string;
  impersonateUser: string;
};

function encodeRawMessage(message: string): string {
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 2047 encoding for non-ASCII email headers (Subject, etc.). */
function encodeMimeHeader(value: string): string {
  if (/^[\t !-~]*$/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function getGmailSendConfig(): GmailSendConfig {
  const fromAddress = process.env.GMAIL_SEND_AS?.trim();
  if (!fromAddress) {
    throw new Error(
      "Email is not configured. Set GMAIL_SEND_AS to the From address for outbound mail.",
    );
  }

  const impersonateUser =
    process.env.GMAIL_IMPERSONATE_USER?.trim() || fromAddress;
  const fromName = process.env.GMAIL_FROM_NAME?.trim() || "MRP System";

  return { fromAddress, fromName, impersonateUser };
}

function formatFromHeader(fromName: string, fromAddress: string): string {
  const trimmedName = fromName.trim();
  if (!trimmedName) {
    return fromAddress;
  }

  if (/^[\t !-~]*$/.test(trimmedName)) {
    const safeName = trimmedName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${safeName}" <${fromAddress}>`;
  }

  return `${encodeMimeHeader(trimmedName)} <${fromAddress}>`;
}

async function getAuthorizedGmailClient() {
  const { impersonateUser } = getGmailSendConfig();
  const credentials = loadServiceAccountCredentials();
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;

  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error("Service account credentials are missing client_email or private_key.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: GMAIL_SCOPES,
    subject: impersonateUser,
  });

  await auth.authorize();

  return google.gmail({ version: "v1", auth });
}

async function resolveFromHeader(
  gmail: ReturnType<typeof google.gmail>,
  config: GmailSendConfig,
): Promise<string> {
  const { fromAddress, fromName, impersonateUser } = config;
  const sendingViaAlias =
    impersonateUser.toLowerCase() !== fromAddress.toLowerCase();

  let sendAsListError: unknown;

  try {
    const { data } = await gmail.users.settings.sendAs.list({ userId: "me" });
    const alias = data.sendAs?.find(
      (entry) =>
        entry.sendAsEmail?.trim().toLowerCase() === fromAddress.toLowerCase(),
    );

    if (alias) {
      return formatFromHeader(alias.displayName?.trim() || fromName, fromAddress);
    }

    if (sendingViaAlias) {
      throw new Error(
        `Send-as address ${fromAddress} was not found on ${impersonateUser}. Confirm the alias in Gmail settings.`,
      );
    }
  } catch (error) {
    sendAsListError = error;
    if (sendingViaAlias) {
      throw new Error(
        `Unable to read Gmail send-as settings for ${impersonateUser}. Add domain-wide delegation scope https://www.googleapis.com/auth/gmail.settings.basic and try again.`,
        { cause: error },
      );
    }
  }

  if (sendAsListError) {
    console.warn(
      "Could not load Gmail send-as settings; using GMAIL_FROM_NAME.",
      sendAsListError,
    );
  }

  return formatFromHeader(fromName, fromAddress);
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

  const config = getGmailSendConfig();
  const gmail = await getAuthorizedGmailClient();
  const fromHeader = await resolveFromHeader(gmail, config);
  const message = [
    `From: ${fromHeader}`,
    `To: ${options.to.join(", ")}`,
    `Subject: ${encodeMimeHeader(options.subject)}`,
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
