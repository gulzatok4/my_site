$root = $PSScriptRoot
$rootFull = [IO.Path]::GetFullPath($root).TrimEnd("\") + "\"
$envFile = Join-Path $root ".env"
$dataDir = Join-Path $root "data"
$dbFile = Join-Path $dataDir "gulzat.db"
$backupDir = Join-Path $dataDir "backups"
$orderStatuses = @("new", "work", "done", "cancel")
$pendingWrites = New-Object System.Collections.Generic.List[object]

# Все данные — в SQLite (db\db.ps1). Пишет только основной поток сервера, каждое изменение — одна транзакция
. (Join-Path $root "db\db.ps1")
. (Join-Path $root "db\migrate-json.ps1")
$db = $null

function Load-DotEnv([string]$path) {
  if (-not (Test-Path $path -PathType Leaf)) { return }
  Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
    if ($key) {
      Set-Item -Path "Env:$key" -Value $value
    }
  }
}

function Write-Bytes($ctx, [int]$status, [string]$contentType, [byte[]]$bytes) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentEncoding = [Text.Encoding]::UTF8
  $ctx.Response.ContentType = $contentType
  $ctx.Response.ContentLength64 = $bytes.Length
  if ($ctx.Request.HttpMethod -ne "HEAD" -and $bytes.Length -gt 0) {
    # Основной поток не ждёт, пока медленный посетитель примет ответ, иначе вся очередь запросов стоит.
    # В потоках чата списка нет — там ответ пишется как обычно
    if ($null -ne $script:pendingWrites) {
      $script:pendingWrites.Add(@{ ctx = $ctx; task = $ctx.Response.OutputStream.WriteAsync($bytes, 0, $bytes.Length) })
      return
    }
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  }
  $ctx.Response.Close()
}

function Complete-PendingWrites {
  for ($i = $script:pendingWrites.Count - 1; $i -ge 0; $i--) {
    $write = $script:pendingWrites[$i]
    if (-not $write.task.IsCompleted) { continue }
    $script:pendingWrites.RemoveAt($i)
    try {
      if ($write.task.IsFaulted -or $write.task.IsCanceled) { $write.ctx.Response.Abort() } else { $write.ctx.Response.Close() }
    } catch {}
  }
}

function Write-Json($ctx, [int]$status, $obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 6
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Write-Bytes $ctx $status "application/json; charset=utf-8" $bytes
}

function Get-Val($obj, [string]$key) {
  if ($null -eq $obj) { return $null }
  try { return $obj[$key] } catch {}
  try { return $obj.$key } catch {}
  return $null
}

function Get-RequestJson($ctx, [int]$timeoutMs = 0) {
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
  try {
    if ($timeoutMs -gt 0) {
      $task = $reader.ReadToEndAsync()
      if (-not $task.Wait($timeoutMs)) {
        $ctx.Response.Abort()
        throw "request body timeout"
      }
      $raw = $task.Result
    } else {
      $raw = $reader.ReadToEnd()
    }
  } finally {
    $reader.Close()
  }
  if (-not $raw) { return $null }
  Add-Type -AssemblyName System.Web.Extensions
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 16777216
  $ser.RecursionLimit = 64
  return $ser.DeserializeObject($raw)
}


function New-JsonSerializer {
  Add-Type -AssemblyName System.Web.Extensions
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 67108864
  $ser.RecursionLimit = 64
  return $ser
}

function Limit-Text($value, [int]$max) {
  $text = ([string]$value).Trim()
  if ($text.Length -gt $max) { $text = $text.Substring(0, $max) }
  return $text
}

function Write-JsonText($ctx, [string]$json) {
  Write-Bytes $ctx 200 "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes($json))
}

$adminFailures = @{}
$adminMaxFailures = 10
$adminLockMinutes = 15

