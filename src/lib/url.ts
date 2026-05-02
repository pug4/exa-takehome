export function normalizeUrl(input: string): string {
  let value = input.trim();
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

export function getDomain(input: string): string {
  try {
    const url = new URL(normalizeUrl(input));
    return url.hostname.replace(/^www\./, "");
  } catch {
    return input;
  }
}

export function inferCompanyNameFromUrl(input: string): string {
  const domain = getDomain(input);
  const root = domain.split(".")[0] ?? domain;
  return root
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
