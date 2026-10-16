# PDF: текст страниц по таблицам ToUnicode шрифтов.
# Если текста нет (скан, защищённый файл), ядро отправит модели сам PDF.

Register-AiFileReader -Id "pdf" -Label "PDF-документ" -Extensions @(".pdf") -CheckQuality -SendOriginal -Detect {
  param($bytes)
  $bytes.Length -ge 5 -and [Text.Encoding]::ASCII.GetString($bytes, 0, 5) -eq "%PDF-"
} -Read {
  param($bytes)
  Read-AiPdfText $bytes
}

$script:AiPdfLatin = [Text.Encoding]::GetEncoding(28591)
$script:AiPdfWinAnsi = [Text.Encoding]::GetEncoding(1252)
$script:AiPdfMaxChars = $script:AiFileLimits.ReadChars
$script:AiPdfToken = New-Object regex (
  '\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\))*\)' +
  '|<<|>>|<[0-9A-Fa-f\s]*>|\[|\]|/[^\s/\[\]()<>{}%]*|[-+]?(?:\d+\.?\d*|\.\d+)|%[^\r\n]*|[^\s/\[\]()<>{}%]+'
)

function Read-AiPdfText([byte[]]$bytes) {
  $doc = New-AiPdfDoc $bytes
  if (-not $doc) { return "" }
  $sb = New-Object Text.StringBuilder
  $pages = Get-AiPdfPages $doc
  if ($pages.Count -gt 0) {
    foreach ($page in $pages) {
      $parts = New-Object System.Collections.Generic.List[string]
      foreach ($ref in $page.Contents) {
        $obj = $doc.Objects[$ref]
        if ($obj) { [void]$parts.Add((Get-AiPdfStream $doc $obj)) }
      }
      $fonts = Get-AiPdfNamedRefs (Get-AiPdfEntry $doc $page.Resources "Font")
      $forms = Get-AiPdfNamedRefs (Get-AiPdfEntry $doc $page.Resources "XObject")
      Read-AiPdfContent $doc ([string]::Join("`n", $parts.ToArray())) $fonts $forms $sb 0
      [void]$sb.Append("`n`n")
      if ($sb.Length -gt $script:AiPdfMaxChars) { break }
    }
    return $sb.ToString()
  }

  $fonts = @{}
  foreach ($obj in $doc.Objects.Values) {
    $named = Get-AiPdfNamedRefs (Get-AiPdfEntry $doc $obj.Dict "Font")
    foreach ($key in $named.Keys) { if (-not $fonts.ContainsKey($key)) { $fonts[$key] = $named[$key] } }
  }
  foreach ($num in ($doc.Objects.Keys | Sort-Object)) {
    $obj = $doc.Objects[$num]
    if (-not $obj.Stream -or $obj.Dict -match '/Subtype\s*/(Image|Type1C|CIDFontType0C|OpenType)|/Length1|/ObjStm|/XRef') { continue }
    $content = Get-AiPdfStream $doc $obj
    if ($content -notmatch '\bBT\b' -or $content -notmatch 'T[Jj]') { continue }
    Read-AiPdfContent $doc $content $fonts @{} $sb 3
    [void]$sb.Append("`n`n")
    if ($sb.Length -gt $script:AiPdfMaxChars) { break }
  }
  return $sb.ToString()
}

