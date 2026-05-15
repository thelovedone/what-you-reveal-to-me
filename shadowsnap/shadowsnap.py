#!/usr/bin/env python3
"""
ShadowSnap - Snapchat public profile OSINT tool
Collects only publicly visible information from Snapchat profile pages.
"""

import argparse
import json
import sys
import re
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

console = Console()

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SNAPCHAT_ADD_URL = "https://www.snapchat.com/add/{username}"
SNAPCHAT_PROFILE_URL = "https://www.snapchat.com/p/{username}"
SNAPCODE_URL = "https://app.snapchat.com/web/deeplink/snapcode?username={username}&type=SVG"


_SESSION: requests.Session | None = None


def get_session(proxy: str | None = None) -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = requests.Session()
        _SESSION.headers.update(HEADERS)
        if proxy:
            _SESSION.proxies.update({"http": proxy, "https": proxy})
    return _SESSION


def fetch_page(url: str, timeout: int = 15, proxy: str | None = None) -> requests.Response | None:
    try:
        session = get_session(proxy)
        resp = session.get(url, timeout=timeout, allow_redirects=True)
        if resp.status_code == 403:
            reason = resp.headers.get("x-deny-reason", "")
            if "host_not_allowed" in reason or "host_not_allowed" in resp.text:
                console.print(
                    "[yellow]Warning: Snapchat blocked this request by IP "
                    "(host_not_allowed). Use --proxy to route through a different IP.[/yellow]"
                )
        return resp
    except requests.RequestException as e:
        console.print(f"[red]Request failed for {url}: {e}[/red]")
        return None


def extract_meta(soup: BeautifulSoup, prop: str = None, name: str = None) -> str | None:
    if prop:
        tag = soup.find("meta", attrs={"property": prop})
    elif name:
        tag = soup.find("meta", attrs={"name": name})
    else:
        return None
    return tag.get("content") if tag else None


def parse_subscriber_count(description: str) -> str | None:
    """Extract subscriber count from OG description text."""
    if not description:
        return None
    match = re.search(r"([\d,\.]+[KkMmBb]?)\s+(?:subscriber|follower)", description, re.IGNORECASE)
    return match.group(1) if match else None


def check_snapcode(username: str, proxy: str | None = None) -> bool:
    """Returns True if the snapcode endpoint responds (account exists indicator)."""
    url = SNAPCODE_URL.format(username=username)
    resp = fetch_page(url, proxy=proxy)
    return resp is not None and resp.status_code == 200 and len(resp.content) > 100


def lookup_username(username: str, proxy: str | None = None) -> dict:
    result = {
        "username": username,
        "queried_at": datetime.utcnow().isoformat() + "Z",
        "exists": False,
        "display_name": None,
        "bio": None,
        "profile_picture_url": None,
        "snapcode_url": None,
        "subscriber_count": None,
        "is_creator_account": False,
        "public_story": False,
        "profile_url": SNAPCHAT_ADD_URL.format(username=username),
        "raw_og": {},
    }

    # Try /add/<username> first (works for all accounts)
    add_url = SNAPCHAT_ADD_URL.format(username=username)
    resp = fetch_page(add_url, proxy=proxy)

    if resp is None:
        return result

    # A 404 or redirect away from /add means account likely doesn't exist
    if resp.status_code == 404:
        return result

    if resp.status_code not in (200, 301, 302):
        console.print(f"[yellow]Unexpected status {resp.status_code} for @{username}[/yellow]")
        return result

    soup = BeautifulSoup(resp.text, "html.parser")

    # Collect all Open Graph and Twitter card meta tags
    og_data = {}
    for tag in soup.find_all("meta"):
        prop = tag.get("property") or tag.get("name")
        content = tag.get("content")
        if prop and content:
            og_data[prop] = content

    result["raw_og"] = og_data

    og_title = extract_meta(soup, prop="og:title")
    og_image = extract_meta(soup, prop="og:image")
    og_desc = extract_meta(soup, prop="og:description")
    og_url = extract_meta(soup, prop="og:url")

    # Account doesn't exist if no OG title or title is generic
    if not og_title or og_title.strip().lower() in ("snapchat", ""):
        # Double-check via snapcode endpoint
        result["exists"] = check_snapcode(username, proxy=proxy)
        return result

    result["exists"] = True
    result["display_name"] = og_title.strip()
    result["profile_picture_url"] = og_image
    result["snapcode_url"] = SNAPCODE_URL.format(username=username)

    if og_desc:
        result["bio"] = og_desc.strip()
        result["subscriber_count"] = parse_subscriber_count(og_desc)

    # Check for creator / public profile indicators
    creator_indicators = [
        soup.find("span", string=re.compile(r"subscriber", re.I)),
        soup.find(attrs={"data-testid": re.compile(r"creator|subscribe", re.I)}),
        "subscriber" in (og_desc or "").lower(),
    ]
    result["is_creator_account"] = any(creator_indicators)

    # Check for public story link
    story_link = soup.find("a", href=re.compile(r"/stories/", re.I))
    result["public_story"] = story_link is not None

    # Try /p/<username> for additional public profile data
    p_resp = fetch_page(SNAPCHAT_PROFILE_URL.format(username=username), proxy=proxy)
    if p_resp and p_resp.status_code == 200:
        p_soup = BeautifulSoup(p_resp.text, "html.parser")
        p_desc = extract_meta(p_soup, prop="og:description")
        if p_desc and not result["subscriber_count"]:
            result["subscriber_count"] = parse_subscriber_count(p_desc)
        if not result["bio"] and p_desc:
            result["bio"] = p_desc.strip()

    return result


