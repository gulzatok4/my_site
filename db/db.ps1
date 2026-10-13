# Все данные сайта — каталог, фото, заказы, клиенты — хранятся в SQLite: data\gulzat.db.
# Подключается из serve.ps1 (единственный, кто пишет) и из потоков чата (только чтение).
# Библиотека SQLite лежит в db\native, консоль для ручного просмотра базы — db\tools\sqlite3.exe.
# Файлы .ps1 сохранять в UTF-8 с BOM: без него Windows PowerShell портит кириллицу.
$script:DbRoot = $PSScriptRoot
$script:DbSchemaVersion = 2
$script:ProductFields = @("id", "itemType", "category", "name", "price", "currency", "stock", "description", "image", "link")
$script:MediaExtensions = @{ "image/jpeg" = ".jpg"; "image/png" = ".png"; "image/webp" = ".webp"; "image/gif" = ".gif" }
$script:MediaTypes = @{ ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"; ".webp" = "image/webp"; ".gif" = "image/gif" }

function Initialize-GulzatSqlite {
  if (-not ("Gulzat.Data.SqliteDb" -as [type])) {
    $source = [IO.File]::ReadAllText((Join-Path $script:DbRoot "sqlite.cs"), [Text.Encoding]::UTF8)
    Add-Type -TypeDefinition $source -Language CSharp
  }
  return [Gulzat.Data.SqliteDb]::Load((Join-Path $script:DbRoot "native"))
}

# WAL: чат читает каталог, пока сервер записывает заказ, и никто никого не ждёт.
# synchronous=FULL: заказ, на который покупатель получил «принято», переживает и выключение света
function Open-GulzatDb([string]$path, [switch]$ReadOnly) {
  $db = New-Object Gulzat.Data.SqliteDb($path)
  try {
    $db.Exec("PRAGMA foreign_keys = ON;")
    if ($ReadOnly) {
      $db.Exec("PRAGMA query_only = ON;")
    } else {
      $db.Exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;")
    }
  } catch {
    $db.Dispose()
    throw
  }
  return $db
}

$script:GulzatSchema = @'
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  category TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'kzt',
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  extra TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS categories (
  code TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  item_type TEXT NOT NULL DEFAULT 'product'
);

CREATE TABLE IF NOT EXISTS hidden_categories (
  code TEXT PRIMARY KEY,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS removed_seeds (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  name TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  unused_since TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  client_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'work', 'done', 'cancel')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT,
  stock_held INTEGER NOT NULL DEFAULT 0,
  stock_short INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_id ON orders (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_phone ON orders (phone);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  item_type TEXT NOT NULL DEFAULT 'product',
  qty INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'kzt',
  unverified INTEGER NOT NULL DEFAULT 0,
  stock_taken INTEGER NOT NULL DEFAULT 0 CHECK (stock_taken >= 0),
  PRIMARY KEY (order_id, position)
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  updated_at TEXT
);
'@

function Initialize-GulzatSchema($db) {
  $db.Begin()
  try {
    $version = Get-DbMetaIfExists $db "schema_version"
    if ($null -ne $version -and [int]$version -gt $script:DbSchemaVersion) {
      throw "data\gulzat.db was created by a newer version of the site (schema $version)"
    }
    $db.Exec($script:GulzatSchema)
    # Версия 2: позиция заказа помнит, сколько остатка под неё списано, — отмена возвращает ровно это
    $hasTaken = [long]$db.Scalar("SELECT COUNT(*) FROM pragma_table_info('order_items') WHERE name = 'stock_taken'", $null)
    if ($hasTaken -eq 0) {
      $db.Exec("ALTER TABLE order_items ADD COLUMN stock_taken INTEGER NOT NULL DEFAULT 0 CHECK (stock_taken >= 0)")
      Set-LegacyStockTaken $db
    }
    $hasUnused = [long]$db.Scalar("SELECT COUNT(*) FROM pragma_table_info('media') WHERE name = 'unused_since'", $null)
    if ($hasUnused -eq 0) { $db.Exec("ALTER TABLE media ADD COLUMN unused_since TEXT") }
    Set-DbMeta $db "schema_version" $script:DbSchemaVersion
    $db.Commit()
  } catch {
    $db.Rollback()
    throw
  }
}

function Get-DbMetaIfExists($db, [string]$key) {
  if ($null -eq $db.Scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'", $null)) { return $null }
  return (Get-DbMeta $db $key)
}

# Заказы, сохранённые до версии 2, не помнят, сколько списано. Считаем, как считал прежний код:
# у заказа со списанием — всё количество по товарам, у которых ведётся остаток
function Set-LegacyStockTaken($db) {
  $db.Execute(@'
UPDATE order_items SET stock_taken = qty
WHERE item_type <> 'service'
  AND order_id IN (SELECT id FROM orders WHERE stock_held = 1 AND status <> 'cancel')
  AND product_id IN (SELECT id FROM products WHERE stock IS NOT NULL AND item_type <> 'service')
'@, $null)
}

function Get-DbMeta($db, [string]$key) {
  return $db.Scalar("SELECT value FROM meta WHERE key = @key", @{ key = $key })
}

function Set-DbMeta($db, [string]$key, $value) {
  $db.Execute("INSERT INTO meta (key, value) VALUES (@key, @value) ON CONFLICT (key) DO UPDATE SET value = excluded.value", @{ key = $key; value = [string]$value })
}

$script:SellerTextFields = @("name", "bin", "address", "bank", "iik", "bik", "kbe", "knp", "phone", "email", "signatory", "note")

function Limit-SellerText($value) {
  if ($null -eq $value) { return "" }
  $text = ([string]$value).Trim()
  if ($text.Length -gt 300) { $text = $text.Substring(0, 300) }
  return $text
}

function New-EmptySellerProfile {
  $profile = [ordered]@{
    name = ""; bin = ""; address = ""; bank = ""; iik = ""; bik = ""; kbe = ""; knp = ""
    phone = ""; email = ""; signatory = ""; vatPayer = $false; vatRate = $null; note = ""
  }
  return $profile
}

function ConvertTo-SellerProfile($raw) {
  $profile = New-EmptySellerProfile
  foreach ($key in $script:SellerTextFields) {
    $profile[$key] = Limit-SellerText (Get-DbValue $raw $key)
  }
  $vat = Get-DbValue $raw "vatPayer"
  $profile["vatPayer"] = ($vat -eq $true -or "$vat" -eq "true")
  $rateRaw = Get-DbValue $raw "vatRate"
  $rateText = ""
  if ($null -ne $rateRaw) { $rateText = ([string]$rateRaw).Trim().Replace(",", ".") }
  $rate = 0.0
  $parsed = $false
  if ($rateText) {
    $parsed = [double]::TryParse($rateText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$rate)
  }
  if ($parsed -and -not [double]::IsNaN($rate) -and -not [double]::IsInfinity($rate)) {
    $profile["vatRate"] = [math]::Round($rate, 4)
  }
  return $profile
}

function Get-SellerProfile($db) {
  $raw = Get-DbMeta $db "seller_profile"
  if ($null -eq $raw -or -not ([string]$raw).Trim()) { return (New-EmptySellerProfile) }
  try {
    return (ConvertTo-SellerProfile ($raw | ConvertFrom-Json))
  } catch {
    return (New-EmptySellerProfile)
  }
}

function Save-SellerProfile($db, $raw) {
  $profile = ConvertTo-SellerProfile $raw
  Set-DbMeta $db "seller_profile" ($profile | ConvertTo-Json -Compress -Depth 4)
  return $profile
}

function New-DbJsonSerializer {
  Add-Type -AssemblyName System.Web.Extensions
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 67108864
  $ser.RecursionLimit = 64
  return $ser
}

function Get-DbValue($obj, [string]$key) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    try { return $obj[$key] } catch { return $null }
  }
  $prop = $obj.PSObject.Properties[$key]
  if ($prop) { return $prop.Value }
  return $null
}

function ConvertTo-ObjectList($value) {
  $list = New-Object System.Collections.Generic.List[object]
  if ($null -eq $value) { return ,$list }
  if ($value -is [string] -or $value -is [System.Collections.IDictionary]) {
    [void]$list.Add($value)
    return ,$list
  }
  foreach ($item in $value) {
    if ($null -ne $item) { [void]$list.Add($item) }
  }
  return ,$list
}

function New-DbId([string]$prefix) {
  return $prefix + [DateTime]::UtcNow.Ticks.ToString() + (Get-Random -Minimum 100 -Maximum 999)
}

function ConvertTo-DbFlag($value) {
  if ($null -eq $value) { return 0 }
  if ($value -is [bool]) { return [int]$value }
  $text = ([string]$value).Trim().ToLowerInvariant()
  if ($text -eq "true" -or $text -eq "1") { return 1 }
  return 0
}

# --- Каталог ---------------------------------------------------------------------------------------
# Известные поля товара лежат в своих столбцах, всё остальное, что присылает админка, — в extra (JSON),
# чтобы новое поле в админке не пропадало при сохранении

function ConvertTo-DbProductParams($product, [int]$position) {
  $extra = New-Object "System.Collections.Generic.Dictionary[string,object]"
  foreach ($key in @($product.Keys)) {
    if ($script:ProductFields -notcontains [string]$key) { $extra[[string]$key] = $product[$key] }
  }
  $price = 0.0
  try { $price = [double](Get-DbValue $product "price") } catch {}
  if ([double]::IsNaN($price) -or [double]::IsInfinity($price) -or $price -lt 0) { $price = 0.0 }
  $stock = $null
  $rawStock = Get-DbValue $product "stock"
  if ($null -ne $rawStock -and ([string]$rawStock).Trim() -ne "") {
    $parsed = 0.0
    if ([double]::TryParse([string]$rawStock, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
      $stock = [long][Math]::Max(0, [Math]::Floor($parsed))
    }
  }
  $currency = ([string](Get-DbValue $product "currency")).Trim().ToLowerInvariant()
  if (-not $currency) { $currency = "kzt" }
  return @{
    id = ([string](Get-DbValue $product "id")).Trim()
    position = $position
    item_type = $(if ([string](Get-DbValue $product "itemType") -eq "service") { "service" } else { "product" })
    category = [string](Get-DbValue $product "category")
    name = [string](Get-DbValue $product "name")
    price = $price
    currency = $currency
    stock = $stock
    description = [string](Get-DbValue $product "description")
    image = [string](Get-DbValue $product "image")
    link = [string](Get-DbValue $product "link")
    extra = (New-DbJsonSerializer).Serialize($extra)
  }
}

function ConvertFrom-DbProductRow($row, [switch]$NoImage) {
  $product = New-Object "System.Collections.Generic.Dictionary[string,object]"
  $product["id"] = [string]$row["id"]
  $product["itemType"] = [string]$row["item_type"]
  $product["category"] = [string]$row["category"]
  $product["name"] = [string]$row["name"]
  $product["price"] = [double]$row["price"]
  $product["currency"] = [string]$row["currency"]
  $product["stock"] = $(if ($null -eq $row["stock"]) { $null } else { [long]$row["stock"] })
  $product["description"] = [string]$row["description"]
  $product["image"] = $(if ($NoImage) { "" } else { [string]$row["image"] })
  $product["link"] = [string]$row["link"]
  $extraText = [string]$row["extra"]
  if ($extraText -and $extraText -ne "{}") {
    try {
      $extra = (New-DbJsonSerializer).DeserializeObject($extraText)
      if ($extra -is [System.Collections.IDictionary]) {
        foreach ($key in @($extra.Keys)) {
          if (-not $product.ContainsKey([string]$key)) { $product[[string]$key] = $extra[$key] }
        }
      }
    } catch {}
  }
  return $product
}

# JSON каталога целиком собирает сама SQLite одним запросом: это быстро даже на тысяче товаров
# и даёт целостный снимок — чат не увидит товары из одной версии каталога, а категории из другой.
# Поля extra дописываются в конец объекта товара (ключи не пересекаются с известными столбцами)
$script:CatalogJsonSql = @'
WITH p AS (
  SELECT position, rowid AS rid, extra,
    json_object(
      'id', id, 'itemType', item_type, 'category', category, 'name', name,
      'price', CASE WHEN price = CAST(price AS INTEGER) THEN CAST(price AS INTEGER) ELSE price END,
      'currency', currency, 'stock', stock, 'description', description,
      'image', CASE WHEN @no_images THEN '' ELSE image END, 'link', link
    ) AS base
  FROM products
)
SELECT json_object(
  'products', json((SELECT json_group_array(json(
      CASE WHEN extra <> '{}' AND json_valid(extra) AND json_type(extra) = 'object'
        THEN substr(base, 1, length(base) - 1) || ',' || substr(extra, 2) ELSE base END
    ) ORDER BY position, rid) FROM p)),
  'categories', json((SELECT json_group_array(json_object('code', code, 'label', label, 'itemType', item_type) ORDER BY position, rowid) FROM categories)),
  'hiddenCategories', json((SELECT json_group_array(code ORDER BY position, rowid) FROM hidden_categories)),
  'removedSeeds', json((SELECT json_group_array(id ORDER BY position, rowid) FROM removed_seeds)),
  'revision', (SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'catalog_revision'),
  'updatedAt', (SELECT COALESCE(value, '') FROM meta WHERE key = 'catalog_updated_at')
)
WHERE EXISTS (SELECT 1 FROM meta WHERE key = 'catalog_revision')
'@

# $null — каталог ещё ни разу не сохраняли (сайт покажет встроенный)
function Get-CatalogJson($db, [switch]$NoImages) {
  $json = $db.Scalar($script:CatalogJsonSql, @{ no_images = [bool]$NoImages })
  if ($null -eq $json) { return $null }
  return [string]$json
}

function Get-CatalogDocument($db, [switch]$NoImages) {
  $json = Get-CatalogJson $db -NoImages:$NoImages
  if ($null -eq $json) { return $null }
  return (New-DbJsonSerializer).DeserializeObject($json)
}

# revision растёт при каждой записи каталога, включая списание остатков:
# браузер по нему отбрасывает ответы, пришедшие не по порядку
function Step-CatalogRevision($db) {
  $db.Execute("INSERT INTO meta (key, value) VALUES ('catalog_revision', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1", $null)
  Set-DbMeta $db "catalog_updated_at" (Get-Date).ToString("o")
}

# Записывает каталог. $touched — id товаров, которые правка могла изменить: переписываются только они,
# поэтому правка одного поля не гоняет через базу всю тысячу товаров. $null — переписать все.
# Вызывать внутри транзакции
function Save-CatalogDocument($db, $catalog, $touched = $null) {
  $ids = New-Object System.Collections.Generic.List[string]
  $seen = New-Object "System.Collections.Generic.HashSet[string]"
  $changed = New-Object System.Collections.Generic.List[object]
  foreach ($product in (ConvertTo-ObjectList (Get-DbValue $catalog "products"))) {
    if ($product -isnot [System.Collections.IDictionary]) { continue }
    $id = ([string](Get-DbValue $product "id")).Trim()
    if (-not $id -or -not $seen.Add($id)) { continue }
    $ids.Add($id)
    if ($null -eq $touched -or $touched.Contains($id)) { $changed.Add(@{ product = $product; position = $ids.Count - 1 }) }
  }
  $idsJson = (New-DbJsonSerializer).Serialize($ids.ToArray())
  $db.Execute("DELETE FROM products WHERE id NOT IN (SELECT value FROM json_each(@ids))", @{ ids = $idsJson })
  foreach ($entry in $changed) {
    $db.Execute(@'
INSERT INTO products (id, position, item_type, category, name, price, currency, stock, description, image, link, extra)
VALUES (@id, @position, @item_type, @category, @name, @price, @currency, @stock, @description, @image, @link, @extra)
ON CONFLICT (id) DO UPDATE SET
  position = excluded.position, item_type = excluded.item_type, category = excluded.category, name = excluded.name,
  price = excluded.price, currency = excluded.currency, stock = excluded.stock, description = excluded.description,
  image = excluded.image, link = excluded.link, extra = excluded.extra
'@, (ConvertTo-DbProductParams $entry.product $entry.position))
  }
  # Порядок пересчитывается, только если он поменялся: товар добавили, удалили или переставили
  $order = [string]$db.Scalar("SELECT json_group_array(id ORDER BY position, rowid) FROM products", $null)
  if ($order -ne $idsJson) {
    $db.Execute("UPDATE products SET position = m.key FROM (SELECT key, value FROM json_each(@ids)) AS m WHERE m.value = products.id", @{ ids = $idsJson })
  }

  $db.Execute("DELETE FROM categories", $null)
  $position = 0
  foreach ($category in (ConvertTo-ObjectList (Get-DbValue $catalog "categories"))) {
    if ($category -isnot [System.Collections.IDictionary]) { continue }
    $code = ([string](Get-DbValue $category "code")).Trim()
    if (-not $code) { continue }
    $itemType = $(if ([string](Get-DbValue $category "itemType") -eq "service") { "service" } else { "product" })
    $db.Execute("INSERT INTO categories (code, position, label, item_type) VALUES (@code, @position, @label, @item_type) ON CONFLICT (code) DO NOTHING",
      @{ code = $code; position = $position; label = [string](Get-DbValue $category "label"); item_type = $itemType })
    $position++
  }

  foreach ($set in @(@{ table = "hidden_categories"; column = "code"; key = "hiddenCategories" }, @{ table = "removed_seeds"; column = "id"; key = "removedSeeds" })) {
    $db.Execute("DELETE FROM $($set.table)", $null)
    $position = 0
    foreach ($value in (ConvertTo-ObjectList (Get-DbValue $catalog $set.key))) {
      $text = ([string]$value).Trim()
      if (-not $text) { continue }
      $db.Execute("INSERT INTO $($set.table) ($($set.column), position) VALUES (@value, @position) ON CONFLICT DO NOTHING", @{ value = $text; position = $position })
      $position++
    }
  }
  Step-CatalogRevision $db
}

function Find-DbProduct($db, [string]$id) {
  if (-not $id) { return $null }
  $row = $db.Row("SELECT * FROM products WHERE id = @id", @{ id = $id })
  if ($null -eq $row) { return $null }
  return (ConvertFrom-DbProductRow $row -NoImage)
}

# --- Остатки -----------------------------------------------------------------------------------------
# Каждая позиция заказа помнит, сколько остатка под неё списано (order_items.stock_taken).
# Отмена и удаление возвращают ровно это, даже если учёт остатка у товара с тех пор включили или выключили.
# Все функции вызывать внутри транзакции

# Сколько списать под каждую позицию: услуги и товары без учёта остатка не списываются.
# $null — какого-то товара не хватает (одинаковые товары в заказе складываются)
function Get-StockPlan($db, $items) {
  $list = ConvertTo-ObjectList $items
  $plan = New-Object "int[]" $list.Count
  $stock = New-Object "System.Collections.Generic.Dictionary[string,long]"
  $need = New-Object "System.Collections.Generic.Dictionary[string,long]"
  for ($i = 0; $i -lt $list.Count; $i++) {
    $id = ([string](Get-DbValue $list[$i] "productId")).Trim()
    if (-not $id) { continue }
    if (-not $stock.ContainsKey($id)) {
      $row = $db.Row("SELECT item_type, stock FROM products WHERE id = @id", @{ id = $id })
      $stock[$id] = $(if ($null -eq $row -or [string]$row["item_type"] -eq "service" -or $null -eq $row["stock"]) { -1 } else { [long]$row["stock"] })
    }
    if ($stock[$id] -lt 0) { continue }
    $qty = 1
    try { $qty = [int](Get-DbValue $list[$i] "qty") } catch {}
    if ($qty -lt 1) { $qty = 1 }
    $plan[$i] = $qty
    if ($need.ContainsKey($id)) { $need[$id] += $qty } else { $need[$id] = [long]$qty }
  }
  foreach ($id in @($need.Keys)) {
    if ($need[$id] -gt $stock[$id]) { return $null }
  }
  return ,$plan
}

# Списывает остаток по плану из Get-StockPlan. $true — что-то списано
function Use-CatalogStock($db, $items, $plan) {
  $list = ConvertTo-ObjectList $items
  $used = $false
  for ($i = 0; $i -lt $list.Count; $i++) {
    if ($plan[$i] -le 0) { continue }
    $db.Execute("UPDATE products SET stock = stock - @qty WHERE id = @id AND stock IS NOT NULL",
      @{ qty = $plan[$i]; id = ([string](Get-DbValue $list[$i] "productId")).Trim() })
    if ($db.Changes -gt 0) { $used = $true }
  }
  if ($used) { Step-CatalogRevision $db }
  return $used
}

# Возвращает на склад всё, что списано под заказ
function Restore-OrderStock($db, [string]$orderId) {
  $restored = $false
  foreach ($row in $db.Query("SELECT product_id, stock_taken FROM order_items WHERE order_id = @id AND stock_taken > 0", @{ id = $orderId })) {
    $db.Execute("UPDATE products SET stock = stock + @qty WHERE id = @id AND stock IS NOT NULL AND item_type <> 'service'",
      @{ qty = [long]$row["stock_taken"]; id = [string]$row["product_id"] })
    if ($db.Changes -gt 0) { $restored = $true }
  }
  $db.Execute("UPDATE order_items SET stock_taken = 0 WHERE order_id = @id", @{ id = $orderId })
  $db.Execute("UPDATE orders SET stock_held = 0 WHERE id = @id", @{ id = $orderId })
  if ($restored) { Step-CatalogRevision $db }
}

# Снова списывает остаток под заказ (заказ вернули из отмены). $false — не хватает, ничего не менялось
function Use-OrderStock($db, [string]$orderId, $items) {
  $plan = Get-StockPlan $db $items
  if ($null -eq $plan) { return $false }
  $held = Use-CatalogStock $db $items $plan
  for ($i = 0; $i -lt $plan.Length; $i++) {
    $db.Execute("UPDATE order_items SET stock_taken = @qty WHERE order_id = @id AND position = @position", @{ qty = $plan[$i]; id = $orderId; position = $i })
  }
  $db.Execute("UPDATE orders SET stock_held = @held WHERE id = @id", @{ held = $held; id = $orderId })
  return $true
}

# --- Фото --------------------------------------------------------------------------------------------
# Фото из админки приходят data:-ссылкой. Оно кладётся в таблицу media, в каталоге остаётся короткий адрес /media/…:
# иначе каталог весит мегабайты, и каждый посетитель скачивает его целиком при каждом заходе.
# Имя — хеш содержимого, поэтому одно и то же фото хранится один раз, а браузер может кешировать его навсегда

function Save-DbMedia($db, [byte[]]$bytes, [string]$contentType, [string]$name = "") {
  if (-not $name) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = -join (($sha.ComputeHash($bytes))[0..15] | ForEach-Object { $_.ToString("x2") }) } finally { $sha.Dispose() }
    $name = $hash + $script:MediaExtensions[$contentType]
  }
  $db.Execute("INSERT INTO media (name, content_type, data, created_at) VALUES (@name, @type, @data, @now) ON CONFLICT (name) DO NOTHING",
    @{ name = $name; type = $contentType; data = $bytes; now = (Get-Date).ToString("o") })
  return "/media/$name"
}

function Save-DbMediaFromDataUrl($db, [string]$dataUrl) {
  $match = [regex]::Match($dataUrl, '^data:(image/(?:jpeg|png|webp|gif));base64,')
  if (-not $match.Success) { return $dataUrl }
  try { $bytes = [Convert]::FromBase64String($dataUrl.Substring($match.Length)) } catch { return $dataUrl }
  return (Save-DbMedia $db $bytes $match.Groups[1].Value)
}

function Save-CatalogMedia($db, $products) {
  $moved = 0
  foreach ($product in (ConvertTo-ObjectList $products)) {
    if ($product -isnot [System.Collections.IDictionary]) { continue }
    $image = [string](Get-DbValue $product "image")
    if (-not $image.StartsWith("data:image/")) { continue }
    $url = Save-DbMediaFromDataUrl $db $image
    if ($url -ne $image) {
      $product["image"] = $url
      $moved++
    }
  }
  return $moved
}

function Get-DbMedia($db, [string]$name) {
  return $db.Row("SELECT content_type, data FROM media WHERE name = @name", @{ name = $name })
}

# --- Заказы ------------------------------------------------------------------------------------------

function Add-DbOrder($db, $order) {
  $clientId = ([string](Get-DbValue $order "clientId")).Trim()
  $db.Execute(@'
INSERT INTO orders (id, number, client_id, created_at, updated_at, status, name, phone, channel, source,
  color, due_date, comment, page, lang, note, cancel_reason, stock_held, stock_short)
VALUES (@id, @number, @client_id, @created_at, @updated_at, @status, @name, @phone, @channel, @source,
  @color, @due_date, @comment, @page, @lang, @note, @cancel_reason, @stock_held, @stock_short)
'@, @{
    id = [string](Get-DbValue $order "id")
    number = [long](Get-DbValue $order "number")
    client_id = $(if ($clientId) { $clientId } else { $null })
    created_at = [string](Get-DbValue $order "createdAt")
    updated_at = $(if (Get-DbValue $order "updatedAt") { [string](Get-DbValue $order "updatedAt") } else { $null })
    status = [string](Get-DbValue $order "status")
    name = [string](Get-DbValue $order "name")
    phone = [string](Get-DbValue $order "phone")
    channel = [string](Get-DbValue $order "channel")
    source = [string](Get-DbValue $order "source")
    color = [string](Get-DbValue $order "color")
    due_date = [string](Get-DbValue $order "dueDate")
    comment = [string](Get-DbValue $order "comment")
    page = [string](Get-DbValue $order "page")
    lang = [string](Get-DbValue $order "lang")
    note = [string](Get-DbValue $order "note")
    cancel_reason = $(if ($null -ne (Get-DbValue $order "cancelReason")) { [string](Get-DbValue $order "cancelReason") } else { $null })
    stock_held = ConvertTo-DbFlag (Get-DbValue $order "stockHeld")
    stock_short = ConvertTo-DbFlag (Get-DbValue $order "stockShort")
  })
  $position = 0
  foreach ($item in (ConvertTo-ObjectList (Get-DbValue $order "items"))) {
    if ($item -isnot [System.Collections.IDictionary]) { continue }
    $qty = 1
    try { $qty = [int](Get-DbValue $item "qty") } catch {}
    $price = 0.0
    try { $price = [double](Get-DbValue $item "price") } catch {}
    $db.Execute(@'
INSERT INTO order_items (order_id, position, product_id, name, item_type, qty, price, currency, unverified, stock_taken)
VALUES (@order_id, @position, @product_id, @name, @item_type, @qty, @price, @currency, @unverified, @stock_taken)
'@, @{
      stock_taken = $(if ($null -ne (Get-DbValue $item "stockTaken")) { [Math]::Max(0, [int](Get-DbValue $item "stockTaken")) } else { 0 })
      order_id = [string](Get-DbValue $order "id")
      position = $position
      product_id = [string](Get-DbValue $item "productId")
      name = [string](Get-DbValue $item "name")
      item_type = $(if ([string](Get-DbValue $item "itemType") -eq "service") { "service" } else { "product" })
      qty = [Math]::Max(1, $qty)
      price = $price
      currency = $(if ([string](Get-DbValue $item "currency")) { ([string](Get-DbValue $item "currency")).ToLowerInvariant() } else { "kzt" })
      unverified = ConvertTo-DbFlag (Get-DbValue $item "unverified")
    })
    $position++
  }
}

