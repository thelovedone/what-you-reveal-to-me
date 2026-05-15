// Vercel serverless function: checks Dutch websites for email registration
// Uses the "wachtwoord vergeten" (forgot password) flow — public endpoints only.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
  Accept: 'application/json, text/html, */*',
};

const TIMEOUT_MS = 9000;

function timedFetch(url, opts) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  return fetch(url, { ...opts, signal: abort.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// Returns: { found: true | false | null }
// true  = email is geregistreerd
// false = email is NIET geregistreerd
// null  = kon niet bepalen (site beschermd, onverwacht antwoord)

async function checkBol(email) {
  // bol.com forgot-password API (JSON)
  try {
    const res = await timedFetch(
      'https://www.bol.com/nl/rnwy/account/password/forgot',
      {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailAddress: email }),
        redirect: 'manual',
      }
    );
    if (res.status === 200) return { found: true };
    if (res.status === 404 || res.status === 422 || res.status === 400) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkMarktplaats(email) {
  // marktplaats.nl — Adevinta/eBay classifieds identity service
  try {
    const res = await timedFetch(
      'https://www.marktplaats.nl/a/auth/password-forgotten',
      {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ email }).toString(),
        redirect: 'manual',
      }
    );
    if (res.status === 200 || res.status === 302) return { found: true };
    if (res.status === 400 || res.status === 404 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkCoolblue(email) {
  // coolblue.nl forgot password form
  try {
    const res = await timedFetch(
      'https://www.coolblue.nl/nl/account/wachtwoord-vergeten',
      {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ email }).toString(),
        redirect: 'manual',
      }
    );
    if (res.status === 200 || res.status === 302) return { found: true };
    if (res.status === 400 || res.status === 404 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkAlbertHeijn(email) {
  // ah.nl — Member account API (Bonuskaart/Mijn AH)
  try {
    const res = await timedFetch(
      'https://api.ah.nl/mobile-auth/v1/auth/token/anonymous',
      { method: 'POST', headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' }, body: '{}' }
    );
    // We only use this to verify the API is reachable; actual email check below
    if (!res.ok) return { found: null };

    const token = await res.json().catch(() => null);
    if (!token?.access_token) return { found: null };

    const check = await timedFetch(
      'https://api.ah.nl/mobile-auth/v1/auth/password',
      {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify({ email }),
      }
    );
    if (check.status === 200) return { found: true };
    if (check.status === 404 || check.status === 400 || check.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkZalando(email) {
  // zalando.nl — global account, forgot-password endpoint
  try {
    const res = await timedFetch(
      'https://www.zalando.nl/api/login/passwordRequest',
      {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, platform: 'desktop' }),
        redirect: 'manual',
      }
    );
    if (res.status === 200) return { found: true };
    if (res.status === 404 || res.status === 400 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkMediaMarkt(email) {
  // mediamarkt.nl — MediaSaturn account system
  try {
    const res = await timedFetch(
      'https://www.mediamarkt.nl/api/account/password-forgotten',
      {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        redirect: 'manual',
      }
    );
    if (res.status === 200) return { found: true };
    if (res.status === 404 || res.status === 400 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkHema(email) {
  // hema.nl — e-commerce account
  try {
    const res = await timedFetch(
      'https://www.hema.nl/shop/nl/nl/login/password/request-reset',
      {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ email }).toString(),
        redirect: 'manual',
      }
    );
    if (res.status === 200) {
      const body = await res.text().catch(() => '');
      if (body.includes('verstuurd') || body.includes('sent') || body.includes('success')) return { found: true };
      if (body.includes('niet gevonden') || body.includes('not found') || body.includes('onbekend')) return { found: false };
      return { found: null };
    }
    if (res.status === 404 || res.status === 400 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkVinted(email) {
  // vinted.nl — popular second-hand fashion platform
  try {
    const res = await timedFetch(
      'https://www.vinted.nl/api/v2/users/password_resets',
      {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        redirect: 'manual',
      }
    );
    if (res.status === 200 || res.status === 201) return { found: true };
    if (res.status === 404 || res.status === 400 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkWehkamp(email) {
  // wehkamp.nl — Dutch online department store
  try {
    const res = await timedFetch(
      'https://www.wehkamp.nl/api/account/password/reset',
      {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        redirect: 'manual',
      }
    );
    if (res.status === 200 || res.status === 204) return { found: true };
    if (res.status === 404 || res.status === 400 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkTweakers(email) {
  // tweakers.net — Dutch tech review community
  try {
    const res = await timedFetch(
      'https://tweakers.net/ajax/user/requestPasswordReset/',
      {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ email }).toString(),
        redirect: 'manual',
      }
    );
    if (res.status === 200) {
      const body = await res.text().catch(() => '');
      if (body.includes('"success":true') || body.includes('"status":"ok"')) return { found: true };
      if (body.includes('"success":false') || body.includes('niet gevonden')) return { found: false };
      return { found: null };
    }
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkNS(email) {
  // ns.nl — Nederlandse Spoorwegen Mijn NS account
  // NS is privacy-conscious and may always respond with 200
  try {
    const res = await timedFetch(
      'https://api.ns.nl/mijnns/api/v2/account/password/reset',
      {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        redirect: 'manual',
      }
    );
    if (res.status === 200 || res.status === 204) return { found: true };
    if (res.status === 404 || res.status === 400) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

async function checkThuisbezorgd(email) {
  // thuisbezorgd.nl — Just Eat Takeaway food delivery
  try {
    const res = await timedFetch(
      'https://cw-api.takeaway.com/api/v33/user/password/reset',
      {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/json',
          'X-Country-Code': 'NL',
          'X-Language-Code': 'nl',
        },
        body: JSON.stringify({ email }),
        redirect: 'manual',
      }
    );
    if (res.status === 200 || res.status === 201 || res.status === 204) return { found: true };
    if (res.status === 404 || res.status === 400 || res.status === 422) return { found: false };
    return { found: null };
  } catch {
    return { found: null };
  }
}

// --- Main handler ---

const SITES = [
  { site: 'bol.com', label: 'Bol.com', fn: checkBol },
  { site: 'marktplaats.nl', label: 'Marktplaats.nl', fn: checkMarktplaats },
  { site: 'coolblue.nl', label: 'Coolblue.nl', fn: checkCoolblue },
  { site: 'ah.nl', label: 'Albert Heijn (ah.nl)', fn: checkAlbertHeijn },
  { site: 'zalando.nl', label: 'Zalando.nl', fn: checkZalando },
  { site: 'mediamarkt.nl', label: 'MediaMarkt.nl', fn: checkMediaMarkt },
  { site: 'hema.nl', label: 'HEMA.nl', fn: checkHema },
  { site: 'vinted.nl', label: 'Vinted.nl', fn: checkVinted },
  { site: 'wehkamp.nl', label: 'Wehkamp.nl', fn: checkWehkamp },
  { site: 'tweakers.net', label: 'Tweakers.net', fn: checkTweakers },
  { site: 'ns.nl', label: 'NS (ns.nl)', fn: checkNS },
  { site: 'thuisbezorgd.nl', label: 'Thuisbezorgd.nl', fn: checkThuisbezorgd },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const email =
    req.method === 'GET'
      ? req.query?.email
      : ((() => { try { return JSON.parse(req.body || '{}').email; } catch { return null; } })());

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ongeldig e-mailadres' });
  }

  const settled = await Promise.allSettled(SITES.map((s) => s.fn(email)));

  const results = SITES.map((s, i) => ({
    site: s.site,
    label: s.label,
    ...(settled[i].status === 'fulfilled'
      ? settled[i].value
      : { found: null }),
  }));

  return res.status(200).json({ email, results });
}
