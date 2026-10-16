# Офисные документы: DOCX, XLSX, PPTX, OpenDocument и старый DOC.
Add-Type -AssemblyName System.IO.Compression

Register-AiFileReader -Id "docx" -Label "документ Word" -Extensions @(".docx", ".docm", ".dotx") -Detect {
  param($bytes)
  Test-AiZipEntry $bytes "word/document.xml"
} -Read {
  param($bytes)
  Read-AiDocxText $bytes
}

Register-AiFileReader -Id "xlsx" -Label "таблицу Excel" -Extensions @(".xlsx", ".xlsm") -Detect {
  param($bytes)
  Test-AiZipEntry $bytes "xl/workbook.xml"
} -Read {
  param($bytes)
  Read-AiXlsxText $bytes
}

Register-AiFileReader -Id "pptx" -Label "презентацию" -Extensions @(".pptx") -Detect {
  param($bytes)
  Test-AiZipEntry $bytes "ppt/presentation.xml"
} -Read {
  param($bytes)
  Read-AiPptxText $bytes
}

Register-AiFileReader -Id "odf" -Label "документ OpenDocument" -Extensions @(".odt", ".ods", ".odp") -Detect {
  param($bytes)
  (Test-AiZipEntry $bytes "content.xml") -and (Test-AiZipEntry $bytes "mimetype")
} -Read {
  param($bytes)
  Read-AiOdfText $bytes
}

Register-AiFileReader -Id "doc" -Label "документ Word (старый формат .doc)" -Extensions @(".doc") -CheckQuality `
  -Hint "Попроси сохранить его в DOCX или PDF и прислать ещё раз." -Read {
  param($bytes)
  Read-AiLegacyWordText $bytes
}

$script:AiOfficeMaxChars = $script:AiFileLimits.ReadChars

function Open-AiZip([byte[]]$bytes) {
  $stream = New-Object IO.MemoryStream(, $bytes)
  return New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read)
}

function Test-AiZipEntry([byte[]]$bytes, [string]$entryName) {
  if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B -or $bytes[2] -ne 3 -or $bytes[3] -ne 4) { return $false }
  try {
    $zip = Open-AiZip $bytes
    try { return $null -ne $zip.GetEntry($entryName) } finally { $zip.Dispose() }
  } catch {
    return $false
  }
}

function Open-AiCappedEntry($entry) {
  $max = 8388608
  if ($null -eq $entry) { throw "missing entry" }
  if ([int64]$entry.Length -gt $max) { throw "zip entry too large" }
  $source = $entry.Open()
  try {
    $ms = New-Object IO.MemoryStream
    $buf = New-Object byte[] 65536
    $total = 0
    while ($true) {
      $read = $source.Read($buf, 0, $buf.Length)
      if ($read -le 0) { break }
      $total += $read
      if ($total -gt $max) { throw "zip entry too large" }
      $ms.Write($buf, 0, $read)
    }
    $ms.Position = 0
    return $ms
  } finally {
    $source.Dispose()
  }
}

function New-AiXmlReader($entry) {
  $settings = New-Object Xml.XmlReaderSettings
  $settings.DtdProcessing = [Xml.DtdProcessing]::Ignore
  $settings.XmlResolver = $null
  $settings.IgnoreComments = $true
  $settings.IgnoreProcessingInstructions = $true
  $settings.CloseInput = $true
  return [Xml.XmlReader]::Create((Open-AiCappedEntry $entry), $settings)
}

function Read-AiXmlDocument($entry) {
  $reader = New-AiXmlReader $entry
  try {
    $doc = New-Object Xml.XmlDocument
    $doc.Load($reader)
    return $doc
  } finally {
    $reader.Close()
  }
}

# Текст из XML офисного файла. TextIn — элементы с текстом ("*" — любой текст),
# Breaks — что дописать после элемента, Skip — поддеревья, которые не читаем.
function ConvertFrom-AiXmlEntry($entry, [string[]]$TextIn, [hashtable]$Breaks, [string[]]$Skip, [int]$MaxChars) {
  $sb = New-Object Text.StringBuilder
  $reader = New-AiXmlReader $entry
  $anyText = $TextIn -contains "*"
  $textDepth = 0
  $cellDepth = 0
  $skipDepth = -1
  try {
    while ($reader.Read()) {
      $type = $reader.NodeType
      if ($skipDepth -ge 0) {
        if ($type -eq [Xml.XmlNodeType]::EndElement -and $reader.Depth -eq $skipDepth) { $skipDepth = -1 }
        continue
      }
      if ($type -eq [Xml.XmlNodeType]::Element) {
        $name = $reader.LocalName
        if ($Skip -contains $name) {
          if (-not $reader.IsEmptyElement) { $skipDepth = $reader.Depth }
          continue
        }
        $isCell = $name -eq "tc" -or $name -eq "table-cell"
        if ($reader.IsEmptyElement) {
          if ($Breaks.ContainsKey($name)) { [void]$sb.Append((Get-AiXmlBreak $Breaks $name $cellDepth)) }
          continue
        }
        if ($isCell) { $cellDepth++ }
        if ($TextIn -contains $name) { $textDepth++ }
      } elseif ($type -eq [Xml.XmlNodeType]::EndElement) {
        $name = $reader.LocalName
        if ($TextIn -contains $name -and $textDepth -gt 0) { $textDepth-- }
        if (($name -eq "tc" -or $name -eq "table-cell") -and $cellDepth -gt 0) { $cellDepth-- }
        if ($Breaks.ContainsKey($name)) { [void]$sb.Append((Get-AiXmlBreak $Breaks $name $cellDepth)) }
        if ($sb.Length -gt $MaxChars) { break }
      } elseif ($type -eq [Xml.XmlNodeType]::Text -or $type -eq [Xml.XmlNodeType]::CDATA -or $type -eq [Xml.XmlNodeType]::SignificantWhitespace) {
        if ($anyText -or $textDepth -gt 0) { [void]$sb.Append($reader.Value) }
      }
    }
  } finally {
    $reader.Close()
  }
  return $sb.ToString()
}

function Get-AiXmlBreak([hashtable]$Breaks, [string]$name, [int]$cellDepth) {
  $value = [string]$Breaks[$name]
  if ($cellDepth -gt 0 -and $value -eq "`n" -and $name -ne "tr" -and $name -ne "table-row") { return " " }
  return $value
}