function ConvertFrom-DbItemRow($row) {
  $item = [ordered]@{
    productId = [string]$row["product_id"]
    name = [string]$row["name"]
    itemType = [string]$row["item_type"]
    qty = [int]$row["qty"]
    price = [double]$row["price"]
    currency = [string]$row["currency"]
  }
  if ([long]$row["unverified"]) { $item["unverified"] = $true }
  return $item
}

# Поля и их порядок — те же, что были в orders.json: админка не должна заметить разницы
function ConvertFrom-DbOrderRow($row, $items) {
  $itemArray = [object[]]@()
  if ($null -ne $items) { $itemArray = $items.ToArray() }
  $order = [ordered]@{
    id = [string]$row["id"]
    clientId = [string]$row["client_id"]
    stockHeld = [bool][long]$row["stock_held"]
    number = [int]$row["number"]
    createdAt = [string]$row["created_at"]
    status = [string]$row["status"]
    name = [string]$row["name"]
    phone = [string]$row["phone"]
    channel = [string]$row["channel"]
    source = [string]$row["source"]
    items = $itemArray
    color = [string]$row["color"]
    dueDate = [string]$row["due_date"]
    comment = [string]$row["comment"]
    page = [string]$row["page"]
    lang = [string]$row["lang"]
    note = [string]$row["note"]
  }
  if ($null -ne $row["updated_at"]) { $order["updatedAt"] = [string]$row["updated_at"] }
  if ($null -ne $row["cancel_reason"]) { $order["cancelReason"] = [string]$row["cancel_reason"] }
  if ([long]$row["stock_short"]) { $order["stockShort"] = $true }
  return $order
}

