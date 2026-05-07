/**
 * KDF Rider App — Premium Logistics Design Tokens
 * Inspired by: DHL, Bykea, Careem Delivery apps
 */

const colors = {
  light: {
    /* Backgrounds */
    background: "#F2F5FB",
    surface: "#FFFFFF",
    card: "#FFFFFF",
    foreground: "#0A1929",
    cardForeground: "#0A1929",
    text: "#0A1929",

    /* Brand — KDF Green */
    primary: "#00B85A",
    primaryDark: "#007A3D",
    primaryLight: "#E6F9EE",
    tint: "#00B85A",

    /* Header — Dark Navy */
    headerBg: "#0D2137",
    headerBg2: "#162540",

    /* Secondary */
    secondary: "#E6F9EE",
    secondaryForeground: "#007A3D",
    accent: "#E6F9EE",
    accentForeground: "#007A3D",

    /* Muted */
    muted: "#F2F5FB",
    mutedForeground: "#6B7A99",

    /* Semantic */
    border: "#E4EAF4",
    input: "#F2F5FB",
    destructive: "#E53935",
    destructiveForeground: "#FFFFFF",

    /* Status — vivid */
    statusAssigned: "#1E88E5",
    statusAssignedBg: "#E3F2FD",
    statusPicked: "#FB8C00",
    statusPickedBg: "#FFF3E0",
    statusOnRoute: "#8E24AA",
    statusOnRouteBg: "#F3E5F5",
    statusDelivered: "#43A047",
    statusDeliveredBg: "#E8F5E9",
    statusFailed: "#E53935",
    statusFailedBg: "#FFEBEE",
    statusReturned: "#546E7A",
    statusReturnedBg: "#ECEFF1",

    /* Special */
    whatsapp: "#25D366",
    whatsappDark: "#075E54",
    cod: "#FF6F00",
    codBg: "#FFF8E1",
    kdfGreen: "#00B85A",
    primaryForeground: "#FFFFFF",
  },
  radius: 14,
};

export default colors;

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    assigned: colors.light.statusAssigned,
    picked: colors.light.statusPicked,
    out_for_delivery: colors.light.statusOnRoute,
    delivered: colors.light.statusDelivered,
    failed: colors.light.statusFailed,
    returned: colors.light.statusReturned,
  };
  return map[status] ?? colors.light.mutedForeground;
}

export function getStatusBg(status: string): string {
  const map: Record<string, string> = {
    assigned: colors.light.statusAssignedBg,
    picked: colors.light.statusPickedBg,
    out_for_delivery: colors.light.statusOnRouteBg,
    delivered: colors.light.statusDeliveredBg,
    failed: colors.light.statusFailedBg,
    returned: colors.light.statusReturnedBg,
  };
  return map[status] ?? "#F2F5FB";
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    assigned: "Assigned",
    picked: "Picked Up",
    out_for_delivery: "On Route",
    delivered: "Delivered",
    failed: "Failed",
    returned: "Returned",
  };
  return map[status] ?? status;
}