# Сервер слушает только 127.0.0.1, поэтому снаружи сайт открыт через туннель и все запросы приходят «с 127.0.0.1».
# Настоящий адрес кладёт сам туннель: CF-Connecting-IP (Cloudflare) или последний адрес в X-Forwarded-For
function Get-ClientAddress($ctx) {
  $remote = $ctx.Request.RemoteEndPoint.Address
  if (-not [Net.IPAddress]::IsLoopback($remote)) { return [string]$remote }
  $cf = ([string]$ctx.Request.Headers["CF-Connecting-IP"]).Trim()
  if ($cf) { return $cf }
  $forwarded = @(([string]$ctx.Request.Headers["X-Forwarded-For"]).Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($forwarded.Count -gt 0) { return $forwarded[-1] }
  return [string]$remote
}

# После $adminMaxFailures неверных паролей за $adminLockMinutes минут адрес блокируется на столько же
function Test-AdminAccess($ctx) {
  $script:adminBlocked = $false
  $password = ([string]$env:ADMIN_PASSWORD).Trim()
  if (-not $password) { return $true }
  $ip = Get-ClientAddress $ctx
  $now = [DateTime]::UtcNow
  $entry = $adminFailures[$ip]
  if ($entry -and $entry.blockedUntil -gt $now) {
    $script:adminBlocked = $true
    return $false
  }
  $sent = [string]$ctx.Request.Headers["X-Admin-Key"]
  try { $sent = [Uri]::UnescapeDataString($sent) } catch {}
  if (-not $sent) { return $false }
  if ($sent -ceq $password) {
    $adminFailures.Remove($ip)
    return $true
  }
  if (-not $entry -or $entry.first -lt $now.AddMinutes(-$adminLockMinutes)) {
    $entry = @{ count = 0; first = $now; blockedUntil = [DateTime]::MinValue }
    $adminFailures[$ip] = $entry
  }
  $entry.count++
  if ($entry.count -ge $adminMaxFailures) {
    $entry.blockedUntil = $now.AddMinutes($adminLockMinutes)
    Write-Host "Admin login blocked for $ip for $adminLockMinutes minutes after $($entry.count) wrong passwords"
  }
  return $false
}

function Write-AdminDenied($ctx) {
  if ($script:adminBlocked) {
    Write-Json $ctx 429 @{ ok = $false; error = "too_many_attempts" }
  } else {
    Write-Json $ctx 401 @{ ok = $false; error = "unauthorized" }
  }
}

function Normalize-Phone([string]$value) {
  $digits = $value -replace "\D", ""
  if ($digits.Length -eq 11 -and $digits.StartsWith("8")) { $digits = "7" + $digits.Substring(1) }
  if ($digits.Length -eq 10) { $digits = "7" + $digits }
  if ($digits.Length -lt 10 -or $digits.Length -gt 15) { return $null }
  return "+$digits"
}

function New-OrderItem($raw) {
  $qty = 1
  try { $qty = [int](Get-Val $raw "qty") } catch {}
  $qty = [Math]::Min(999, [Math]::Max(1, $qty))
  $price = 0.0
  try { $price = [double](Get-Val $raw "price") } catch {}
  if ([double]::IsNaN($price) -or $price -lt 0 -or $price -gt 1000000000) { $price = 0.0 }
  $currency = ([string](Get-Val $raw "currency")).ToLowerInvariant()
  if ($currency -notin @("kzt", "rub", "usd")) { $currency = "kzt" }
  $itemType = [string](Get-Val $raw "itemType")
  if ($itemType -ne "service") { $itemType = "product" }
  $name = Limit-Text (Get-Val $raw "name") 120
  if (-not $name) { $name = if ($itemType -eq "service") { "Услуга" } else { "Товар" } }
  return [ordered]@{
    productId = Limit-Text (Get-Val $raw "productId") 60
    name = $name
    itemType = $itemType
    qty = [int]$qty
    price = [double]$price
    currency = $currency
  }
}

# Название, тип и цена берутся из каталога: у покупателя может быть открыта старая страница, а цену можно подделать.
# Возвращает $true, если цена у покупателя отличалась от каталога
function Resolve-OrderItems($items) {
  $hasCatalog = $null -ne (Get-DbMeta $db "catalog_revision")
  $changed = $false
  foreach ($item in $items) {
    $product = Find-DbProduct $db ([string]$item["productId"])
    if ($null -eq $product) {
      if ($hasCatalog) { $item["unverified"] = $true }
      continue
    }
    $price = 0.0
    try { $price = [double](Get-Val $product "price") } catch {}
    if ([double]::IsNaN($price) -or $price -lt 0) { $price = 0.0 }
    $currency = ([string](Get-Val $product "currency")).ToLowerInvariant()
    if ($currency -notin @("kzt", "rub", "usd")) { $currency = "kzt" }
    if ([double]$item["price"] -ne $price -or [string]$item["currency"] -ne $currency) { $changed = $true }
    $name = Limit-Text (Get-Val $product "name") 120
    if ($name) { $item["name"] = $name }
    $item["itemType"] = $(if ([string](Get-Val $product "itemType") -eq "service") { "service" } else { "product" })
    $item["price"] = $price
    $item["currency"] = $currency
  }
  return $changed
}

function Create-Order($ctx) {
  if ($ctx.Request.ContentLength64 -gt 65536) {
    Write-Json $ctx 413 @{ ok = $false; error = "too_large" }
    return
  }
  try {
    $data = Get-RequestJson $ctx 5000
  } catch {
    $data = $null
  }
  if ($null -eq $data) {
    Write-Json $ctx 400 @{ ok = $false; error = "bad_request" }
    return
  }

  $name = Limit-Text (Get-Val $data "name") 80
  $phone = Normalize-Phone ([string](Get-Val $data "phone"))
  if (-not $name) {
    Write-Json $ctx 400 @{ ok = $false; error = "bad_name" }
    return
  }
  if (-not $phone) {
    Write-Json $ctx 400 @{ ok = $false; error = "bad_phone" }
    return
  }

  $items = New-Object System.Collections.Generic.List[object]
  $rawItems = Get-Val $data "items"
  if ($rawItems) {
    foreach ($raw in @($rawItems)) {
      if ($items.Count -ge 50) { break }
      if ($raw) { [void]$items.Add((New-OrderItem $raw)) }
    }
  }
  if ($items.Count -eq 0) {
    Write-Json $ctx 400 @{ ok = $false; error = "no_items" }
    return
  }

  $channel = "whatsapp"
  $source = [string](Get-Val $data "source")
  if ($source -ne "cart") { $source = "product" }
  $dueDate = [string](Get-Val $data "dueDate")
  if ($dueDate -notmatch '^\d{4}-\d{2}-\d{2}$') { $dueDate = "" }

  $clientId = Limit-Text (Get-Val $data "clientId") 80
  if ($clientId -notmatch '^[A-Za-z0-9_-]{8,80}$') { $clientId = "" }

  # Всё ниже — одна транзакция: заказ, списание остатка, номер и клиент сохраняются вместе или не сохраняются вовсе.
  # При раннем выходе Handle-Request откатывает её сам
  $db.Begin()
  if ($clientId) {
    $existing = $db.Row("SELECT id, number FROM orders WHERE client_id = @clientId", @{ clientId = $clientId })
    if ($null -ne $existing) {
      Write-Json $ctx 200 @{ ok = $true; id = [string]$existing["id"]; number = [int]$existing["number"]; duplicate = $true }
      return
    }
  }

  # strictPrice — покупатель ещё на странице и может поправить заказ. Без него это повтор из очереди:
  # покупатель уже ушёл в WhatsApp, и заказ нужно сохранить в любом случае
  $strict = [bool](Get-Val $data "strictPrice")
  if ((Resolve-OrderItems $items) -and $strict) {
    Write-Json $ctx 409 @{ ok = $false; error = "price_changed" }
    return
  }

  $stockShort = $false
  $stockHeld = $false
  $plan = Get-StockPlan $db $items
  if ($null -eq $plan) {
    if ($strict) {
      Write-Json $ctx 409 @{ ok = $false; error = "out_of_stock" }
      return
    }
    $stockShort = $true
  } else {
    $stockHeld = Use-CatalogStock $db $items $plan
    for ($i = 0; $i -lt $items.Count; $i++) { $items[$i]["stockTaken"] = $plan[$i] }
  }

  $number = Get-NextOrderNumber $db
  $order = [ordered]@{
    id = New-DbId "o"
    clientId = $clientId
    stockHeld = [bool]$stockHeld
    number = [int]$number
    createdAt = (Get-Date).ToString("o")
    status = "new"
    name = $name
    phone = $phone
    channel = $channel
    source = $source
    items = $items.ToArray()
    color = Limit-Text (Get-Val $data "color") 80
    dueDate = $dueDate
    comment = Limit-Text (Get-Val $data "comment") 500
    page = Limit-Text (Get-Val $data "page") 200
    lang = Limit-Text (Get-Val $data "lang") 5
  }
  if ($stockShort) { $order["stockShort"] = $true }
  Add-DbOrder $db $order
  Set-DbMeta $db "order_seq" $number
  # Сбой записи клиента не должен терять сам заказ: клиент пишется в точке сохранения и откатывается отдельно
  $db.Exec("SAVEPOINT client")
  try {
    Save-DbClientFromOrder $db $name $phone $channel $order.createdAt
    $db.Exec("RELEASE client")
  } catch {
    $db.Exec("ROLLBACK TO client; RELEASE client")
    Write-Host "Clients save error: $($_.Exception.Message)"
  }
  $db.Commit()
  Write-Json $ctx 200 @{ ok = $true; id = $order.id; number = $order.number }
}

function Handle-Orders($ctx, [string]$method, [string]$path) {
  if ($method -eq "POST" -and $path -eq "/api/orders") {
    Create-Order $ctx
    return
  }

  if (-not (Test-AdminAccess $ctx)) {
    Write-AdminDenied $ctx
    return
  }

  if ($method -eq "GET" -and $path -eq "/api/orders") {
    Write-JsonText $ctx ('{"ok":true,"orders":' + (Get-OrdersJson $db) + '}')
    return
  }

  $id = if ($path.StartsWith("/api/orders/")) { $path.Substring("/api/orders/".Length) } else { "" }
  if (-not $id) {
    Write-Json $ctx 404 @{ ok = $false; error = "not_found" }
    return
  }
  if ($method -ne "PATCH" -and $method -ne "DELETE") {
    Write-Json $ctx 405 @{ ok = $false; error = "method_not_allowed" }
    return
  }
  $data = $null
  if ($method -eq "PATCH") {
    try { $data = Get-RequestJson $ctx 5000 } catch { $data = $null }
  }

  $db.Begin()
  $order = Get-DbOrder $db $id
  if ($null -eq $order) {
    Write-Json $ctx 404 @{ ok = $false; error = "not_found" }
    return
  }
  $now = (Get-Date).ToString("o")

  if ($method -eq "PATCH") {
    if ($data -is [System.Collections.Generic.Dictionary[string, object]] -and $data.ContainsKey("note") -and -not $data.ContainsKey("status")) {
      $db.Execute("UPDATE orders SET note = @note, updated_at = @now WHERE id = @id", @{ note = (Limit-Text (Get-Val $data "note") 1000); now = $now; id = $id })
      $db.Commit()
      Write-Json $ctx 200 @{ ok = $true }
      return
    }
    $status = [string](Get-Val $data "status")
    if ($status -notin $orderStatuses) {
      Write-Json $ctx 400 @{ ok = $false; error = "bad_status" }
      return
    }
    $previous = [string]$order["status"]
    $cancelReason = $null
    if ($status -eq "cancel") {
      $cancelReason = Limit-Text (Get-Val $data "reason") 300
      if (-not $cancelReason) {
        Write-Json $ctx 400 @{ ok = $false; error = "bad_reason" }
        return
      }
      if ($previous -ne "cancel") { Restore-OrderStock $db $id }
    } elseif ($previous -eq "cancel") {
      if (-not (Use-OrderStock $db $id $order["items"])) {
        Write-Json $ctx 409 @{ ok = $false; error = "out_of_stock" }
        return
      }
    }
    $db.Execute("UPDATE orders SET status = @status, cancel_reason = @reason, updated_at = @now WHERE id = @id",
      @{ status = $status; reason = $cancelReason; now = $now; id = $id })
    $db.Commit()
    Write-Json $ctx 200 @{ ok = $true }
    return
  }

  if ([string]$order["status"] -ne "cancel") { Restore-OrderStock $db $id }
  $db.Execute("DELETE FROM orders WHERE id = @id", @{ id = $id })
  $db.Commit()
  Write-Json $ctx 200 @{ ok = $true }
}

function Handle-Clients($ctx, [string]$method, [string]$path) {
  if (-not (Test-AdminAccess $ctx)) {
    Write-AdminDenied $ctx
    return
  }

  if ($method -eq "GET" -and $path -eq "/api/clients") {
    Write-JsonText $ctx ('{"ok":true,"clients":' + (Get-ClientsJson $db) + '}')
    return
  }

  if ($method -eq "POST" -and $path -eq "/api/clients") {
    try { $data = Get-RequestJson $ctx 5000 } catch { $data = $null }
    $name = Limit-Text (Get-Val $data "name") 80
    $phone = Normalize-Phone ([string](Get-Val $data "phone"))
    if (-not $name) { Write-Json $ctx 400 @{ ok = $false; error = "bad_name" }; return }
    if (-not $phone) { Write-Json $ctx 400 @{ ok = $false; error = "bad_phone" }; return }
    $db.Begin()
    $existing = Find-DbClientByPhone $db $phone
    if ($null -ne $existing) {
      Write-Json $ctx 409 @{ ok = $false; error = "duplicate"; name = [string]$existing["name"] }
      return
    }
    $now = (Get-Date).ToString("o")
    $clientId = New-DbId "c"
    $db.Execute("INSERT INTO clients (id, name, phone, channel, source, note, created_at, last_seen_at) VALUES (@id, @name, @phone, '', 'manual', @note, @now, @now)",
      @{ id = $clientId; name = $name; phone = $phone; note = (Limit-Text (Get-Val $data "note") 300); now = $now })
    $db.Commit()
    Write-Json $ctx 200 @{ ok = $true; id = $clientId }
    return
  }

  $id = if ($path.StartsWith("/api/clients/")) { $path.Substring("/api/clients/".Length) } else { "" }
  if (-not $id) {
    Write-Json $ctx 404 @{ ok = $false; error = "not_found" }
    return
  }
  if ($method -ne "PATCH" -and $method -ne "DELETE") {
    Write-Json $ctx 405 @{ ok = $false; error = "method_not_allowed" }
    return
  }
  $data = $null
  if ($method -eq "PATCH") {
    try { $data = Get-RequestJson $ctx 5000 } catch { $data = $null }
  }

  $db.Begin()
  if ($null -eq $db.Scalar("SELECT 1 FROM clients WHERE id = @id", @{ id = $id })) {
    Write-Json $ctx 404 @{ ok = $false; error = "not_found" }
    return
  }

  if ($method -eq "DELETE") {
    $db.Execute("DELETE FROM clients WHERE id = @id", @{ id = $id })
    $db.Commit()
    Write-Json $ctx 200 @{ ok = $true }
    return
  }

  # Меняются только присланные поля: заметка из одной вкладки не откатывает имя, исправленное в другой
  if ($data -isnot [System.Collections.Generic.Dictionary[string, object]]) {
    Write-Json $ctx 400 @{ ok = $false; error = "bad_request" }
    return
  }
  $sets = New-Object System.Collections.Generic.List[string]
  $params = @{ id = $id; now = (Get-Date).ToString("o") }
  if ($data.ContainsKey("name")) {
    $params.name = Limit-Text (Get-Val $data "name") 80
    if (-not $params.name) { Write-Json $ctx 400 @{ ok = $false; error = "bad_name" }; return }
    $sets.Add("name = @name")
  }
  if ($data.ContainsKey("phone")) {
    $params.phone = Normalize-Phone ([string](Get-Val $data "phone"))
    if (-not $params.phone) { Write-Json $ctx 400 @{ ok = $false; error = "bad_phone" }; return }
    $existing = Find-DbClientByPhone $db $params.phone $id
    if ($null -ne $existing) {
      Write-Json $ctx 409 @{ ok = $false; error = "duplicate"; name = [string]$existing["name"] }
      return
    }
    $sets.Add("phone = @phone")
  }
  if ($data.ContainsKey("note")) {
    $params.note = Limit-Text (Get-Val $data "note") 300
    $sets.Add("note = @note")
  }
  $sets.Add("updated_at = @now")
  $db.Execute("UPDATE clients SET " + ($sets -join ", ") + " WHERE id = @id", $params)
  $db.Commit()
  Write-Json $ctx 200 @{ ok = $true }
}

function Find-ListIndex($list, [string]$key, [string]$value) {
  for ($i = 0; $i -lt $list.Count; $i++) {
    if ([string](Get-Val $list[$i] $key) -eq $value) { return $i }
  }
  return -1
}

function Update-StringSet($current, $change) {
  $set = New-Object System.Collections.Generic.List[string]
  foreach ($item in (ConvertTo-ObjectList $current)) {
    $value = ([string]$item).Trim()
    if ($value -and -not $set.Contains($value)) { $set.Add($value) }
  }
  foreach ($item in (ConvertTo-ObjectList (Get-Val $change "remove"))) { [void]$set.Remove(([string]$item).Trim()) }
  foreach ($item in (ConvertTo-ObjectList (Get-Val $change "add"))) {
    $value = ([string]$item).Trim()
    if ($value -and -not $set.Contains($value)) { $set.Add($value) }
  }
  return ,$set.ToArray()
}

# Админка присылает не весь каталог, а только свои изменения: что добавить, какие поля поменять, что удалить.
# Они накладываются на актуальный каталог, поэтому остатки, списанные заказами, и правки с другого устройства не затираются.
# Та же логика продублирована в applyCatalogPatch (src/lib/catalog.js) — менять их нужно вместе
# Лимиты защищают от ошибочной гигантской правки. При переполнении отбрасывается новое добавление,
# а не уже существующие позиции: иначе 5001-й товар молча стёр бы самый старый
$catalogProductLimit = 5000
$catalogCategoryLimit = 200

# Товар, добавленный после X, встаёт сразу за X (раньше добавленных туда же), как splice в applyCatalogPatch.
# Индекс по id вместо поиска по списку: импорт тысячи товаров не должен занимать минуты
function Merge-ProductPatch($products, $productPatch) {
  $removed = New-Object "System.Collections.Generic.HashSet[string]"
  foreach ($id in (ConvertTo-ObjectList (Get-Val $productPatch "remove"))) { [void]$removed.Add([string]$id) }
  $order = New-Object System.Collections.Generic.List[string]
  $byId = New-Object "System.Collections.Generic.Dictionary[string,object]"
  foreach ($product in (ConvertTo-ObjectList $products)) {
    $id = [string](Get-Val $product "id")
    if ($removed.Contains($id) -or $byId.ContainsKey($id)) { continue }
    $order.Add($id)
    $byId[$id] = $product
  }
  foreach ($update in (ConvertTo-ObjectList (Get-Val $productPatch "update"))) {
    $id = [string](Get-Val $update "id")
    if (-not $byId.ContainsKey($id)) { continue }
    $target = $byId[$id]
    $set = Get-Val $update "set"
    if ($set -is [System.Collections.IDictionary]) {
      foreach ($key in @($set.Keys)) {
        if ($key -ne "id") { $target[$key] = $set[$key] }
      }
    }
    foreach ($key in (ConvertTo-ObjectList (Get-Val $update "unset"))) {
      if ([string]$key -ne "id") { [void]$target.Remove([string]$key) }
    }
  }
  $children = New-Object "System.Collections.Generic.Dictionary[string,object]"
  $count = $order.Count
  foreach ($add in (ConvertTo-ObjectList (Get-Val $productPatch "add"))) {
    $product = Get-Val $add "product"
    if ($product -isnot [System.Collections.IDictionary]) { continue }
    $id = ([string](Get-Val $product "id")).Trim()
    if (-not $id) { continue }
    if ($byId.ContainsKey($id)) {
      $byId[$id] = $product
      continue
    }
    if ($count -ge $catalogProductLimit) {
      Write-Host "WARNING: catalog already has $catalogProductLimit products, new product $id was not added"
      continue
    }
    $after = [string](Get-Val $add "after")
    if (-not $after -or -not $byId.ContainsKey($after)) { $after = "" }
    if (-not $children.ContainsKey($after)) { $children[$after] = New-Object System.Collections.Generic.List[string] }
    $children[$after].Add($id)
    $byId[$id] = $product
    $count++
  }
  $result = New-Object System.Collections.Generic.List[object]
  $stack = New-Object "System.Collections.Generic.Stack[string]"
  foreach ($anchor in @("") + @($order)) {
    if ($anchor) { $result.Add($byId[$anchor]) }
    if ($children.ContainsKey($anchor)) { foreach ($child in $children[$anchor]) { $stack.Push($child) } }
    while ($stack.Count -gt 0) {
      $id = $stack.Pop()
      $result.Add($byId[$id])
      if ($children.ContainsKey($id)) { foreach ($child in $children[$id]) { $stack.Push($child) } }
    }
  }
  return ,$result
}

function Merge-CatalogPatch($catalog, $patch) {
  $products = Merge-ProductPatch (Get-Val $catalog "products") (Get-Val $patch "products")

  $categories = ConvertTo-ObjectList (Get-Val $catalog "categories")
  $categoryPatch = Get-Val $patch "categories"
  foreach ($code in (ConvertTo-ObjectList (Get-Val $categoryPatch "remove"))) {
    $index = Find-ListIndex $categories "code" ([string]$code)
    if ($index -ge 0) { $categories.RemoveAt($index) }
  }
  foreach ($category in (ConvertTo-ObjectList (Get-Val $categoryPatch "upsert"))) {
    if ($category -isnot [System.Collections.IDictionary]) { continue }
    $code = ([string](Get-Val $category "code")).Trim()
    if (-not $code) { continue }
    $index = Find-ListIndex $categories "code" $code
    if ($index -ge 0) { $categories[$index] = $category } elseif ($categories.Count -lt $catalogCategoryLimit) { [void]$categories.Add($category) }
  }

  $catalog["products"] = $products.ToArray()
  $catalog["categories"] = $categories.ToArray()
  $catalog["hiddenCategories"] = Update-StringSet (Get-Val $catalog "hiddenCategories") (Get-Val $patch "hiddenCategories")
  $catalog["removedSeeds"] = Update-StringSet (Get-Val $catalog "removedSeeds") (Get-Val $patch "removedSeeds")
}

function Write-CatalogResponse($ctx, [AllowNull()][string]$json) {
  if (-not $json) { $json = "null" }
  Write-JsonText $ctx ('{"ok":true,"catalog":' + $json + '}')
}

# id товаров, которые правка может изменить: остальные строки базы не переписываются
function Get-PatchTouchedIds($patch) {
  $touched = New-Object "System.Collections.Generic.HashSet[string]"
  $productPatch = Get-Val $patch "products"
  foreach ($update in (ConvertTo-ObjectList (Get-Val $productPatch "update"))) { [void]$touched.Add(([string](Get-Val $update "id")).Trim()) }
  foreach ($add in (ConvertTo-ObjectList (Get-Val $productPatch "add"))) { [void]$touched.Add(([string](Get-Val (Get-Val $add "product") "id")).Trim()) }
  return ,$touched
}

function Handle-Catalog($ctx, [string]$method) {
  if ($method -eq "GET") {
    Write-CatalogResponse $ctx (Get-CatalogJson $db)
    return
  }

  # Старая версия админки присылала каталог целиком и затирала чужие изменения — её нужно перезагрузить
  if ($method -eq "PUT") {
    Write-Json $ctx 409 @{ ok = $false; error = "outdated_client" }
    return
  }
  if ($method -ne "PATCH") {
    Write-Json $ctx 405 @{ ok = $false; error = "method_not_allowed" }
    return
  }
  if (-not (Test-AdminAccess $ctx)) {
    Write-AdminDenied $ctx
    return
  }
  if ($ctx.Request.ContentLength64 -gt 16777216) {
    Write-Json $ctx 413 @{ ok = $false; error = "too_large" }
    return
  }
  try { $data = Get-RequestJson $ctx 15000 } catch { $data = $null }
  $patch = Get-Val $data "patch"
  if ($patch -isnot [System.Collections.IDictionary]) {
    Write-Json $ctx 400 @{ ok = $false; error = "bad_request" }
    return
  }

  $db.Begin()
  $catalog = Get-CatalogDocument $db
  if ($null -eq $catalog) { $catalog = New-Object "System.Collections.Generic.Dictionary[string,object]" }
  $touched = $null
  if ($null -ne (Get-DbMeta $db "catalog_revision")) { $touched = Get-PatchTouchedIds $patch }
  Merge-CatalogPatch $catalog $patch
  [void](Save-CatalogMedia $db $catalog["products"])
  Save-CatalogDocument $db $catalog $touched
  $saved = Get-CatalogJson $db
  $db.Commit()
  Write-CatalogResponse $ctx $saved
}

$distDir = Join-Path $root "dist"
$distFull = [IO.Path]::GetFullPath($distDir).TrimEnd("\") + "\"
$imagesFull = [IO.Path]::GetFullPath((Join-Path $root "images")).TrimEnd("\") + "\"

$staticTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".gif"  = "image/gif"
  ".ico"  = "image/x-icon"
  ".woff2" = "font/woff2"
  ".map" = "application/json"
}

$legacyRoutes = @{
  "/index.html" = "/"
  "/products.html" = "/products"
  "/services.html" = "/services"
  "/admin.html" = "/admin"
}

function Write-NotFound($ctx) {
  $ctx.Response.StatusCode = 404
  $ctx.Response.Close()
}

function Test-PublicFile([string]$fileFull, [string]$baseFull) {
  $name = [IO.Path]::GetFileName($fileFull)
  $ext = [IO.Path]::GetExtension($fileFull).ToLowerInvariant()
  return (
    $fileFull.StartsWith($baseFull, [StringComparison]::OrdinalIgnoreCase) -and
    -not $name.StartsWith(".") -and
    $staticTypes.ContainsKey($ext) -and
    (Test-Path -LiteralPath $fileFull -PathType Leaf)
  )
}

function Serve-File($ctx, [string]$fileFull) {
  $ext = [IO.Path]::GetExtension($fileFull).ToLowerInvariant()
  Write-Bytes $ctx 200 $staticTypes[$ext] ([IO.File]::ReadAllBytes($fileFull))
}

function Serve-Static($ctx, [string]$path) {
  if ($legacyRoutes.ContainsKey($path)) {
    $ctx.Response.Redirect($legacyRoutes[$path])
    $ctx.Response.Close()
    return
  }

  $relative = $(if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }).Replace("/", [IO.Path]::DirectorySeparatorChar)
  $distFile = [IO.Path]::GetFullPath((Join-Path $distDir $relative))
  if ((Test-Path -LiteralPath $distDir -PathType Container) -and (Test-PublicFile $distFile $distFull)) {
    Serve-File $ctx $distFile
    return
  }

  if ($path -eq "/favicon.svg") {
    $icon = [IO.Path]::GetFullPath((Join-Path $root "favicon.svg"))
    if (Test-PublicFile $icon $rootFull) {
      Serve-File $ctx $icon
      return
    }
  }

  if ($path.StartsWith("/images/")) {
    $image = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (Test-PublicFile $image $imagesFull) {
      Serve-File $ctx $image
      return
    }
  }

  if ($path.StartsWith("/media/")) {
    $media = Get-DbMedia $db $path.Substring("/media/".Length)
    if ($null -ne $media) {
      # Имя фото — хеш содержимого, поэтому браузер может хранить его сколько угодно
      $ctx.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable"
      Write-Bytes $ctx 200 ([string]$media["content_type"]) ([byte[]]$media["data"])
      return
    }
  }

  $spa = Join-Path $distDir "index.html"
  $ext = [IO.Path]::GetExtension($path)
  if (-not $ext -and (Test-Path -LiteralPath $spa -PathType Leaf)) {
    Serve-File $ctx $spa
    return
  }

  Write-NotFound $ctx
}

# Чат ждёт ответа OpenAI до нескольких минут, поэтому он работает в отдельных потоках.
# Ядро — папка ai: load.ps1 подхватывает ai\skills\*.ps1 на каждом сообщении.
$aiDir = Join-Path $root "ai"
$chatState = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
foreach ($fn in "Write-Bytes", "Write-Json", "Get-Val", "Get-RequestJson") {
  $definition = (Get-Command $fn -CommandType Function).Definition
  $chatState.Commands.Add((New-Object System.Management.Automation.Runspaces.SessionStateFunctionEntry($fn, $definition)))
}
$chatPool = [runspacefactory]::CreateRunspacePool(1, 4, $chatState, $Host)
$chatPool.Open()
$chatJobs = New-Object System.Collections.Generic.List[object]

function Start-ChatRequest($ctx) {
  $ps = [powershell]::Create()
  $ps.RunspacePool = $chatPool
  [void]$ps.AddScript({
    param($c, $dir)
    try {
      . (Join-Path $dir "load.ps1")
      Handle-Chat $c
    } catch {
      try { Write-Json $c 500 @{ error = "server_error"; reply = $null } } catch {}
    }
  }).AddArgument($ctx).AddArgument($aiDir)
  $chatJobs.Add(@{ ps = $ps; handle = $ps.BeginInvoke() })
}

function Clear-FinishedChats {
  for ($i = $chatJobs.Count - 1; $i -ge 0; $i--) {
    $job = $chatJobs[$i]
    if (-not $job.handle.IsCompleted) { continue }
    try { [void]$job.ps.EndInvoke($job.handle) } catch {}
    $job.ps.Dispose()
    $chatJobs.RemoveAt($i)
  }
}

function Handle-Request($ctx) {
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
  $method = $ctx.Request.HttpMethod.ToUpperInvariant()

  if ($method -eq "POST" -and $path -eq "/api/chat") {
    Start-ChatRequest $ctx
    return
  }

  if ($path -eq "/api/orders" -or $path.StartsWith("/api/orders/")) {
    try {
      Handle-Orders $ctx $method $path
    } catch {
      Write-Host "Orders API error: $($_.Exception.Message)"
      try { Write-Json $ctx 500 @{ ok = $false; error = "server_error" } } catch {}
    }
    return
  }

  if ($path -eq "/api/catalog") {
    try {
      Handle-Catalog $ctx $method
    } catch {
      Write-Host "Catalog API error: $($_.Exception.Message)"
      try { Write-Json $ctx 500 @{ ok = $false; error = "server_error" } } catch {}
    }
    return
  }

  if ($path -eq "/api/clients" -or $path.StartsWith("/api/clients/")) {
    try {
      Handle-Clients $ctx $method $path
    } catch {
      Write-Host "Clients API error: $($_.Exception.Message)"
      try { Write-Json $ctx 500 @{ ok = $false; error = "server_error" } } catch {}
    }
    return
  }

  Serve-Static $ctx $path
}

Load-DotEnv $envFile
$port = 0
if (-not [int]::TryParse(([string]$env:SITE_PORT).Trim(), [ref]$port) -or $port -le 0) { $port = 8765 }
$prefix = "http://127.0.0.1:$port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
  # Посетитель с оборванной загрузкой иначе держит весь сервер, пока не отключится
  $listener.TimeoutManager.EntityBody = [TimeSpan]::FromSeconds(10)
  $listener.TimeoutManager.HeaderWait = [TimeSpan]::FromSeconds(10)
  $listener.TimeoutManager.IdleConnection = [TimeSpan]::FromSeconds(60)
  # Ответы отдаются в фоне, но совсем застрявшее соединение (меньше 1 КБ/с) нужно обрывать, чтобы не копить память
  $listener.TimeoutManager.MinSendBytesPerSecond = 1024
} catch {
  Write-Host "WARNING: could not set request timeouts: $($_.Exception.Message)"
}
try {
  $listener.Start()
} catch {
  Write-Host "ERROR: could not start server at $prefix ($($_.Exception.Message)). Is another serve.ps1 already running?"
  exit 1
}