function Find-AiPdfObjects([string]$raw) {
  $found = New-Object System.Collections.Generic.List[object]
  $pos = 0
  $n = $raw.Length
  while ($pos -lt $n -and $found.Count -lt 8000) {
    if ($script:AiFileDeadline -and [DateTime]::UtcNow -gt $script:AiFileDeadline) { break }
    $hit = $raw.IndexOf("obj", $pos)
    if ($hit -lt 0) { break }
    $after = $hit + 3
    $beforeOk = ($hit -eq 0) -or -not [char]::IsLetterOrDigit($raw[$hit - 1])
    $afterOk = ($after -ge $n) -or -not [char]::IsLetterOrDigit($raw[$after])
    if (-not $beforeOk -or -not $afterOk) { $pos = $hit + 3; continue }
    $i = $hit - 1
    while ($i -ge 0 -and [char]::IsWhiteSpace($raw[$i])) { $i-- }
    $genEnd = $i
    while ($i -ge 0 -and [char]::IsDigit($raw[$i])) { $i-- }
    if ($i -eq $genEnd) { $pos = $hit + 3; continue }
    while ($i -ge 0 -and [char]::IsWhiteSpace($raw[$i])) { $i-- }
    $idEnd = $i
    while ($i -ge 0 -and [char]::IsDigit($raw[$i])) { $i-- }
    if ($i -eq $idEnd) { $pos = $hit + 3; continue }
    $id = 0
    if (-not [int]::TryParse($raw.Substring($i + 1, $idEnd - $i), [ref]$id)) { $pos = $hit + 3; continue }
    $end = $raw.IndexOf("endobj", $after)
    if ($end -lt 0) { break }
    [void]$found.Add(@{ Id = $id; Body = $raw.Substring($after, $end - $after) })
    $pos = $end + 6
  }
  return ,$found.ToArray()
}

function New-AiPdfDoc([byte[]]$bytes) {
  $raw = $script:AiPdfLatin.GetString($bytes)
  if ($raw -match '/Encrypt\s') { return $null }
  $doc = @{ Objects = @{}; Fonts = @{}; Budget = 41943040 }
  foreach ($m in (Find-AiPdfObjects $raw)) {
    $body = $m.Body
    $entry = @{ Dict = $body; Stream = $null; Data = $null }
    $sm = [regex]::Match($body, '>>\s*stream(?:\r\n|\n|\r)')
    if ($sm.Success) {
      $start = $sm.Index + $sm.Length
      $entry.Dict = $body.Substring(0, $sm.Index + 2)
      $end = $body.LastIndexOf("endstream")
      if ($end -lt $start) { $end = $body.Length }
      $lm = [regex]::Match($entry.Dict, '/Length\s+(\d+)\b(?!\s+\d+\s+R)')
      if ($lm.Success) {
        $len = [int]$lm.Groups[1].Value
        if ($start + $len -le $end) { $end = $start + $len }
      }
      $entry.Stream = $body.Substring($start, $end - $start)
    }
    $doc.Objects[$m.Id] = $entry
  }

  foreach ($num in @($doc.Objects.Keys)) {
    $entry = $doc.Objects[$num]
    if (-not $entry.Stream -or $entry.Dict -notmatch '/Type\s*/ObjStm') { continue }
    $data = Get-AiPdfStream $doc $entry
    $nm = [regex]::Match($entry.Dict, '/N\s+(\d+)')
    $fm = [regex]::Match($entry.Dict, '/First\s+(\d+)')
    if (-not $data -or -not $nm.Success -or -not $fm.Success) { continue }
    $count = [int]$nm.Groups[1].Value
    $first = [int]$fm.Groups[1].Value
    if ($first -le 0 -or $first -gt $data.Length) { continue }
    $pairs = [regex]::Matches($data.Substring(0, $first), '\d+')
    for ($i = 0; $i + 1 -lt $pairs.Count -and $i / 2 -lt $count; $i += 2) {
      $objNum = [int]$pairs[$i].Value
      $off = $first + [int]$pairs[$i + 1].Value
      $next = $(if ($i + 3 -lt $pairs.Count) { $first + [int]$pairs[$i + 3].Value } else { $data.Length })
      if ($off -ge $data.Length -or $next -lt $off -or $next -gt $data.Length) { continue }
      if (-not $doc.Objects.ContainsKey($objNum)) {
        $doc.Objects[$objNum] = @{ Dict = $data.Substring($off, $next - $off); Stream = $null; Data = "" }
      }
    }
  }
  return $doc
}

