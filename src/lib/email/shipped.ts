import { Resend } from "resend";
import type { Order, Painting, Settings } from "../db/schema";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Emails the buyer that their order has shipped. Throws if it can't be sent. Never logs the address. */
export async function sendShippedEmail(order: Order, painting: Painting, settings: Settings): Promise<void> {
  const to = order.buyerEmail;
  const from = process.env.EMAIL_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !from || !apiKey) throw new Error("Shipped email is not configured or the order has no email");

  const item = order.item === "original" ? "original painting" : "print";
  const greeting = order.buyerName ? `Hello ${order.buyerName},` : "Hello,";
  const line = `Your ${item} of "${painting.title}" is on its way.`;
  const thanks = "Thank you so much for your support.";
  const text = `${greeting}\n\n${line}\n\n${thanks}\n\n${settings.artistName}\n`;
  const html =
    `<p>${esc(greeting)}</p><p>${esc(line)}</p><p>${thanks}</p><p>${esc(settings.artistName)}</p>`;

  const { error } = await new Resend(apiKey).emails.send({
    from, to, subject: "Your painting is on its way", text, html,
  });
  if (error) throw new Error(`Resend rejected the shipped email: ${error.name}`);
}