# Без базы сайт не может принимать заказы — лучше не запуститься, чем молча терять данные
try {
  if (-not (Test-Path -LiteralPath $dataDir -PathType Container)) { [void](New-Item -ItemType Directory -Path $dataDir) }
  $sqliteVersion = Initialize-GulzatSqlite
  $db = Open-GulzatDb $dbFile
  $dbCheck = Test-GulzatDb $db
  if ($dbCheck -ne "ok") {
    Write-Host "WARNING: database $dbFile is damaged ($dbCheck). Stop the server and restore the latest copy from $backupDir"
  }
  Initialize-GulzatSchema $db
  Import-LegacyJsonData $db $dataDir
} catch {
  Write-Host "ERROR: database $dbFile is not available: $($_.Exception.Message)"
  $listener.Stop()
  exit 1
}

function Invoke-DailyMaintenance {
  $script:maintenanceDay = (Get-Date).Date
  try {
    $db.Begin()
    $removed = Remove-UnusedMedia $db
    $db.Commit()
    if ($removed -gt 0) { Write-Host "Removed $removed photos no product has used for 30 days" }
  } catch {
    $db.Rollback()
    Write-Host "WARNING: unused photos were not cleaned up: $($_.Exception.Message)"
  }
  try {
    $backup = Backup-GulzatDb $db $backupDir
    if ($backup) { Write-Host "Database backup saved to $backup" }
  } catch {
    Write-Host "WARNING: database backup failed: $($_.Exception.Message)"
  }
}