function Read-AiDocxText([byte[]]$bytes) {
  $zip = Open-AiZip $bytes
  try {
    $entry = $zip.GetEntry("word/document.xml")
    if (-not $entry) { return "" }
    $breaks = @{ p = "`n"; tab = "`t"; br = "`n"; cr = "`n"; tc = " | "; tr = "`n"; noBreakHyphen = "-" }
    $skip = @("pPr", "rPr", "tblPr", "sectPr", "instrText", "delText", "Fallback")
    return ConvertFrom-AiXmlEntry $entry @("t") $breaks $skip $script:AiOfficeMaxChars
  } finally {
    $zip.Dispose()
  }
}

function Read-AiPptxText([byte[]]$bytes) {
  $zip = Open-AiZip $bytes
  try {
    $slides = @($zip.Entries | Where-Object { $_.FullName -match '^ppt/slides/slide(\d+)\.xml$' } |
      Sort-Object { [int]([regex]::Match($_.FullName, '(\d+)\.xml$').Groups[1].Value) })
    $breaks = @{ p = "`n"; br = "`n"; tab = "`t"; tc = " | "; tr = "`n" }
    $sb = New-Object Text.StringBuilder
    $index = 0
    foreach ($slide in $slides) {
      $index++
      $text = ConvertFrom-AiXmlEntry $slide @("t") $breaks @() $script:AiOfficeMaxChars
      if (-not $text.Trim()) { continue }
      [void]$sb.Append("Слайд ${index}:`n").Append($text.Trim()).Append("`n`n")
      if ($sb.Length -gt $script:AiOfficeMaxChars) { break }
    }
    return $sb.ToString()
  } finally {
    $zip.Dispose()
  }
}

function Read-AiOdfText([byte[]]$bytes) {
  $zip = Open-AiZip $bytes
  try {
    $entry = $zip.GetEntry("content.xml")
    if (-not $entry) { return "" }
    $breaks = @{ p = "`n"; h = "`n"; tab = "`t"; "line-break" = "`n"; s = " "; "table-cell" = " | "; "table-row" = "`n" }
    $skip = @("tracked-changes", "annotation", "automatic-styles", "font-face-decls")
    return ConvertFrom-AiXmlEntry $entry @("*") $breaks $skip $script:AiOfficeMaxChars
  } finally {
    $zip.Dispose()
  }
}