function Get-AiPdfStream($doc, $entry) {
  if ($null -ne $entry.Data) { return $entry.Data }
  $entry.Data = ""
  $raw = $entry.Stream
  if (-not $raw) { return "" }
  $filterText = ""
  $fm = [regex]::Match($entry.Dict, '/Filter\s*(\[[^\]]*\]|/\w+)')
  if ($fm.Success) { $filterText = $fm.Groups[1].Value }
  $filters = @([regex]::Matches($filterText, '/(\w+)') | ForEach-Object { $_.Groups[1].Value })
  if ($filters.Count -eq 0) {
    $entry.Data = $raw
    return $raw
  }
  if ($filters.Count -ne 1 -or $filters[0] -notin @("FlateDecode", "Fl")) { return "" }
  $pm = [regex]::Match($entry.Dict, '/Predictor\s+(\d+)')
  if ($pm.Success -and [int]$pm.Groups[1].Value -gt 1) { return "" }
  if ($doc.Budget -le 0) { return "" }

  $packed = $script:AiPdfLatin.GetBytes($raw)
  if ($packed.Length -lt 3) { return "" }
  $src = New-Object IO.MemoryStream(, $packed)
  if (($packed[0] -band 0x0F) -eq 8) { $src.Position = 2 }
  $inflate = New-Object IO.Compression.DeflateStream($src, [IO.Compression.CompressionMode]::Decompress)
  $out = New-Object IO.MemoryStream
  $buf = New-Object byte[] 65536
  try {
    while ($true) {
      $read = $inflate.Read($buf, 0, $buf.Length)
      if ($read -le 0) { break }
      $out.Write($buf, 0, $read)
      if ($out.Length -gt $doc.Budget) { break }
    }
  } catch {
  } finally {
    $inflate.Dispose()
  }
  $doc.Budget -= $out.Length
  $entry.Data = $script:AiPdfLatin.GetString($out.ToArray())
  return $entry.Data
}

# Значение ключа словаря: вложенный << >> или словарь объекта по ссылке.
function Get-AiPdfEntry($doc, [string]$dict, [string]$key) {
  if (-not $dict) { return "" }
  $m = [regex]::Match($dict, "/$key(?![A-Za-z0-9])\s*")
  if (-not $m.Success) { return "" }
  $pos = $m.Index + $m.Length
  if ($pos + 1 -lt $dict.Length -and $dict[$pos] -eq '<' -and $dict[$pos + 1] -eq '<') {
    $depth = 0
    $i = $pos
    while ($i -lt $dict.Length - 1) {
      $open = $dict.IndexOf("<<", $i)
      $close = $dict.IndexOf(">>", $i)
      if ($close -lt 0) { break }
      if ($open -ge 0 -and $open -lt $close) {
        $depth++
        $i = $open + 2
      } else {
        $depth--
        $i = $close + 2
        if ($depth -le 0) { return $dict.Substring($pos, $i - $pos) }
      }
    }
    return $dict.Substring($pos)
  }
  $rm = [regex]::Match($dict.Substring($pos), '^(\d+)\s+\d+\s+R')
  if ($rm.Success) {
    $obj = $doc.Objects[[int]$rm.Groups[1].Value]
    if ($obj) { return [string]$obj.Dict }
  }
  return ""
}

function Get-AiPdfNamedRefs([string]$dict) {
  $map = @{}
  if (-not $dict) { return $map }
  foreach ($m in [regex]::Matches($dict, '/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R')) {
    $map[$m.Groups[1].Value] = [int]$m.Groups[2].Value
  }
  return $map
}

function Get-AiPdfRefList([string]$text) {
  $list = New-Object System.Collections.Generic.List[int]
  foreach ($m in [regex]::Matches($text, '(\d+)\s+\d+\s+R')) { [void]$list.Add([int]$m.Groups[1].Value) }
  return ,$list
}

function Get-AiPdfPages($doc) {
  $pages = New-Object System.Collections.Generic.List[object]
  $root = $null
  foreach ($obj in $doc.Objects.Values) {
    if ($obj.Dict -match '/Type\s*/Catalog') { $root = $obj; break }
  }
  if (-not $root) { return ,$pages }
  $pm = [regex]::Match($root.Dict, '/Pages\s+(\d+)\s+\d+\s+R')
  if ($pm.Success) { Add-AiPdfPages $doc ([int]$pm.Groups[1].Value) "" $pages @{} 0 }
  return ,$pages
}

