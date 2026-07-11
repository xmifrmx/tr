#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MiFRM Blogger Forum - Otomatik Sitemap Üretici
================================================
Kaynak     : https://www.mifrm.eu.cc  (Blogger tabanli forum)
Hedef      : https://cdn.mifrm.eu.cc  (GitHub Pages / custom domain)
Cikti      : WordPress native "wp-sitemap" yapisiyla BIREBIR ayni sema:
             - sitemap.xml        (sitemap index)
             - post-sitemap1.xml  (tum konu/basliklar)
             - page-sitemap1.xml  (statik sayfalar, varsa)

Blogger'in kendi RSS/Atom feed'ini kaynak alir, sayfalama (pagination)
ile TUM icerigi ceker (150+ post limiti otomatik asilir), duplicate ve
hatali kayitlari filtreler, XML sitemap protokolune (sitemaps.org 0.9)
tam uyumlu, sifir hata toleransli bir cikti uretir.

Calistirma:
    python3 generate_sitemap.py
"""

import sys
import time
import html
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests

# --------------------------------------------------------------------------
# AYARLAR
# --------------------------------------------------------------------------
SOURCE_SITE = "https://www.mifrm.eu.cc"
TARGET_HOST = "https://cdn.mifrm.eu.cc"   # sitemap'in yayinlanacagi (GitHub Pages) domain
FEED_PATH = "/feeds/posts/default"
PAGE_SIZE = 150                            # Blogger tek istekte guvenli ust sinir
MAX_PAGES = 200                            # sonsuz donguye karsi guvenlik siniri (30.000 posta kadar)
REQUEST_TIMEOUT = 30
RETRY_COUNT = 3
RETRY_BACKOFF = 3  # saniye
OUTPUT_DIR = "."
USER_AGENT = "Mozilla/5.0 (compatible; MiFRM-SitemapBot/1.0; +https://cdn.mifrm.eu.cc)"

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "app": "http://purl.org/atom/app#",
}

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/atom+xml"})


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def fetch_with_retry(url: str) -> requests.Response:
    last_err = None
    for attempt in range(1, RETRY_COUNT + 1):
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_err = exc
            log(f"  UYARI: deneme {attempt}/{RETRY_COUNT} basarisiz ({exc}). Yeniden deneniyor...")
            time.sleep(RETRY_BACKOFF * attempt)
    raise RuntimeError(f"URL alinamadi: {url} -> {last_err}")


def normalize_url(raw_url: str) -> str:
    """Blogger link'lerini kaynak domain -> hedef (cdn) domain'e cevirir."""
    if not raw_url:
        return ""
    raw_url = raw_url.strip()
    # http -> https
    if raw_url.startswith("http://"):
        raw_url = "https://" + raw_url[len("http://"):]
    # kaynak domain varyasyonlarini hedef domain ile degistir
    for host in ("https://www.mifrm.eu.cc", "https://mifrm.eu.cc", "http://www.mifrm.eu.cc"):
        if raw_url.startswith(host):
            raw_url = TARGET_HOST + raw_url[len(host):]
            break
    return raw_url


def parse_entry(entry: ET.Element) -> dict | None:
    link_el = None
    for l in entry.findall("atom:link", NS):
        if l.get("rel") == "alternate":
            link_el = l
            break
    if link_el is None:
        return None

    loc = normalize_url(link_el.get("href", ""))
    if not loc:
        return None

    updated_el = entry.find("atom:updated", NS)
    published_el = entry.find("atom:published", NS)
    lastmod_raw = (updated_el.text if updated_el is not None else None) or \
                  (published_el.text if published_el is not None else None)

    lastmod = None
    if lastmod_raw:
        try:
            # Blogger formati: 2026-06-01T12:34:56.000+03:00
            dt = datetime.fromisoformat(lastmod_raw.replace("Z", "+00:00"))
            lastmod = dt.strftime("%Y-%m-%dT%H:%M:%S%z")
            lastmod = lastmod[:-2] + ":" + lastmod[-2:]  # +0300 -> +03:00
        except ValueError:
            lastmod = None

    is_page = "kind#page" in "".join(
        c.get("term", "") for c in entry.findall("atom:category", NS)
    ) or "/p/" in loc

    return {"loc": loc, "lastmod": lastmod, "is_page": is_page}


def fetch_all_entries() -> list[dict]:
    """Blogger Atom feed'ini sayfa sayfa cekip tum kayitlari dondurur."""
    all_entries: list[dict] = []
    seen_locs: set[str] = set()

    for page in range(MAX_PAGES):
        start_index = page * PAGE_SIZE + 1
        url = (
            f"{SOURCE_SITE}{FEED_PATH}"
            f"?start-index={start_index}&max-results={PAGE_SIZE}"
            f"&redirect=false"
        )
        log(f"Feed sayfasi cekiliyor: start-index={start_index}")
        resp = fetch_with_retry(url)

        try:
            root = ET.fromstring(resp.content)
        except ET.ParseError as exc:
            raise RuntimeError(f"XML parse hatasi ({url}): {exc}")

        entries = root.findall("atom:entry", NS)
        if not entries:
            log("  Daha fazla kayit yok, feed sonuna ulasildi.")
            break

        added = 0
        for entry in entries:
            parsed = parse_entry(entry)
            if parsed and parsed["loc"] not in seen_locs:
                seen_locs.add(parsed["loc"])
                all_entries.append(parsed)
                added += 1

        log(f"  {len(entries)} kayit alindi, {added} yeni eklendi (toplam: {len(all_entries)})")

        if len(entries) < PAGE_SIZE:
            break

    return all_entries