function Get-AiXlsxColumn([string]$ref) {
  $col = 0
  foreach ($ch in $ref.ToCharArray()) {
    if ($ch -lt [char]'A' -or $ch -gt [char]'Z') { break }
    $col = $col * 26 + ([int]$ch - 64)
  }
  return $col - 1
}

function Read-AiXlsxSharedStrings($zip) {
  $list = New-Object System.Collections.Generic.List[string]
  $entry = $zip.GetEntry("xl/sharedStrings.xml")
  if (-not $entry) { return ,$list }
  $reader = New-AiXmlReader $entry
  $current = $null
  $inText = $false
  $phonetic = 0
  $total = 0
  try {
    while ($reader.Read()) {
      $type = $reader.NodeType
      if ($type -eq [Xml.XmlNodeType]::Element) {
        $name = $reader.LocalName
        if ($name -eq "si") {
          $current = New-Object Text.StringBuilder
          if ($reader.IsEmptyElement) { [void]$list.Add(""); $current = $null }
        } elseif ($name -eq "rPh" -and -not $reader.IsEmptyElement) { $phonetic++ }
        elseif ($name -eq "t" -and -not $reader.IsEmptyElement) { $inText = $true }
      } elseif ($type -eq [Xml.XmlNodeType]::EndElement) {
        $name = $reader.LocalName
        if ($name -eq "t") { $inText = $false }
        elseif ($name -eq "rPh" -and $phonetic -gt 0) { $phonetic-- }
        elseif ($name -eq "si" -and $null -ne $current) {
          $value = $current.ToString()
          $total += $value.Length
          [void]$list.Add($value)
          $current = $null
          if ($total -gt 4000000) { break }
        }
      } elseif ($inText -and $phonetic -eq 0 -and $null -ne $current -and ($type -eq [Xml.XmlNodeType]::Text -or $type -eq [Xml.XmlNodeType]::SignificantWhitespace -or $type -eq [Xml.XmlNodeType]::Whitespace)) {
        [void]$current.Append($reader.Value)
      }
    }
  } finally {
    $reader.Close()
  }
  return ,$list
}

function Get-AiXlsxSheets($zip) {
  $sheets = New-Object System.Collections.Generic.List[object]
  try {
    $book = Read-AiXmlDocument ($zip.GetEntry("xl/workbook.xml"))
    $targets = @{}
    $relsEntry = $zip.GetEntry("xl/_rels/workbook.xml.rels")
    if ($relsEntry) {
      $rels = Read-AiXmlDocument $relsEntry
      foreach ($rel in $rels.GetElementsByTagName("Relationship")) {
        $target = [string]$rel.GetAttribute("Target")
        if ($target.StartsWith("/")) { $target = $target.TrimStart("/") } else { $target = "xl/" + $target }
        $targets[[string]$rel.GetAttribute("Id")] = $target
      }
    }
    $relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    foreach ($node in $book.GetElementsByTagName("sheet")) {
      $id = [string]$node.GetAttribute("id", $relNs)
      if (-not $targets.ContainsKey($id)) { continue }
      $entry = $zip.GetEntry($targets[$id])
      if ($entry) { [void]$sheets.Add(@{ Name = [string]$node.GetAttribute("name"); Entry = $entry }) }
    }
  } catch {
    $sheets.Clear()
  }
  if ($sheets.Count -eq 0) {
    $index = 0
    $entries = @($zip.Entries | Where-Object { $_.FullName -match '^xl/worksheets/sheet(\d+)\.xml$' } |
      Sort-Object { [int]([regex]::Match($_.FullName, '(\d+)\.xml$').Groups[1].Value) })
    foreach ($entry in $entries) {
      $index++
      [void]$sheets.Add(@{ Name = "Лист $index"; Entry = $entry })
    }
  }
  return ,$sheets
}