function Add-AiPdfPages($doc, [int]$num, [string]$resources, $pages, $seen, [int]$depth) {
  if ($depth -gt 40 -or $seen.ContainsKey($num) -or $pages.Count -ge 500) { return }
  $seen[$num] = $true
  $obj = $doc.Objects[$num]
  if (-not $obj) { return }
  $dict = [string]$obj.Dict
  $own = Get-AiPdfEntry $doc $dict "Resources"
  if ($own) { $resources = $own }
  $km = [regex]::Match($dict, '/Kids\s*\[([^\]]*)\]')
  if ($km.Success) {
    foreach ($kid in (Get-AiPdfRefList $km.Groups[1].Value)) {
      Add-AiPdfPages $doc $kid $resources $pages $seen ($depth + 1)
    }
    return
  }
  $contents = New-Object System.Collections.Generic.List[int]
  $cm = [regex]::Match($dict, '/Contents\s*\[([^\]]*)\]')
  if ($cm.Success) {
    $contents = Get-AiPdfRefList $cm.Groups[1].Value
  } else {
    $cm = [regex]::Match($dict, '/Contents\s+(\d+)\s+\d+\s+R')
    if ($cm.Success) {
      $target = [int]$cm.Groups[1].Value
      $targetObj = $doc.Objects[$target]
      if ($targetObj -and -not $targetObj.Stream -and ([string]$targetObj.Dict).Trim().StartsWith("[")) {
        $contents = Get-AiPdfRefList $targetObj.Dict
      } else {
        [void]$contents.Add($target)
      }
    }
  }
  [void]$pages.Add(@{ Contents = $contents; Resources = $resources })
}

function Get-AiPdfArray($doc, [string]$dict, [string]$key) {
  $m = [regex]::Match($dict, "/$key\s*(\[|(\d+)\s+\d+\s+R)")
  if (-not $m.Success) { return "" }
  if ($m.Groups[2].Success) {
    $obj = $doc.Objects[[int]$m.Groups[2].Value]
    if ($obj) { return [string]$obj.Dict }
    return ""
  }
  $start = $m.Index + $m.Length - 1
  $depth = 0
  for ($i = $start; $i -lt $dict.Length; $i++) {
    $ch = $dict[$i]
    if ($ch -eq '[') { $depth++ }
    elseif ($ch -eq ']') {
      $depth--
      if ($depth -eq 0) { return $dict.Substring($start, $i - $start + 1) }
    }
  }
  return $dict.Substring($start)
}

