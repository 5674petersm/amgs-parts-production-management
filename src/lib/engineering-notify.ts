import { partEditUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/gmail";
import { getEngineeringNotifyEmails } from "@/lib/permissions";
import type { StockItem } from "@/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyEngineeringMissingFinalStation(options: {
  item: StockItem;
  reportedBy: string;
}): Promise<void> {
  const recipients = getEngineeringNotifyEmails();
  if (recipients.length === 0) {
    throw new Error(
      "No notification recipients configured. Set ENGINEERING_NOTIFY_EMAILS in the environment.",
    );
  }

  const { item, reportedBy } = options;
  const editLink = partEditUrl(item.itemId);
  const subject = `Action Required: Final station needed – ${item.masterPNo} (Item ${item.itemId})`;
  const text = [
    "A part was scanned in production without a final station assigned.",
    "",
    `Part number: ${item.masterPNo}`,
    `Description: ${item.itemDescription || "-"}`,
    `Item ID: ${item.itemId}`,
    `Qty on hand: ${item.totalQty}`,
    `Reported by: ${reportedBy}`,
    "",
    "Please set the final station and adjust inventory if needed:",
    editLink,
  ].join("\n");

  const html = `
    <p>A part was scanned in production without a final station assigned.</p>
    <table cellpadding="4" cellspacing="0" style="border-collapse:collapse">
      <tr><td><strong>Part number</strong></td><td>${escapeHtml(item.masterPNo)}</td></tr>
      <tr><td><strong>Description</strong></td><td>${escapeHtml(item.itemDescription || "-")}</td></tr>
      <tr><td><strong>Item ID</strong></td><td>${item.itemId}</td></tr>
      <tr><td><strong>Qty on hand</strong></td><td>${item.totalQty}</td></tr>
      <tr><td><strong>Reported by</strong></td><td>${escapeHtml(reportedBy)}</td></tr>
    </table>
    <p>Please set the final station and adjust inventory if needed.</p>
    <p><a href="${escapeHtml(editLink)}">Open part in Production Management</a></p>
  `.trim();

  await sendEmail({
    to: recipients,
    subject,
    text,
    html,
  });
}
