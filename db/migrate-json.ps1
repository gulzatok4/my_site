# Разовый перенос данных из JSON-файлов прежней версии (catalog.json, orders.json, clients.json,
# order-seq.txt, папка media) в data\gulzat.db. Запускается serve.ps1 при старте.
# Всё переносится одной транзакцией: либо целиком, либо ничего. После успеха старые файлы
# перекладываются в data\legacy-json-<дата> — их можно удалить, когда станет ясно, что всё на месте.

# $null — файла нет. Битый файл заменяется его .bak; если битые оба — ошибка, и сервер не запустится,
# иначе база стартовала бы без заказов, а старые файлы ушли бы в архив
function Read-LegacyJson([string]$file) {
  $hasMain = Test-Path -LiteralPath $file -PathType Leaf
  if ($hasMain) {
    $raw = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
    if (-not $raw.Trim()) { return $null }
    try {
      return ,(ConvertFrom-JsonValue $raw)
    } catch {
      Write-Host "WARNING: $file is damaged ($($_.Exception.Message)), trying $file.bak"
    }
  }
  $bak = "$file.bak"
  if (Test-Path -LiteralPath $bak -PathType Leaf) {
    $raw = [IO.File]::ReadAllText($bak, [Text.Encoding]::UTF8)
    if (-not $raw.Trim()) { return $null }
    try {
      return ,(ConvertFrom-JsonValue $raw)
    } catch {
      throw "$file and $bak are both damaged: $($_.Exception.Message)"
    }
  }
  if ($hasMain) { throw "$file is damaged and has no backup" }
  return $null
}

function Get-LegacyFiles([string]$dataDir) {
  if (-not (Test-Path -LiteralPath $dataDir -PathType Container)) { return @() }
  return @(Get-ChildItem -LiteralPath $dataDir -Force | Where-Object {
    ($_.PSIsContainer -and $_.Name -eq "media") -or
    (-not $_.PSIsContainer -and $_.Name -match '^((catalog|orders|clients)\.json|order-seq\.txt)')
  })
}