# Список заказов для админки собирает сама SQLite: поля те же, что у ConvertFrom-DbOrderRow,
# необязательные (updatedAt, cancelReason, stockShort, unverified) появляются только когда заданы
$script:OrdersJsonSql = @'
SELECT json_group_array(json(json_patch(
  json_object(
    'id', o.id, 'clientId', COALESCE(o.client_id, ''),
    'stockHeld', CASE WHEN o.stock_held THEN json('true') ELSE json('false') END,
    'number', o.number, 'createdAt', o.created_at, 'status', o.status, 'name', o.name, 'phone', o.phone,
    'channel', o.channel, 'source', o.source,
    'items', json((SELECT json_group_array(json_patch(
        json_object('productId', i.product_id, 'name', i.name, 'itemType', i.item_type, 'qty', i.qty,
          'price', CASE WHEN i.price = CAST(i.price AS INTEGER) THEN CAST(i.price AS INTEGER) ELSE i.price END,
          'currency', i.currency),
        json_object('unverified', CASE WHEN i.unverified THEN json('true') END)
      ) ORDER BY i.position) FROM order_items i WHERE i.order_id = o.id)),
    'color', o.color, 'dueDate', o.due_date, 'comment', o.comment, 'page', o.page, 'lang', o.lang, 'note', o.note
  ),
  json_object('updatedAt', o.updated_at, 'cancelReason', o.cancel_reason, 'stockShort', CASE WHEN o.stock_short THEN json('true') END)
)) ORDER BY o.number DESC)
FROM orders o
'@

