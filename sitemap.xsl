<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<title>MiFRM Sitemap</title>
<style>
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f6f7f7;color:#1d2327}
  header{background:#23282d;color:#fff;padding:24px 32px}
  header h1{margin:0;font-size:20px}
  header p{margin:6px 0 0;color:#c3c4c7;font-size:13px}
  main{max-width:1000px;margin:24px auto;padding:0 16px}
  table{width:100%;border-collapse:collapse;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
  th,td{padding:10px 14px;border-bottom:1px solid #e2e4e7;text-align:left;font-size:13px}
  th{background:#f0f0f1;text-transform:uppercase;letter-spacing:.03em;font-size:11px;color:#50575e}
  a{color:#2271b1;text-decoration:none}
  a:hover{text-decoration:underline}
  tr:hover{background:#f9f9fb}
  .count{color:#50575e;font-size:13px;margin:0 0 12px}
  footer{text-align:center;color:#8c8f94;font-size:12px;margin:24px 0}
</style>
</head>
<body>
<header>
  <h1>MiFRM &#8212; XML Sitemap</h1>
  <p>Mifrm Auto Sitemap &#8212; Actions ile otomatik olarak üretildi</p>
</header>
<main>
<p class="count"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> URL listeleniyor</p>
<table>
  <tr><th>URL</th><th>Son Güncelleme</th></tr>
  <xsl:for-each select="sitemap:urlset/sitemap:url">
  <tr>
    <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
    <td><xsl:value-of select="sitemap:lastmod"/></td>
  </tr>
  </xsl:for-each>
</table>
</main>
<footer>cdn.mifrm.eu.cc &#8226; otomatik üretildi</footer>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
