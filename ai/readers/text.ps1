# Текстовые форматы: кодировку (UTF-8, UTF-16, Windows-1251) ядро определяет само.

Register-AiFileReader -Id "text" -Label "текстовый файл" -Extensions @(
  ".txt", ".md", ".json", ".xml", ".log", ".ini", ".yaml", ".yml"
) -Read {
  param($bytes)
  ConvertFrom-AiTextBytes $bytes
}

Register-AiFileReader -Id "csv" -Label "таблицу CSV" -Extensions @(".csv", ".tsv") -Read {
  param($bytes)
  ConvertFrom-AiTextBytes $bytes
}

Register-AiFileReader -Id "html" -Label "веб-страницу" -Extensions @(".html", ".htm") -Read {
  param($bytes)
  ConvertFrom-AiHtml (ConvertFrom-AiTextBytes $bytes)
}

Register-AiFileReader -Id "rtf" -Label "документ RTF" -Extensions @(".rtf") -Detect {
  param($bytes)
  $bytes.Length -ge 5 -and [Text.Encoding]::ASCII.GetString($bytes, 0, 5) -eq "{\rtf"
} -Read {
  param($bytes)
  ConvertFrom-AiRtf $bytes
}

function ConvertFrom-AiHtml([string]$html) {
  $t = [regex]::Replace($html, '(?is)<(script|style|head|noscript)\b.*?</\1\s*>', ' ')
  $t = [regex]::Replace($t, '(?is)<!--.*?-->', ' ')
  $t = [regex]::Replace($t, '(?i)</t[dh]\s*>', ' | ')
  $t = [regex]::Replace($t, '(?i)<br\s*/?>|</(p|div|tr|li|h[1-6]|table|section|article)\s*>', "`n")
  $t = [regex]::Replace($t, '(?s)<[^>]+>', ' ')
  return [Net.WebUtility]::HtmlDecode($t)
}

function ConvertFrom-AiRtf([byte[]]$bytes) {
  $latin = [Text.Encoding]::GetEncoding(28591)
  $raw = $latin.GetString($bytes)
  $codePage = 1252
  $cp = [regex]::Match($raw, '\\ansicpg(\d+)')
  if ($cp.Success) { $codePage = [int]$cp.Groups[1].Value }
  try { $enc = [Text.Encoding]::GetEncoding($codePage) } catch { $enc = [Text.Encoding]::GetEncoding(1252) }

  $skipWords = @("fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer",
    "headerl", "headerr", "footerl", "footerr", "listtable", "listoverridetable", "rsidtbl", "themedata",
    "colorschememapping", "datastore", "latentstyles", "xmlnstbl", "generator", "filetbl", "revtbl")
  $sb = New-Object Text.StringBuilder
  $stack = New-Object System.Collections.Generic.Stack[bool]
  $skip = $false
  $dropNext = 0
  $token = [regex]'\\''([0-9a-fA-F]{2})|\\u(-?\d+) ?|\\([a-zA-Z]+)(-?\d+)? ?|\\([^a-zA-Z])|([{}])|([^\\{}\r\n]+)'
  foreach ($m in $token.Matches($raw)) {
    if ($m.Groups[6].Success) {
      $dropNext = 0
      if ($m.Groups[6].Value -eq "{") {
        $stack.Push($skip)
      } elseif ($stack.Count -gt 0) {
        $skip = $stack.Pop()
      }
      continue
    }
    if ($m.Groups[5].Success) {
      $sym = $m.Groups[5].Value
      if ($sym -eq "*") { $skip = $true; continue }
      if ($skip) { continue }
      if ($sym -eq "~") { [void]$sb.Append(" ") }
      elseif ($sym -eq "-" -or $sym -eq "_") { [void]$sb.Append("-") }
      elseif ($sym -eq "`n" -or $sym -eq "`r") { [void]$sb.Append("`n") }
      elseif ($sym -in @("\", "{", "}")) { [void]$sb.Append($sym) }
      continue
    }
    if ($m.Groups[3].Success) {
      $word = $m.Groups[3].Value
      $dropNext = 0
      if ($skipWords -contains $word) { $skip = $true; continue }
      if ($skip) { continue }
      switch -CaseSensitive ($word) {
        "par" { [void]$sb.Append("`n") }
        "line" { [void]$sb.Append("`n") }
        "row" { [void]$sb.Append("`n") }
        "page" { [void]$sb.Append("`n") }
        "sect" { [void]$sb.Append("`n") }
        "cell" { [void]$sb.Append(" | ") }
        "tab" { [void]$sb.Append("`t") }
        "emdash" { [void]$sb.Append([char]0x2014) }
        "endash" { [void]$sb.Append([char]0x2013) }
        "bullet" { [void]$sb.Append([char]0x2022) }
        "lquote" { [void]$sb.Append([char]0x2018) }
        "rquote" { [void]$sb.Append([char]0x2019) }
        "ldblquote" { [void]$sb.Append([char]0x201C) }
        "rdblquote" { [void]$sb.Append([char]0x201D) }
      }
      continue
    }
    if ($skip) { continue }
    if ($m.Groups[2].Success) {
      $code = [int]$m.Groups[2].Value
      if ($code -lt 0) { $code += 65536 }
      [void]$sb.Append([char]$code)
      $dropNext = 1
      continue
    }
    if ($m.Groups[1].Success) {
      if ($dropNext -gt 0) { $dropNext--; continue }
      [void]$sb.Append($enc.GetString([byte[]]@([Convert]::ToByte($m.Groups[1].Value, 16))))
      continue
    }
    $chunk = $m.Groups[7].Value
    if ($dropNext -gt 0) {
      $chunk = $chunk.Substring(1)
      $dropNext = 0
    }
    [void]$sb.Append($enc.GetString($latin.GetBytes($chunk)))
  }
  return $sb.ToString()
}