# Ширины глифов (в тысячных долях кегля): по ним видно, где между кусками текста настоящий пробел.
function Read-AiPdfWidths($doc, [string]$dict, $font) {
  $map = New-Object 'System.Collections.Generic.Dictionary[int,double]'
  if ($dict -match '/Subtype\s*/Type0') {
    $font.WidthBytes = 2
    $font.DefaultWidth = 1000.0
    $cid = ""
    $dm = [regex]::Match($dict, '/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R')
    if (-not $dm.Success) { $dm = [regex]::Match($dict, '/DescendantFonts\s+(\d+)\s+\d+\s+R') }
    if ($dm.Success) {
      $obj = $doc.Objects[[int]$dm.Groups[1].Value]
      if ($obj) {
        $cid = [string]$obj.Dict
        $inner = [regex]::Match($cid, '^\s*\[\s*(\d+)\s+\d+\s+R')
        if ($inner.Success -and $doc.Objects[[int]$inner.Groups[1].Value]) { $cid = [string]$doc.Objects[[int]$inner.Groups[1].Value].Dict }
      }
    }
    if (-not $cid) { return }
    $dw = [regex]::Match($cid, '/DW\s+([\d.]+)')
    if ($dw.Success) { $font.DefaultWidth = ConvertTo-AiPdfNumber $dw.Groups[1].Value }
    $tokens = @([regex]::Matches((Get-AiPdfArray $doc $cid "W"), '\[|\]|[-+]?(?:\d+\.?\d*|\.\d+)') | ForEach-Object { $_.Value })
    $i = 0
    while ($i -lt $tokens.Count - 1 -and $map.Count -lt 70000) {
      if ($tokens[$i] -eq "[" -or $tokens[$i] -eq "]") { $i++; continue }
      $first = [int](ConvertTo-AiPdfNumber $tokens[$i])
      if ($tokens[$i + 1] -eq "[") {
        $i += 2
        $code = $first
        while ($i -lt $tokens.Count -and $tokens[$i] -ne "]") {
          $map[$code] = ConvertTo-AiPdfNumber $tokens[$i]
          $code++
          $i++
        }
        $i++
      } elseif ($i + 2 -lt $tokens.Count) {
        $last = [int](ConvertTo-AiPdfNumber $tokens[$i + 1])
        $width = ConvertTo-AiPdfNumber $tokens[$i + 2]
        if ($last - $first -le 65535) {
          for ($code = $first; $code -le $last; $code++) { $map[$code] = $width }
        }
        $i += 3
      } else {
        break
      }
    }
  } else {
    $font.WidthBytes = 1
    $font.DefaultWidth = 500.0
    $fc = [regex]::Match($dict, '/FirstChar\s+(\d+)')
    $first = $(if ($fc.Success) { [int]$fc.Groups[1].Value } else { 0 })
    $code = $first
    foreach ($w in [regex]::Matches((Get-AiPdfArray $doc $dict "Widths"), '[-+]?(?:\d+\.?\d*|\.\d+)')) {
      $map[$code] = ConvertTo-AiPdfNumber $w.Value
      $code++
    }
  }
  if ($map.Count -gt 0) { $font.Widths = $map }
}

function Get-AiPdfFont($doc, $num) {
  if ($null -eq $num) { return $null }
  if ($doc.Fonts.ContainsKey($num)) { return $doc.Fonts[$num] }
  $font = @{ CMap = $null; Skip = $false; Widths = $null; DefaultWidth = 500.0; WidthBytes = 1 }
  $obj = $doc.Objects[$num]
  if ($obj) {
    $dict = [string]$obj.Dict
    $tm = [regex]::Match($dict, '/ToUnicode\s+(\d+)\s+\d+\s+R')
    if ($tm.Success) {
      $cmapObj = $doc.Objects[[int]$tm.Groups[1].Value]
      if ($cmapObj) {
        $text = Get-AiPdfStream $doc $cmapObj
        if ($text) { $font.CMap = Read-AiPdfCMap $text }
      }
    }
    if (-not $font.CMap -and $dict -match '/Type0|/Identity-[HV]') { $font.Skip = $true }
    try { Read-AiPdfWidths $doc $dict $font } catch {}
  }
  $doc.Fonts[$num] = $font
  return $font
}

function ConvertFrom-AiPdfUnicodeHex([string]$hex, [int]$offset) {
  if (-not $hex) { return "" }
  if ($hex.Length -le 2) { return [string][char](([Convert]::ToInt32($hex, 16) + $offset) -band 0xFFFF) }
  if ($hex.Length % 4) { $hex = $hex.PadRight($hex.Length + 4 - $hex.Length % 4, "0") }
  $units = New-Object System.Collections.Generic.List[int]
  for ($i = 0; $i -lt $hex.Length; $i += 4) { [void]$units.Add([Convert]::ToInt32($hex.Substring($i, 4), 16)) }
  $units[$units.Count - 1] += $offset
  $sb = New-Object Text.StringBuilder
  foreach ($unit in $units) { [void]$sb.Append([char]($unit -band 0xFFFF)) }
  return $sb.ToString()
}