function Get-OrdersJson($db) {
  return [string]$db.Scalar($script:OrdersJsonSql, $null)
}

function Get-DbOrder($db, [string]$id) {
  $row = $db.Row("SELECT * FROM orders WHERE id = @id", @{ id = $id })
  if ($null -eq $row) { return $null }
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($itemRow in $db.Query("SELECT * FROM order_items WHERE order_id = @id ORDER BY position", @{ id = $id })) {
    $items.Add((ConvertFrom-DbItemRow $itemRow))
  }
  return (ConvertFrom-DbOrderRow $row $items)
}

# Номер удалённого заказа не выдаётся повторно: последний выданный номер хранится в meta.order_seq
function Get-NextOrderNumber($db) {
  $seq = 0
  [void][long]::TryParse([string](Get-DbMeta $db "order_seq"), [ref]$seq)
  $max = $db.Scalar("SELECT COALESCE(MAX(number), 0) FROM orders", $null)
  return ([Math]::Max($seq, [long]$max) + 1)
}

# --- Клиенты -----------------------------------------------------------------------------------------

# Клиент с этим телефоном уже есть — обновляются канал и время последнего заказа, иначе создаётся новый
function Save-DbClientFromOrder($db, [string]$name, [string]$phone, [string]$channel, [string]$seenAt) {
  if (-not $phone) { return }
  if (-not $seenAt) { $seenAt = (Get-Date).ToString("o") }
  $db.Execute(@'
INSERT INTO clients (id, name, phone, channel, source, note, created_at, last_seen_at)
VALUES (@id, @name, @phone, @channel, 'order', '', @seen, @seen)
ON CONFLICT (phone) DO UPDATE SET
  name = CASE WHEN clients.name = '' THEN excluded.name ELSE clients.name END,
  channel = CASE WHEN excluded.channel = '' THEN clients.channel ELSE excluded.channel END,
  last_seen_at = excluded.last_seen_at
'@, @{ id = (New-DbId "c"); name = $name; phone = $phone; channel = $channel; seen = $seenAt })
}

$script:ClientsJsonSql = @'
SELECT json_group_array(json(json_patch(
  json_object(
    'id', c.id, 'name', c.name, 'phone', c.phone, 'channel', c.channel, 'source', c.source, 'note', c.note,
    'createdAt', c.created_at, 'lastSeenAt', COALESCE(c.last_seen_at, '')
  ),
  json_object(
    'updatedAt', c.updated_at,
    'ordersCount', (SELECT COUNT(*) FROM orders o WHERE o.phone = c.phone),
    'lastOrderAt', (SELECT COALESCE(MAX(o.created_at), '') FROM orders o WHERE o.phone = c.phone)
  )
)) ORDER BY c.created_at DESC, c.rowid DESC)
FROM clients c
'@

function Get-ClientsJson($db) {
  return [string]$db.Scalar($script:ClientsJsonSql, $null)
}

function Find-DbClientByPhone($db, [string]$phone, [string]$exceptId = "") {
  return $db.Row("SELECT id, name FROM clients WHERE phone = @phone AND id <> @except", @{ phone = $phone; except = $exceptId })
}

# --- Обслуживание ------------------------------------------------------------------------------------

# "ok" — файл базы цел
function Test-GulzatDb($db) {
  return [string]$db.Scalar("PRAGMA quick_check", $null)
}

# Изменения сначала пишутся в журнал gulzat.db-wal и только потом переносятся в сам gulzat.db.
# Сервер переносит их, когда простаивает: тогда копия папки data, сделанная во время работы, не теряет последние заказы.
# Ждать чтения из чата не больше 100 мс — сервер не должен из-за этого замирать. $true — журнал перенесён целиком
function Sync-GulzatWal($db) {
  $db.Exec("PRAGMA busy_timeout = 100;")
  try {
    $row = $db.Row("PRAGMA wal_checkpoint(TRUNCATE)", $null)
  } finally {
    $db.Exec("PRAGMA busy_timeout = 10000;")
  }
  return ($null -ne $row -and [long]$row["busy"] -eq 0)
}

# Раз в сутки — полная копия базы в data\backups. VACUUM INTO даёт целостный снимок даже во время работы.
# Копия пишется во временный файл и получает настоящее имя, только если она цела: недописанная копия
# (сбой посреди записи) не будет считаться готовой. Хранятся последние $keep копий
function Backup-GulzatDb($db, [string]$backupDir, [int]$keep = 14) {
  if (-not (Test-Path -LiteralPath $backupDir -PathType Container)) { [void](New-Item -ItemType Directory -Path $backupDir) }
  $target = Join-Path $backupDir ("gulzat-" + (Get-Date -Format "yyyy-MM-dd") + ".db")
  if (Test-Path -LiteralPath $target -PathType Leaf) { return $null }
  $tmp = "$target.tmp"
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
  $db.Execute("VACUUM INTO @target", @{ target = $tmp })
  $copy = New-Object Gulzat.Data.SqliteDb($tmp)
  try { $check = Test-GulzatDb $copy } finally { $copy.Dispose() }
  if ($check -ne "ok") {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    throw "backup copy is damaged: $check"
  }
  Move-Item -LiteralPath $tmp -Destination $target
  Get-ChildItem -LiteralPath $backupDir -Filter "gulzat-*.db" | Sort-Object Name -Descending | Select-Object -Skip $keep | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -ErrorAction SilentlyContinue
  }
  return $target
}

# Фото, на которое больше не ссылается ни один товар, удаляется через $days дней после того, как стало ненужным:
# столько могут жить старые копии каталога в браузерах и неотправленные правки админов. Вызывать внутри транзакции.
# Возвращает, сколько фото удалено
function Remove-UnusedMedia($db, [int]$days = 30) {
  $used = "EXISTS (SELECT 1 FROM products p WHERE p.image = '/media/' || media.name OR instr(p.extra, media.name) > 0)"
  $db.Execute("UPDATE media SET unused_since = NULL WHERE unused_since IS NOT NULL AND $used", $null)
  $db.Execute("UPDATE media SET unused_since = @now WHERE unused_since IS NULL AND NOT $used", @{ now = [DateTime]::UtcNow.ToString("o") })
  $db.Execute("DELETE FROM media WHERE unused_since < @cutoff", @{ cutoff = [DateTime]::UtcNow.AddDays(-$days).ToString("o") })
  return $db.Changes
}