def print_result(data: dict, verbose: bool = False):
    status = "[green]EXISTS[/green]" if data["exists"] else "[red]NOT FOUND[/red]"
    title = f"ShadowSnap  @{data['username']}  {status}"

    table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
    table.add_column("Field", style="bold cyan", min_width=22)
    table.add_column("Value", style="white")

    rows = [
        ("Username", data["username"]),
        ("Exists", "Yes" if data["exists"] else "No"),
    ]

    if data["exists"]:
        rows += [
            ("Display Name", data["display_name"] or "—"),
            ("Bio / Description", data["bio"] or "—"),
            ("Creator Account", "Yes" if data["is_creator_account"] else "No"),
            ("Subscriber Count", data["subscriber_count"] or "—"),
            ("Public Story", "Yes" if data["public_story"] else "No"),
            ("Profile URL", data["profile_url"]),
            ("Profile Picture URL", data["profile_picture_url"] or "—"),
            ("Snapcode URL", data["snapcode_url"] or "—"),
        ]

    rows.append(("Queried At (UTC)", data["queried_at"]))

    for field, value in rows:
        table.add_row(field, value if value else "—")

    console.print(Panel(table, title=title, border_style="blue"))

    if verbose and data.get("raw_og"):
        console.print("\n[bold]Raw Open Graph / Meta Tags:[/bold]")
        for k, v in data["raw_og"].items():
            console.print(f"  [dim]{k}[/dim] = {v}")


def main():
    parser = argparse.ArgumentParser(
        prog="shadowsnap",
        description="Collect publicly available information from Snapchat profiles.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python shadowsnap.py kyle\n"
            "  python shadowsnap.py kyle evan djkhaled --json\n"
            "  python shadowsnap.py kyle --output results.json --verbose\n"
        ),
    )
    parser.add_argument(
        "usernames",
        nargs="+",
        metavar="USERNAME",
        help="One or more Snapchat usernames to look up",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON",
    )
    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        help="Write JSON output to a file",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show raw meta tag data",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=15,
        metavar="SECONDS",
        help="Request timeout in seconds (default: 15)",
    )
    parser.add_argument(
        "--proxy",
        metavar="URL",
        help="HTTP/HTTPS proxy URL (e.g. http://user:pass@host:port)",
    )

    args = parser.parse_args()

    results = []
    for username in args.usernames:
        username = username.strip().lstrip("@")
        if not username:
            continue
        console.print(f"[dim]Querying @{username}...[/dim]")
        data = lookup_username(username, proxy=args.proxy)
        results.append(data)
        if not args.json:
            print_result(data, verbose=args.verbose)

    if args.json or args.output:
        json_out = json.dumps(results if len(results) > 1 else results[0], indent=2)
        if args.output:
            with open(args.output, "w") as f:
                f.write(json_out)
            console.print(f"[green]Results written to {args.output}[/green]")
        if args.json:
            print(json_out)


if __name__ == "__main__":
    main()
