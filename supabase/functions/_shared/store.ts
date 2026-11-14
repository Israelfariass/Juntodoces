// Loja aberta ou fechada, no horário de Brasília. Mesma regra do site (web/js/api.js).
// horarios: { "0": ["14:00","23:00"], ... "6": null }  (0 = domingo). Não cobre horário que vira a madrugada.

export type Hours = Record<string, [string, string] | null> | null;

function parseHM(s: string): number {
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m || 0);
}

export function nowInBrasilia(now = new Date()): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isStoreOpen(mode: string, hours: Hours, now = new Date()): boolean {
  if (mode === "aberta") return true;
  if (mode === "fechada") return false;
  const { day, minutes } = nowInBrasilia(now);
  const h = hours?.[String(day)];
  return !!h && minutes >= parseHM(h[0]) && minutes < parseHM(h[1]);
}
