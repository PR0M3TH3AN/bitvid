function normalizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric));
}

export function formatZapAmount(amountSats, options = {}) {
  const normalized = normalizeAmount(amountSats);
  const { compact = false } = options || {};
  const formatter = new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 0,
  });
  return `${formatter.format(normalized)} sats`;
}

export function aggregateZapTotals(receipts = []) {
  const totalsByConversation = new Map();
  const totalsByProfile = new Map();
  let overallSats = 0;

  const list = Array.isArray(receipts) ? receipts : [];
  list.forEach((receipt) => {
    const amount = normalizeAmount(receipt?.amountSats ?? receipt?.amount ?? 0);
    if (!amount) {
      return;
    }

    overallSats += amount;

    const conversationId = typeof receipt?.conversationId === "string" ? receipt.conversationId : "";
    if (conversationId) {
      totalsByConversation.set(
        conversationId,
        (totalsByConversation.get(conversationId) || 0) + amount,
      );
    }

    const profileId = typeof receipt?.profileId === "string" ? receipt.profileId : "";
    if (profileId) {
      totalsByProfile.set(profileId, (totalsByProfile.get(profileId) || 0) + amount);
    }
  });

  return {
    overallSats,
    totalsByConversation,
    totalsByProfile,
  };
}

export function normalizeZapReceipt(receipt = {}) {
  const normalized = { ...receipt };
  normalized.amountSats = normalizeAmount(receipt?.amountSats ?? receipt?.amount ?? 0);
  return normalized;
}