function Read-AiPdfCMap([string]$text) {
  $map = New-Object 'System.Collections.Generic.Dictionary[int,string]'
  $len = 0
  $cs = [regex]::Match($text, 'begincodespacerange\s*<([0-9A-Fa-f]+)>')
  if ($cs.Success) { $len = [int]($cs.Groups[1].Value.Length / 2) }
  foreach ($block in [regex]::Matches($text, '(?s)beginbfchar(.*?)endbfchar')) {
    foreach ($p in [regex]::Matches($block.Groups[1].Value, '<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>')) {
      if (-not $len) { $len = [int]($p.Groups[1].Value.Length / 2) }
      $map[[Convert]::ToInt32($p.Groups[1].Value, 16)] = ConvertFrom-AiPdfUnicodeHex $p.Groups[2].Value 0
    }
  }
  foreach ($block in [regex]::Matches($text, '(?s)beginbfrange(.*?)endbfrange')) {
    foreach ($p in [regex]::Matches($block.Groups[1].Value, '<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])')) {
      if (-not $len) { $len = [int]($p.Groups[1].Value.Length / 2) }
      $lo = [Convert]::ToInt32($p.Groups[1].Value, 16)
      $hi = [Convert]::ToInt32($p.Groups[2].Value, 16)
      if ($hi -lt $lo -or $hi - $lo -gt 65535) { continue }
      $dst = $p.Groups[3].Value
      if ($dst.StartsWith("<")) {
        $hex = $dst.Trim("<", ">")
        if ($hex.Length -eq 4) {
          $base = [Convert]::ToInt32($hex, 16)
          for ($code = $lo; $code -le $hi; $code++) { $map[$code] = [string][char](($base + $code - $lo) -band 0xFFFF) }
        } else {
          for ($code = $lo; $code -le $hi; $code++) { $map[$code] = ConvertFrom-AiPdfUnicodeHex $hex ($code - $lo) }
        }
      } else {
        $items = [regex]::Matches($dst, '<([0-9A-Fa-f]*)>')
        for ($i = 0; $i -lt $items.Count -and $lo + $i -le $hi; $i++) {
          $map[$lo + $i] = ConvertFrom-AiPdfUnicodeHex $items[$i].Groups[1].Value 0
        }
      }
    }
  }
  if ($map.Count -eq 0) { return $null }
  if ($len -lt 1 -or $len -gt 4) { $len = 2 }
  return @{ Len = $len; Map = $map }
}