# Журнал переносится в основной файл в паузах между запросами, если с прошлого раза были записи (не чаще раза в 2 с)
$walChanges = [long]-1
$walCheckAt = [DateTime]::MinValue
function Invoke-WalSync {
  $now = [DateTime]::UtcNow
  if ($now -lt $script:walCheckAt) { return }
  $script:walCheckAt = $now.AddSeconds(2)
  try {
    $changes = [long]$db.Scalar("SELECT total_changes()", $null)
    if ($changes -eq $script:walChanges) { return }
    if (Sync-GulzatWal $db) { $script:walChanges = $changes }
  } catch {
    Write-Host "WARNING: database journal was not merged: $($_.Exception.Message)"
  }
}
Invoke-DailyMaintenance

$keyState = if (([string]$env:OPENAI_API_KEY).Trim()) { "API key loaded" } else { "API key empty - set OPENAI_API_KEY in .env" }
$adminState = if (([string]$env:ADMIN_PASSWORD).Trim()) { "admin password set" } else { "WARNING: ADMIN_PASSWORD empty - orders are open to anyone" }
$frontState = if (Test-Path -LiteralPath (Join-Path $distDir "index.html")) { "React build" } else { "WARNING: dist/index.html missing - run npm run build" }
Write-Host "Serving $root at $prefix ($keyState; $adminState; $frontState; SQLite $sqliteVersion)"

# Ожидание нового запроса прерывается каждые 200 мс, чтобы закрывать досланные ответы и завершённые чаты
$contextTask = $null
while ($listener.IsListening) {
  try {
    if ($null -eq $contextTask) { $contextTask = $listener.GetContextAsync() }
    if (-not $contextTask.Wait(200)) {
      Complete-PendingWrites
      Clear-FinishedChats
      Invoke-WalSync
      continue
    }
    $ctx = $contextTask.Result
    $contextTask = $null
  } catch {
    $contextTask = $null
    if (-not $listener.IsListening) { break }
    Write-Host "Accept error: $($_.Exception.Message)"
    continue
  }
  Complete-PendingWrites
  Clear-FinishedChats
  try {
    Handle-Request $ctx
  } catch {
    Write-Host "Request error: $($_.Exception.Message)"
    try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch {}
  } finally {
    # Обработчик вышел, не зафиксировав транзакцию (ошибка или отказ) — ничего из неё не сохраняется
    if ($db.InTransaction) { $db.Rollback() }
  }
  # Проверяется после каждого запроса, а не только в тишине: при постоянном потоке посетителей копия тоже нужна
  if ((Get-Date).Date -ne $maintenanceDay) { Invoke-DailyMaintenance }
}