function Read-AiXlsxSheet($entry, $shared, [int]$maxChars) {
  $sb = New-Object Text.StringBuilder
  $reader = New-AiXmlReader $entry
  $cells = $null
  $maxCol = -1
  $col = -1
  $cellType = ""
  $value = $null
  $inValue = $false
  $rows = 0
  try {
    while ($reader.Read()) {
      $type = $reader.NodeType
      if ($type -eq [Xml.XmlNodeType]::Element) {
        $name = $reader.LocalName
        if ($name -eq "row") {
          if ($reader.IsEmptyElement) { continue }
          $cells = @{}
          $maxCol = -1
          $col = -1
        } elseif ($name -eq "c" -and $null -ne $cells) {
          $ref = [string]$reader.GetAttribute("r")
          $col = $(if ($ref) { Get-AiXlsxColumn $ref } else { $col + 1 })
          $cellType = [string]$reader.GetAttribute("t")
          $value = New-Object Text.StringBuilder
          if ($reader.IsEmptyElement) { $value = $null }
        } elseif (($name -eq "v" -or $name -eq "t") -and $null -ne $value -and -not $reader.IsEmptyElement) {
          $inValue = $true
        }
      } elseif ($type -eq [Xml.XmlNodeType]::EndElement) {
        $name = $reader.LocalName
        if ($name -eq "v" -or $name -eq "t") {
          $inValue = $false
        } elseif ($name -eq "c" -and $null -ne $value) {
          $text = $value.ToString()
          if ($cellType -eq "s") {
            $idx = 0
            $text = $(if ([int]::TryParse($text, [ref]$idx) -and $idx -ge 0 -and $idx -lt $shared.Count) { $shared[$idx] } else { "" })
          } elseif ($cellType -eq "b") {
            $text = $(if ($text -eq "1") { "да" } else { "нет" })
          }
          $text = ($text -replace "\s+", " ").Trim()
          if ($text -and $col -ge 0 -and $col -lt 200) {
            $cells[$col] = $text
            if ($col -gt $maxCol) { $maxCol = $col }
          }
          $value = $null
        } elseif ($name -eq "row" -and $null -ne $cells) {
          if ($maxCol -ge 0) {
            $line = New-Object System.Collections.Generic.List[string]
            for ($i = 0; $i -le $maxCol; $i++) {
              $cellText = $cells[$i]
              [void]$line.Add($(if ($null -ne $cellText) { [string]$cellText } else { "" }))
            }
            [void]$sb.Append([string]::Join(" | ", $line.ToArray())).Append("`n")
            $rows++
          }
          $cells = $null
          if ($rows -ge 2000 -or $sb.Length -gt $maxChars) { break }
        }
      } elseif ($inValue -and ($type -eq [Xml.XmlNodeType]::Text -or $type -eq [Xml.XmlNodeType]::SignificantWhitespace)) {
        [void]$value.Append($reader.Value)
      }
    }
  } finally {
    $reader.Close()
  }
  return $sb.ToString()
}

function Read-AiXlsxText([byte[]]$bytes) {
  $zip = Open-AiZip $bytes
  try {
    $shared = Read-AiXlsxSharedStrings $zip
    $sb = New-Object Text.StringBuilder
    foreach ($sheet in (Get-AiXlsxSheets $zip)) {
      $left = $script:AiOfficeMaxChars - $sb.Length
      if ($left -le 0) { break }
      $text = Read-AiXlsxSheet $sheet.Entry $shared $left
      if (-not $text.Trim()) { continue }
      [void]$sb.Append("Лист «$($sheet.Name)»:`n").Append($text).Append("`n")
    }
    return $sb.ToString()
  } finally {
    $zip.Dispose()
  }
}

# Старый DOC лежит в контейнере OLE: достаём потоки WordDocument и таблицу,
# затем собираем основной текст по таблице фрагментов (CLX).
function Read-AiCfbChain([byte[]]$bytes, [int[]]$fat, [int]$start, [int]$sectorSize, [long]$limit) {
  $out = New-Object IO.MemoryStream
  $sector = $start
  $steps = 0
  while ($sector -ge 0 -and $sector -lt $fat.Length -and $out.Length -lt $limit -and $steps -lt 200000) {
    $offset = ($sector + 1) * $sectorSize
    if ($offset + $sectorSize -gt $bytes.Length) { break }
    $out.Write($bytes, $offset, $sectorSize)
    $sector = $fat[$sector]
    $steps++
  }
  return ,$out.ToArray()
}