# Строка PDF в «байтовую» строку: один символ = один байт.
function ConvertFrom-AiPdfString([string]$token) {
  if ($token.StartsWith("<")) {
    $hex = [regex]::Replace($token.Substring(1, $token.Length - 2), '\s', '')
    if ($hex.Length % 2) { $hex += "0" }
    $sb = New-Object Text.StringBuilder ([int]($hex.Length / 2))
    for ($i = 0; $i -lt $hex.Length; $i += 2) { [void]$sb.Append([char][Convert]::ToInt32($hex.Substring($i, 2), 16)) }
    return $sb.ToString()
  }
  $s = $token.Substring(1, $token.Length - 2)
  if ($s.IndexOf("\") -lt 0) { return $s }
  return [regex]::Replace($s, '\\(?:([0-7]{1,3})|(\r\n|\r|\n)|([\s\S]))', {
    param($m)
    if ($m.Groups[1].Success) { return [string][char]([Convert]::ToInt32($m.Groups[1].Value, 8) -band 0xFF) }
    if ($m.Groups[2].Success) { return "" }
    switch -CaseSensitive ($m.Groups[3].Value) {
      "n" { return "`n" }
      "r" { return "`r" }
      "t" { return "`t" }
      "b" { return "" }
      "f" { return "" }
      default { return $m.Groups[3].Value }
    }
  })
}

function ConvertFrom-AiPdfCodes([string]$raw, $font) {
  $cmap = $null
  $widths = $null
  $step = 1
  $dw = 500.0
  if ($font) {
    $cmap = $font.CMap
    $widths = $font.Widths
    $step = $font.WidthBytes
    $dw = $font.DefaultWidth
  }
  $advance = 0.0
  if ($widths) {
    $w = 0.0
    for ($i = 0; $i + $step -le $raw.Length; $i += $step) {
      $code = [int]$raw[$i]
      if ($step -eq 2) { $code = ($code -shl 8) -bor [int]$raw[$i + 1] }
      if ($widths.TryGetValue($code, [ref]$w)) { $advance += $w } else { $advance += $dw }
    }
  } else {
    $advance = [Math]::Floor($raw.Length / $step) * $dw
  }
  $script:AiPdfAdvance = $advance / 1000.0

  if (-not $cmap) { return $script:AiPdfWinAnsi.GetString($script:AiPdfLatin.GetBytes($raw)) }
  $n = $cmap.Len
  $map = $cmap.Map
  $sb = New-Object Text.StringBuilder
  $val = $null
  for ($i = 0; $i + $n -le $raw.Length; $i += $n) {
    $code = 0
    for ($k = 0; $k -lt $n; $k++) { $code = ($code -shl 8) -bor [int]$raw[$i + $k] }
    if ($map.TryGetValue($code, [ref]$val)) { [void]$sb.Append($val) }
    elseif ($n -eq 1 -and $code -ge 32 -and $code -lt 127) { [void]$sb.Append([char]$code) }
  }
  return $sb.ToString()
}

function Add-AiPdfBreak($sb, [string]$mark) {
  if ($sb.Length -eq 0) { return }
  $last = $sb[$sb.Length - 1]
  if ($mark -eq "`n") {
    if ($last -ne [char]10) { [void]$sb.Append("`n") }
  } elseif (-not [char]::IsWhiteSpace($last)) {
    [void]$sb.Append(" ")
  }
}

function ConvertTo-AiPdfNumber($value) {
  $n = 0.0
  if ([double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return $n }
  return 0.0
}

function Read-AiPdfContent($doc, [string]$content, $fonts, $forms, $sb, [int]$depth) {
  if (-not $content) { return }
  $re = $script:AiPdfToken
  $operands = New-Object System.Collections.Generic.List[object]
  $array = $null
  $font = $null
  $fontSize = 0.0
  $scale = 1.0
  $advance = 0.0
  $lineX = $null
  $lineY = $null
  $tokens = 0
  $pos = 0
  $m = $re.Match($content, 0)
  while ($m.Success) {
    $tokens++
    if ($tokens -gt 400000 -or $sb.Length -gt $script:AiPdfMaxChars) { break }
    if (($tokens % 2000) -eq 0 -and $script:AiFileDeadline -and [DateTime]::UtcNow -gt $script:AiFileDeadline) { break }
    $t = $m.Value
    $pos = $m.Index + $m.Length
    $c = $t[0]
    if ($c -eq '(' -or ($c -eq '<' -and $t -ne '<<')) {
      if ($null -ne $array) { [void]$array.Add($t) } else { [void]$operands.Add($t) }
    } elseif ($t -eq '[') {
      $array = New-Object System.Collections.Generic.List[object]
    } elseif ($t -eq ']') {
      if ($null -ne $array) { [void]$operands.Add($array.ToArray()) }
      $array = $null
    } elseif ($c -eq '/' -or "+-.0123456789".IndexOf($c) -ge 0) {
      if ($null -ne $array) { [void]$array.Add($t) } else { [void]$operands.Add($t) }
    } elseif ($c -eq '%' -or $t -eq '<<' -or $t -eq '>>') {
    } else {
      $count = $operands.Count
      switch -CaseSensitive ($t) {
        "Tf" {
          if ($count -ge 2) {
            $fname = ([string]$operands[$count - 2]).TrimStart("/")
            $font = $(if ($fonts.ContainsKey($fname)) { Get-AiPdfFont $doc $fonts[$fname] } else { $null })
            $fontSize = [math]::Abs((ConvertTo-AiPdfNumber $operands[$count - 1]))
          }
        }
        { $_ -ceq "Tj" -or $_ -ceq "'" -or $_ -ceq '"' } {
          if ($_ -ne "Tj") {
            Add-AiPdfBreak $sb "`n"
            $advance = 0.0
          }
          if ($count -ge 1 -and -not ($font -and $font.Skip)) {
            [void]$sb.Append((ConvertFrom-AiPdfCodes (ConvertFrom-AiPdfString ([string]$operands[$count - 1])) $font))
            $advance += $script:AiPdfAdvance * $fontSize
          }
        }
        "TJ" {
          if ($count -ge 1 -and $operands[$count - 1] -is [array] -and -not ($font -and $font.Skip)) {
            foreach ($item in $operands[$count - 1]) {
              $s = [string]$item
              if ($s.StartsWith("(") -or $s.StartsWith("<")) {
                [void]$sb.Append((ConvertFrom-AiPdfCodes (ConvertFrom-AiPdfString $s) $font))
                $advance += $script:AiPdfAdvance * $fontSize
              } else {
                $kern = ConvertTo-AiPdfNumber $s
                if ($kern -lt -180) { Add-AiPdfBreak $sb " " }
                $advance -= $kern / 1000.0 * $fontSize
              }
            }
          }
        }
        { $_ -ceq "Td" -or $_ -ceq "TD" } {
          if ($count -ge 2) {
            $tx = ConvertTo-AiPdfNumber $operands[$count - 2]
            $ty = ConvertTo-AiPdfNumber $operands[$count - 1]
            if ([math]::Abs($ty) -gt 0.01) {
              Add-AiPdfBreak $sb "`n"
            } elseif (($tx - $advance) -gt $fontSize * 0.2 -or ($tx - $advance) -lt -$fontSize) {
              Add-AiPdfBreak $sb " "
            }
            if ($null -ne $lineY) { $lineY += $ty * $scale }
            if ($null -ne $lineX) { $lineX += $tx * $scale }
            $advance = 0.0
          }
        }
        "Tm" {
          if ($count -ge 6) {
            $scale = [math]::Abs((ConvertTo-AiPdfNumber $operands[$count - 6]))
            if ($scale -lt 0.0001) { $scale = 1.0 }
            $x = ConvertTo-AiPdfNumber $operands[$count - 2]
            $y = ConvertTo-AiPdfNumber $operands[$count - 1]
            if ($null -ne $lineY -and [math]::Abs($y - $lineY) -gt 0.01) {
              Add-AiPdfBreak $sb "`n"
            } elseif ($null -ne $lineX) {
              $gap = ($x - $lineX) / $scale - $advance
              if ($gap -gt $fontSize * 0.2 -or $gap -lt -$fontSize) { Add-AiPdfBreak $sb " " }
            }
            $lineX = $x
            $lineY = $y
            $advance = 0.0
          }
        }
        "T*" {
          Add-AiPdfBreak $sb "`n"
          $advance = 0.0
        }
        "Do" {
          if ($count -ge 1 -and $depth -lt 3) {
            $xname = ([string]$operands[$count - 1]).TrimStart("/")
            if ($forms.ContainsKey($xname)) {
              $form = $doc.Objects[$forms[$xname]]
              if ($form -and $form.Stream -and $form.Dict -match '/Subtype\s*/Form') {
                $res = Get-AiPdfEntry $doc $form.Dict "Resources"
                $formFonts = $fonts
                $formForms = @{}
                if ($res) {
                  $formFonts = Get-AiPdfNamedRefs (Get-AiPdfEntry $doc $res "Font")
                  $formForms = Get-AiPdfNamedRefs (Get-AiPdfEntry $doc $res "XObject")
                }
                Read-AiPdfContent $doc (Get-AiPdfStream $doc $form) $formFonts $formForms $sb ($depth + 1)
                Add-AiPdfBreak $sb "`n"
              }
            }
          }
        }
        "BI" {
          $idPos = $content.IndexOf("ID", $pos)
          $ei = $(if ($idPos -ge 0) { [regex]::Match($content.Substring($idPos), '\sEI(?=\s|$)') } else { $null })
          $pos = $(if ($ei -and $ei.Success) { $idPos + $ei.Index + $ei.Length } else { $content.Length })
        }
      }
      $operands.Clear()
    }
    if ($pos -ge $content.Length) { break }
    $m = $re.Match($content, $pos)
  }
}