function Import-LegacyJsonData($db, [string]$dataDir) {
  if ($null -ne (Get-DbMeta $db "legacy_json_imported")) { return }
  $legacyFiles = Get-LegacyFiles $dataDir
  if ($legacyFiles.Count -eq 0) {
    $db.Begin()
    Set-DbMeta $db "legacy_json_imported" "nothing"
    $db.Commit()
    return
  }

  $catalog = Read-LegacyJson (Join-Path $dataDir "catalog.json")
  $orders = Read-LegacyJson (Join-Path $dataDir "orders.json")
  $clients = Read-LegacyJson (Join-Path $dataDir "clients.json")
  if ($null -ne $catalog -and $catalog -isnot [System.Collections.IDictionary]) { throw "catalog.json is not a JSON object" }
  if ($null -ne $orders -and $orders -isnot [object[]]) { throw "orders.json is not a JSON array" }
  if ($null -ne $clients -and $clients -isnot [object[]]) { throw "clients.json is not a JSON array" }
  $seq = 0
  $seqFile = Join-Path $dataDir "order-seq.txt"
  if (Test-Path -LiteralPath $seqFile -PathType Leaf) {
    [void][long]::TryParse(([IO.File]::ReadAllText($seqFile)).Trim(), [ref]$seq)
  }

  $report = [ordered]@{ photos = 0; products = 0; orders = 0; clients = 0; skippedClients = 0; renumbered = 0 }
  $db.Begin()
  try {
    # Фото, уже вынесенные прежней версией в data\media, сохраняют имя: на него ссылается каталог
    $mediaDir = Join-Path $dataDir "media"
    if (Test-Path -LiteralPath $mediaDir -PathType Container) {
      foreach ($file in Get-ChildItem -LiteralPath $mediaDir -File) {
        $type = $script:MediaTypes[$file.Extension.ToLowerInvariant()]
        if (-not $type) { continue }
        [void](Save-DbMedia $db ([IO.File]::ReadAllBytes($file.FullName)) $type $file.Name)
        $report.photos++
      }
    }

    if ($null -ne $catalog) {
      $report.photos += Save-CatalogMedia $db (Get-DbValue $catalog "products")
      $revision = 0
      [void][int]::TryParse([string](Get-DbValue $catalog "revision"), [ref]$revision)
      Set-DbMeta $db "catalog_revision" $revision
      Save-CatalogDocument $db $catalog
      $report.products = [int]$db.Scalar("SELECT COUNT(*) FROM products", $null)
    }

    $orderList = ConvertTo-ObjectList $orders
    $usedIds = @{}
    $usedClientIds = @{}
    $usedNumbers = @{}
    $needNumber = New-Object System.Collections.Generic.List[object]
    $validOrders = New-Object System.Collections.Generic.List[object]
    foreach ($order in $orderList) {
      if ($order -isnot [System.Collections.IDictionary]) { continue }
      $id = ([string](Get-DbValue $order "id")).Trim()
      if (-not $id -or $usedIds.ContainsKey($id)) { $id = New-DbId "o" }
      $usedIds[$id] = $true
      $order["id"] = $id
      $clientId = ([string](Get-DbValue $order "clientId")).Trim()
      if ($clientId -and $usedClientIds.ContainsKey($clientId)) { $clientId = "" }
      if ($clientId) { $usedClientIds[$clientId] = $true }
      $order["clientId"] = $clientId
      if ([string](Get-DbValue $order "status") -notin @("new", "work", "done", "cancel")) { $order["status"] = "new" }
      if (-not [string](Get-DbValue $order "createdAt")) { $order["createdAt"] = (Get-Date).ToString("o") }
      $number = 0
      if ([long]::TryParse([string](Get-DbValue $order "number"), [ref]$number) -and $number -gt 0 -and -not $usedNumbers.ContainsKey($number)) {
        $usedNumbers[$number] = $true
        $order["number"] = $number
      } else {
        $needNumber.Add($order)
      }
      $validOrders.Add($order)
    }
    $maxNumber = [long]0
    foreach ($n in $usedNumbers.Keys) { if ([long]$n -gt $maxNumber) { $maxNumber = [long]$n } }
    $maxNumber = [Math]::Max($maxNumber, $seq)
    foreach ($order in $needNumber) {
      $maxNumber++
      $order["number"] = $maxNumber
      $report.renumbered++
    }
    foreach ($order in $validOrders) { Add-DbOrder $db $order }
    Set-LegacyStockTaken $db
    $report.orders = [int]$db.Scalar("SELECT COUNT(*) FROM orders", $null)
    if ($report.orders -ne $validOrders.Count) { throw "orders imported $($report.orders) of $($validOrders.Count)" }
    $seqNow = [Math]::Max($seq, [long]$db.Scalar("SELECT COALESCE(MAX(number), 0) FROM orders", $null))
    Set-DbMeta $db "order_seq" $seqNow

    if ($null -ne $clients) {
      foreach ($client in (ConvertTo-ObjectList $clients)) {
        $phone = ([string](Get-DbValue $client "phone")).Trim()
        if ($client -isnot [System.Collections.IDictionary] -or -not $phone) { $report.skippedClients++; continue }
        $id = ([string](Get-DbValue $client "id")).Trim()
        if (-not $id) { $id = New-DbId "c" }
        $createdAt = [string](Get-DbValue $client "createdAt")
        if (-not $createdAt) { $createdAt = (Get-Date).ToString("o") }
        $updatedAt = [string](Get-DbValue $client "updatedAt")
        $db.Execute(@'
INSERT INTO clients (id, name, phone, channel, source, note, created_at, last_seen_at, updated_at)
VALUES (@id, @name, @phone, @channel, @source, @note, @created_at, @last_seen_at, @updated_at)
ON CONFLICT DO NOTHING
'@, @{
          id = $id
          name = [string](Get-DbValue $client "name")
          phone = $phone
          channel = [string](Get-DbValue $client "channel")
          source = [string](Get-DbValue $client "source")
          note = [string](Get-DbValue $client "note")
          created_at = $createdAt
          last_seen_at = [string](Get-DbValue $client "lastSeenAt")
          updated_at = $(if ($updatedAt) { $updatedAt } else { $null })
        })
        if ($db.Changes -eq 0) { $report.skippedClients++ }
      }
    }
    # Клиенты прежде собирались из заказов, если clients.json ещё не было; заказы без клиента добавляем так же
    for ($i = $validOrders.Count - 1; $i -ge 0; $i--) {
      $order = $validOrders[$i]
      $phone = [string](Get-DbValue $order "phone")
      if (-not $phone) { continue }
      $exists = $db.Scalar("SELECT 1 FROM clients WHERE phone = @phone", @{ phone = $phone })
      if ($null -ne $exists) { continue }
      Save-DbClientFromOrder $db ([string](Get-DbValue $order "name")) $phone ([string](Get-DbValue $order "channel")) ([string](Get-DbValue $order "createdAt"))
    }
    $report.clients = [int]$db.Scalar("SELECT COUNT(*) FROM clients", $null)

    Set-DbMeta $db "legacy_json_imported" (Get-Date).ToString("o")
    $db.Commit()
  } catch {
    $db.Rollback()
    throw
  }

  $archive = Join-Path $dataDir ("legacy-json-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  try {
    [void](New-Item -ItemType Directory -Path $archive)
    foreach ($item in $legacyFiles) {
      Move-Item -LiteralPath $item.FullName -Destination (Join-Path $archive $item.Name) -ErrorAction Stop
    }
  } catch {
    Write-Host "WARNING: old JSON files were imported but not moved to ${archive}: $($_.Exception.Message)"
  }
  $line = ($report.GetEnumerator() | ForEach-Object { "$($_.Key) $($_.Value)" }) -join ", "
  Write-Host "Imported old JSON data into SQLite ($line). Old files moved to $archive"
}