function Read-AiCfbMiniChain([byte[]]$mini, [int[]]$miniFat, [int]$start, [int]$miniSize, [long]$limit) {
  $out = New-Object IO.MemoryStream
  $sector = $start
  $steps = 0
  while ($sector -ge 0 -and $sector -lt $miniFat.Length -and $out.Length -lt $limit -and $steps -lt 200000) {
    $offset = $sector * $miniSize
    if ($offset + $miniSize -gt $mini.Length) { break }
    $out.Write($mini, $offset, $miniSize)
    $sector = $miniFat[$sector]
    $steps++
  }
  return ,$out.ToArray()
}

function ConvertTo-AiIntArray([byte[]]$data) {
  $ints = New-Object int[] ([int][Math]::Floor($data.Length / 4))
  [Buffer]::BlockCopy($data, 0, $ints, 0, $ints.Length * 4)
  return ,$ints
}

function Read-AiCfbStreams([byte[]]$bytes, [string[]]$names) {
  $found = @{}
  if ($bytes.Length -lt 512 -or $bytes[0] -ne 0xD0 -or $bytes[1] -ne 0xCF -or $bytes[2] -ne 0x11 -or $bytes[3] -ne 0xE0) { return $found }
  $sectorSize = 1 -shl [BitConverter]::ToUInt16($bytes, 0x1E)
  $miniSize = 1 -shl [BitConverter]::ToUInt16($bytes, 0x20)
  $dirStart = [BitConverter]::ToInt32($bytes, 0x30)
  $miniCutoff = [BitConverter]::ToUInt32($bytes, 0x38)
  $miniFatStart = [BitConverter]::ToInt32($bytes, 0x3C)
  $difat = [BitConverter]::ToInt32($bytes, 0x44)
  $difatCount = [BitConverter]::ToInt32($bytes, 0x48)
  if ($sectorSize -lt 512 -or $sectorSize -gt 4096) { return $found }

  $fatSectors = New-Object System.Collections.Generic.List[int]
  for ($i = 0; $i -lt 109; $i++) {
    $v = [BitConverter]::ToInt32($bytes, 0x4C + $i * 4)
    if ($v -ge 0) { [void]$fatSectors.Add($v) }
  }
  $per = $sectorSize / 4
  for ($k = 0; $k -lt $difatCount -and $difat -ge 0; $k++) {
    $offset = ($difat + 1) * $sectorSize
    if ($offset + $sectorSize -gt $bytes.Length) { break }
    for ($i = 0; $i -lt $per - 1; $i++) {
      $v = [BitConverter]::ToInt32($bytes, $offset + $i * 4)
      if ($v -ge 0) { [void]$fatSectors.Add($v) }
    }
    $difat = [BitConverter]::ToInt32($bytes, $offset + ($per - 1) * 4)
  }
  $fat = New-Object int[] ($fatSectors.Count * $per)
  for ($i = 0; $i -lt $fatSectors.Count; $i++) {
    $offset = ($fatSectors[$i] + 1) * $sectorSize
    if ($offset + $sectorSize -gt $bytes.Length) { continue }
    [Buffer]::BlockCopy($bytes, $offset, $fat, $i * $sectorSize, $sectorSize)
  }

  $dir = Read-AiCfbChain $bytes $fat $dirStart $sectorSize 4194304
  $entries = New-Object System.Collections.Generic.List[object]
  for ($off = 0; $off + 128 -le $dir.Length; $off += 128) {
    $nameLen = [BitConverter]::ToUInt16($dir, $off + 0x40)
    $name = ""
    if ($nameLen -ge 2 -and $nameLen -le 64) { $name = [Text.Encoding]::Unicode.GetString($dir, $off, $nameLen - 2) }
    [void]$entries.Add(@{
      Name = $name
      Type = $dir[$off + 0x42]
      Start = [BitConverter]::ToInt32($dir, $off + 0x74)
      Size = [long][BitConverter]::ToUInt32($dir, $off + 0x78)
    })
  }
  if ($entries.Count -eq 0) { return $found }

  $root = $entries[0]
  $mini = $null
  $miniFat = $null
  foreach ($entry in $entries) {
    if ($entry.Type -ne 2 -or $names -notcontains $entry.Name -or $found.ContainsKey($entry.Name)) { continue }
    if ($entry.Size -lt $miniCutoff) {
      if ($null -eq $mini) {
        $mini = Read-AiCfbChain $bytes $fat $root.Start $sectorSize $root.Size
        $miniFat = ConvertTo-AiIntArray (Read-AiCfbChain $bytes $fat $miniFatStart $sectorSize 16777216)
      }
      $data = Read-AiCfbMiniChain $mini $miniFat $entry.Start $miniSize $entry.Size
    } else {
      $data = Read-AiCfbChain $bytes $fat $entry.Start $sectorSize $entry.Size
    }
    if ($data.Length -gt $entry.Size) {
      $cut = New-Object byte[] $entry.Size
      [Array]::Copy($data, $cut, $entry.Size)
      $data = $cut
    }
    $found[$entry.Name] = $data
  }
  return $found
}

