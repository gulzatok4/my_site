# Функция ядра: живой каталог.
# Ещё одну функцию добавляют таким же файлом в этой папке:
#   Register-AiSkill -Id "orders" -Prompt "Когда клиент готов, собери заявку." `
#     -ToolName "draft_order" -ToolDescription "Собрать черновик заявки." `
#     -ToolParameters @{ type = "object"; properties = @{ note = @{ type = "string" } }; required = @("note") } `
#     -Handler { param($inputArgs) "Черновик: $((Get-AiVal $inputArgs 'note'))" }

Register-AiSkill -Id "catalog" -Prompt @"
Функция lookup_catalog читает живой каталог сайта. Вызывай её, когда клиент спрашивает, что есть, сравнивает изделия или называет конкретный товар или услугу. Отвечай по результату функции и не добавляй позиций, которых в нём нет.
Позиция с пометкой «ИИ-ролик» — это видео, даже если в названии пуф, корзина или другое изделие. Не описывай такой ролик как готовый товар и не спрашивай у него цвет и размер изделия. Ссылку из описания можно дать.
"@ -ToolName "lookup_catalog" -ToolDescription "Найти товары и услуги в каталоге сайта. Возвращает только реальные позиции: название, тип, цену и короткое описание." -ToolParameters @{
  type = "object"
  properties = @{
    query = @{
      type = "string"
      description = "Что ищет клиент: название, категория или слова из сообщения. Пустой запрос — краткий обзор каталога."
    }
  }
  required = @("query")
} -Handler {
  param($inputArgs)
  Search-AiCatalog ([string](Get-AiVal $inputArgs "query"))
}

function Get-AiCategoryLabels($catalog) {
  $labels = @{
    baskets = "Национальные корзины"
    wedding = "Свадебные наборы"
    poufs = "Пуфы"
    chests = "Сундуки"
    jewelry = "Украшения"
    "it-systems" = "IT-системы и CRM"
    sites = "Сайты"
    bots = "Боты"
    "ai-video" = "ИИ-ролики"
  }
  foreach ($item in (ConvertTo-AiList (Get-AiVal $catalog "categories"))) {
    $code = ([string](Get-AiVal $item "code")).Trim()
    $label = ([string](Get-AiVal $item "label")).Trim()
    if ($code -and $label) { $labels[$code] = $label }
  }
  return $labels
}

function Format-AiPrice($price, [string]$currency) {
  $n = 0.0
  $styles = [Globalization.NumberStyles]::Any
  $ok = [double]::TryParse([string]$price, $styles, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)
  if (-not $ok -or $n -le 0) { return "цену подтвердит Гульзат" }
  $rounded = [int64][math]::Round($n)
  $text = $rounded.ToString("N0", [Globalization.CultureInfo]::GetCultureInfo("ru-RU"))
  $symbol = switch ($currency) {
    "rub" { "₽" }
    "usd" { "$" }
    default { "₸" }
  }
  return "$text $symbol"
}

function Format-AiCatalogLine($product, $labels) {
  $name = ([string](Get-AiVal $product "name")).Trim()
  if (-not $name) { return $null }
  $itemType = [string](Get-AiVal $product "itemType")
  $code = ([string](Get-AiVal $product "category")).Trim()
  $kind = $(if ($itemType -eq "service" -and $code -eq "ai-video") { "ИИ-ролик" } elseif ($itemType -eq "service") { "услуга" } else { "товар" })
  $category = ""
  if ($code -and $labels.ContainsKey($code)) { $category = [string]$labels[$code] }
  elseif ($code) { $category = $code }
  $price = Format-AiPrice (Get-AiVal $product "price") ([string](Get-AiVal $product "currency"))
  $desc = ([string](Get-AiVal $product "description")).Trim() -replace "\s+", " "
  if ($desc.Length -gt 180) { $desc = $desc.Substring(0, 180).Trim() + "…" }
  if (-not $desc -and $code -eq "ai-video") { $desc = "Это видеоролик, не готовое изделие." }
  $stockNote = ""
  $stock = Get-AiVal $product "stock"
  $stockNum = 0
  if ($null -ne $stock -and "$stock" -ne "" -and [int]::TryParse([string]$stock, [ref]$stockNum) -and $stockNum -le 0) {
    $stockNote = ", сейчас нет в наличии"
  }
  $line = "• $name ($kind"
  if ($category) { $line += ", $category" }
  $line += ") — $price$stockNote"
  if ($desc) { $line += ". $desc" }
  return $line
}

