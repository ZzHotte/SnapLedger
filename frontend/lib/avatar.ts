// Deterministic avatar color per name, from the same hue family as Badge's
// tones, so an entity's accent color never changes across reloads.
const AVATAR_TONES = [
  "bg-blue-50 text-blue-700",
  "bg-indigo-50 text-indigo-700",
  "bg-amber-50 text-amber-700",
  "bg-green-50 text-green-700",
  "bg-purple-50 text-purple-700",
  "bg-rose-50 text-rose-700",
  "bg-teal-50 text-teal-700",
];

export function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