function Read-AiLegacyWordText([byte[]]$bytes) {
  $streams = Read-AiCfbStreams $bytes @("WordDocument", "0Table", "1Table")
  $wd = $streams["WordDocument"]
  if (-not $wd -or $wd.Length -lt 0x200 -or [BitConverter]::ToUInt16($wd, 0) -ne 0xA5EC) { return "" }
  $flags = [BitConverter]::ToUInt16($wd, 0x0A)
  if ($flags -band 0x0100) { return "" }
  $table = $streams[$(if ($flags -band 0x0200) { "1Table" } else { "0Table" })]
  if (-not $table) { return "" }

  $csw = [BitConverter]::ToUInt16($wd, 32)
  $lwStart = 34 + $csw * 2 + 2
  $cslw = [BitConverter]::ToUInt16($wd, 34 + $csw * 2)
  $ccpText = [BitConverter]::ToInt32($wd, $lwStart + 12)
  $fcLcbStart = $lwStart + $cslw * 4 + 2
  $fcClx = [BitConverter]::ToInt32($wd, $fcLcbStart + 33 * 8)
  $lcbClx = [BitConverter]::ToInt32($wd, $fcLcbStart + 33 * 8 + 4)
  if ($fcClx -lt 0 -or $lcbClx -le 0 -or $fcClx + $lcbClx -gt $table.Length) { return "" }

  $pos = $fcClx
  $plc = -1
  $lcb = 0
  while ($pos -lt $fcClx + $lcbClx) {
    if ($table[$pos] -eq 1) { $pos += 3 + [BitConverter]::ToInt16($table, $pos + 1); continue }
    if ($table[$pos] -eq 2) { $lcb = [BitConverter]::ToInt32($table, $pos + 1); $plc = $pos + 5 }
    break
  }
  if ($plc -lt 0 -or $lcb -lt 16 -or $plc + $lcb -gt $table.Length) { return "" }

  $pieces = [int](($lcb - 4) / 12)
  $sb = New-Object Text.StringBuilder
  $left = $ccpText
  if ($left -le 0) { $left = [int]::MaxValue }
  $ansi = [Text.Encoding]::GetEncoding(1252)
  for ($i = 0; $i -lt $pieces -and $left -gt 0; $i++) {
    $cpStart = [BitConverter]::ToInt32($table, $plc + $i * 4)
    $cpEnd = [BitConverter]::ToInt32($table, $plc + ($i + 1) * 4)
    $count = [Math]::Min($cpEnd - $cpStart, $left)
    if ($count -le 0) { continue }
    $fc = [long][BitConverter]::ToUInt32($table, $plc + ($pieces + 1) * 4 + $i * 8 + 2)
    if ($fc -band 0x40000000) {
      $offset = [int](($fc -band 0x3FFFFFFF) / 2)
      if ($offset + $count -gt $wd.Length) { break }
      [void]$sb.Append($ansi.GetString($wd, $offset, $count))
    } else {
      if ($fc + $count * 2 -gt $wd.Length) { break }
      [void]$sb.Append([Text.Encoding]::Unicode.GetString($wd, [int]$fc, $count * 2))
    }
    $left -= $count
    if ($sb.Length -gt $script:AiOfficeMaxChars) { break }
  }

  $text = $sb.ToString()
  $text = [regex]::Replace($text, '\x13[^\x13\x14\x15]*\x14', '')
  $text = [regex]::Replace($text, '\x13[^\x13\x14\x15]*\x15', '')
  $text = $text -replace "\x07\x07", "`n" -replace "\x07", " | " -replace "[\r\x0B\x0C]", "`n"
  $text = $text -replace "\x1E", "-" -replace "[\x01\x08\x15\x1F]", ""
  return $text
}
