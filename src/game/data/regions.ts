export type ServerRegionId = "eu-frankfurt" | "eu-warsaw" | "eu-paris" | "kz-astana";

export type ServerRegion = {
  id: ServerRegionId;
  city: string;
  country: string;
  provider: string;
  probeUrl: string;
};

export const SERVER_REGIONS: ServerRegion[] = [
  { id: "eu-frankfurt", city: "Frankfurt", country: "Germany", provider: "OVHcloud", probeUrl: import.meta.env.VITE_PING_EU_FRANKFURT_URL || "https://www.ovhcloud.com/" },
  { id: "eu-warsaw", city: "Warsaw", country: "Poland", provider: "OVHcloud", probeUrl: import.meta.env.VITE_PING_EU_WARSAW_URL || "https://www.ovhcloud.com/pl/" },
  { id: "eu-paris", city: "Paris", country: "France", provider: "OVHcloud", probeUrl: import.meta.env.VITE_PING_EU_PARIS_URL || "https://www.ovhcloud.com/fr/" },
  { id: "kz-astana", city: "Астана", country: "Казахстан", provider: "PS Cloud Services", probeUrl: import.meta.env.VITE_PING_KZ_ASTANA_URL || "https://www.ps.kz/" },
];

export async function measureRegionPing(region: ServerRegion): Promise<number | null> {
  const samples: number[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = performance.now();
    try {
      await fetch(`${region.probeUrl}${region.probeUrl.includes("?") ? "&" : "?"}ping=${Date.now()}-${attempt}`, {
        mode: "no-cors",
        cache: "no-store",
      });
      samples.push(performance.now() - started);
    } catch {
      // A region may be temporarily unreachable; the UI reports that honestly.
    }
  }
  if (!samples.length) return null;
  return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
}
