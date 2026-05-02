function randomSegment(length = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function newEngagementId(): string {
  return `eng_${Date.now().toString(36)}_${randomSegment(6)}`;
}

export function newResultId(): string {
  return `res_${Date.now().toString(36)}_${randomSegment(6)}`;
}

export function newEventId(): string {
  return `evt_${Date.now().toString(36)}_${randomSegment(4)}`;
}

export function newCustomTabId(): string {
  return `ctab_${Date.now().toString(36)}_${randomSegment(6)}`;
}
