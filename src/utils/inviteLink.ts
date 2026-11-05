/**
 * Generates a public, cross-device accessible invitation link for Avor Invest (avorinvest.com).
 * Automatically converts private `ais-dev-*` preview URLs to public `ais-pre-*` URLs
 * so that anyone receiving the link on WhatsApp, SMS, or another browser can open it directly.
 */
export function getShareableInviteLink(referralCode?: string): string {
  const cleanCode = (referralCode || 'AVOR-7789').trim();
  if (typeof window === 'undefined') {
    return `https://avorinvest.com/?AvorInvest=${encodeURIComponent(cleanCode)}`;
  }

  let origin = window.location.origin;
  // Convert private AI Studio dev origin (ais-dev-*) to the public shared origin (ais-pre-*)
  if (origin.includes('//ais-dev-')) {
    origin = origin.replace('//ais-dev-', '//ais-pre-');
  }

  return `${origin}/?AvorInvest=${encodeURIComponent(cleanCode)}&platform=avorinvest.com`;
}

/**
 * Generates the official Avor Invest (avorinvest.com) invitation message with platform details,
 * invitation code, and clickable registration gateway link.
 */
export function getShareableInviteMessage(referralCode?: string): string {
  const cleanCode = (referralCode || 'AVOR-7789').trim();
  const link = getShareableInviteLink(cleanCode);
  return (
    `🌐 *AVOR INVEST (avorinvest.com) — Official Invitation*\n\n` +
    `Join me on *Avor Invest (avorinvest.com)*, the AI & Compute Machine Investment Platform:\n` +
    `✅ *UGX 3,000* Automatic Welcome Bonus on Registration\n` +
    `✅ Daily Automated Compute Machine Yields (UGX 17,500 – UGX 3,500,000)\n` +
    `✅ *8% Team Commission* + *5% Monthly Class Reward*\n` +
    `✅ Instant MTN & Airtel Mobile Money Deposits & Withdrawals\n\n` +
    `🔑 *Official Invite Code:* ${cleanCode}\n` +
    `👉 *Click to Register & Access Avor Invest:* ${link}`
  );
}