function Get-AiCategorySynonyms([string]$code) {
  switch ($code) {
    "baskets" { return "қалта калта корзина корзины короб" }
    "poufs" { return "пуф пуфы пуфик сиденье" }
    "wedding" { return "свадебный набор той құдалық" }
    "chests" { return "сундук" }
    "jewelry" { return "украшение бижутерия" }
    "it-systems" { return "crm айти система" }
    "sites" { return "сайт лендинг" }
    "bots" { return "бот" }
    "ai-video" { return "ролик видео нейросеть" }
    default { return "" }
  }
}

function Search-AiCatalog([string]$query) {
  try {
    $catalog = Get-AiCatalog
  } catch {
    return "Каталог сейчас недоступен. Не называй конкретные позиции."
  }
  if (-not $catalog) { return "Каталог сейчас недоступен. Не называй конкретные позиции." }
  $labels = Get-AiCategoryLabels $catalog
  $hidden = @{}
  foreach ($code in (ConvertTo-AiList (Get-AiVal $catalog "hiddenCategories"))) {
    $key = ([string]$code).Trim()
    if ($key) { $hidden[$key] = $true }
  }

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($product in (ConvertTo-AiList (Get-AiVal $catalog "products"))) {
    $code = ([string](Get-AiVal $product "category")).Trim()
    if ($code -and $hidden.ContainsKey($code)) { continue }
    $line = Format-AiCatalogLine $product $labels
    if (-not $line) { continue }
    $itemType = [string](Get-AiVal $product "itemType")
    $kindWords = $(if ($itemType -eq "service") { "услуга услуги сервис" } else { "товар товары изделие изделия" })
    $category = ""
    if ($code -and $labels.ContainsKey($code)) { $category = [string]$labels[$code] }
    $hay = ([string](Get-AiVal $product "name")) + " " + ([string](Get-AiVal $product "description")) + " " + $code + " " + $category + " " + $kindWords + " " + (Get-AiCategorySynonyms $code)
    [void]$rows.Add(@{ line = $line; hay = $hay.ToLowerInvariant().Replace("ё", "е") })
  }
  if ($rows.Count -eq 0) { return "Каталог сейчас пуст. Не называй конкретные позиции." }

  $norm = ([string]$query).ToLowerInvariant().Replace("ё", "е")
  if ($norm.Length -gt 200) { $norm = $norm.Substring(0, 200) }
  $tokens = @([regex]::Split($norm, "[^\p{L}\p{Nd}]+") | Where-Object { $_.Length -ge 2 } | Select-Object -First 8)

  $ranked = New-Object System.Collections.Generic.List[object]
  $rowIndex = 0
  if ($tokens.Count -eq 0) {
    foreach ($row in $rows) {
      [void]$ranked.Add(@{ line = $row.line; score = 1; index = $rowIndex })
      $rowIndex += 1
    }
  } else {
    foreach ($row in $rows) {
      $score = 0
      foreach ($token in $tokens) {
        $hit = $row.hay.Contains($token)
        if (-not $hit -and $token.Length -ge 5) {
          $hit = $row.hay.Contains($token.Substring(0, $token.Length - 1))
        }
        if ($hit) { $score += 1 }
      }
      if ($score -gt 0) {
        [void]$ranked.Add(@{ line = $row.line; score = $score; index = $rowIndex })
      }
      $rowIndex += 1
    }
  }

  $sorted = New-Object System.Collections.Generic.List[object]
  foreach ($item in ($ranked | Sort-Object @{ Expression = { -$_.score } }, @{ Expression = { $_.index } })) {
    [void]$sorted.Add($item)
    if ($sorted.Count -ge 8) { break }
  }
  if ($sorted.Count -eq 0) {
    $preview = New-Object System.Collections.Generic.List[string]
    foreach ($row in $rows) {
      [void]$preview.Add([string]$row.line)
      if ($preview.Count -ge 8) { break }
    }
    $more = $rows.Count - $preview.Count
    $text = "Точного совпадения в каталоге нет.`nЧто есть на сайте:`n" + [string]::Join("`n", $preview.ToArray())
    if ($more -gt 0) { $text += "`nи ещё $more поз." }
    return $text
  }
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($item in $sorted) { [void]$lines.Add([string]$item.line) }
  $total = $(if ($tokens.Count -eq 0) { $rows.Count } else { $ranked.Count })
  $text = "По каталогу сайта:`n" + [string]::Join("`n", $lines.ToArray())
  if ($total -gt $lines.Count) { $text += "`nи ещё $($total - $lines.Count) поз. Уточни запрос, если нужно конкретнее." }
  return $text
}