# --------------------------------------------------------------------------
# XML URETIM (WordPress core sitemap semasi ile birebir uyumlu)
# --------------------------------------------------------------------------
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
XHTML_NS = "http://www.w3.org/1999/xhtml"


def write_urlset(filepath: str, urls: list[dict], stylesheet: str) -> None:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append(f'<?xml-stylesheet type="text/xsl" href="{TARGET_HOST}/{stylesheet}"?>')
    lines.append(f'<urlset xmlns="{SITEMAP_NS}">')
    for u in urls:
        lines.append("\t<url>")
        lines.append(f"\t\t<loc>{html.escape(u['loc'])}</loc>")
        if u.get("lastmod"):
            lines.append(f"\t\t<lastmod>{u['lastmod']}</lastmod>")
        lines.append("\t</url>")
    lines.append("</urlset>")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def write_sitemap_index(filepath: str, sitemaps: list[dict], stylesheet: str) -> None:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append(f'<?xml-stylesheet type="text/xsl" href="{TARGET_HOST}/{stylesheet}"?>')
    lines.append(f'<sitemapindex xmlns="{SITEMAP_NS}">')
    for sm in sitemaps:
        lines.append("\t<sitemap>")
        lines.append(f"\t\t<loc>{TARGET_HOST}/{sm['file']}</loc>")
        if sm.get("lastmod"):
            lines.append(f"\t\t<lastmod>{sm['lastmod']}</lastmod>")
        lines.append("\t</sitemap>")
    lines.append("</sitemapindex>")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def chunk(items: list, size: int) -> list[list]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def main() -> int:
    log("=== MiFRM Sitemap Uretimi Basladi ===")
    log(f"Kaynak: {SOURCE_SITE}  ->  Hedef: {TARGET_HOST}")

    try:
        entries = fetch_all_entries()
    except Exception as exc:
        log(f"KRITIK HATA: {exc}")
        return 1

    if not entries:
        log("KRITIK HATA: hic kayit alinamadi, feed bos ya da erisilemez durumda. Islem durduruldu.")
        return 1

    posts = [e for e in entries if not e["is_page"]]
    pages = [e for e in entries if e["is_page"]]

    log(f"Toplam URL: {len(entries)}  (post: {len(posts)}, sayfa: {len(pages)})")

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    sitemap_entries = []

    # WordPress ile ayni mantik: 2000 URL'yi asan gruplar ayri dosyalara bolunur
    post_chunks = chunk(posts, 2000) or [[]]
    for i, group in enumerate(post_chunks, start=1):
        fname = f"post-sitemap{i}.xml"
        write_urlset(f"{OUTPUT_DIR}/{fname}", group, "sitemap.xsl")
        last = max((u["lastmod"] for u in group if u.get("lastmod")), default=now_iso)
        sitemap_entries.append({"file": fname, "lastmod": last})
        log(f"Yazildi: {fname} ({len(group)} URL)")

    if pages:
        page_chunks = chunk(pages, 2000)
        for i, group in enumerate(page_chunks, start=1):
            fname = f"page-sitemap{i}.xml"
            write_urlset(f"{OUTPUT_DIR}/{fname}", group, "sitemap.xsl")
            last = max((u["lastmod"] for u in group if u.get("lastmod")), default=now_iso)
            sitemap_entries.append({"file": fname, "lastmod": last})
            log(f"Yazildi: {fname} ({len(group)} URL)")

    write_sitemap_index(f"{OUTPUT_DIR}/sitemap.xml", sitemap_entries, "sitemap-index.xsl")
    log(f"Yazildi: sitemap.xml (index, {len(sitemap_entries)} alt-sitemap)")

    log("=== Islem basariyla tamamlandi, sifir hata ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
