// Calls the /api/check-email serverless function and returns results per Dutch site.

export async function checkEmailOnDutchSites(email) {
  const params = new URLSearchParams({ email });
  const res = await fetch(`/api/check-email?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Serverfout' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
