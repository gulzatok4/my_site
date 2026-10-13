# Функция ядра: готовый заказ из чата сразу кладётся в корзину сайта.
# Сервер только находит позицию в каталоге; саму корзину в браузере обновляет чат-виджет по полю cart в ответе.

Register-AiSkill -Id "cart" -Prompt @"
Функция add_to_cart кладёт позицию в корзину сайта. Вызывай её, как только заказ готов: клиент выбрал конкретную позицию из каталога, назвал количество (если не назвал — 1) и для изделий цвет, либо прямо сказал «заказываю», «оформляйте», «беру», «добавь в корзину».
Название передавай точно как в lookup_catalog. Если не уверена, какая позиция, сначала вызови lookup_catalog. Для нескольких позиций вызови функцию для каждой. qty — сколько штук этой позиции нужно всего: при изменении количества вызови снова с новым числом, оно заменит старое.
Не вызывай add_to_cart, пока клиент только спрашивает или выбирает, и для того, чего нет в каталоге.
После успешного вызова коротко повтори заказ и скажи, что он уже в корзине: значок «Корзина» вверху сайта → «Оформить заказ», заявка уйдёт Гульзат в WhatsApp, точную стоимость и сроки она подтвердит. Ссылки на WhatsApp и телефон в этом ответе не нужны.
Если функция ответила, что позицию добавить нельзя, не говори, что она в корзине: переведи к Гульзат по обычным правилам.
"@ -ToolName "add_to_cart" -ToolDescription "Положить готовый заказ в корзину сайта: позиция из каталога, количество и пожелания клиента." -ToolParameters @{
  type = "object"
  properties = @{
    product = @{
      type = "string"
      description = "Название позиции точно как в каталоге (из lookup_catalog)."
    }
    qty = @{
      type = "integer"
      description = "Сколько штук этой позиции нужно клиенту всего, от 1 до 99."
    }
    color = @{
      type = "string"
      description = "Цвет и пожелания по изделию, если клиент назвал. Иначе пусто."
    }
    dueDate = @{
      type = "string"
      description = "К какой дате нужно, строго ГГГГ-ММ-ДД, только если клиент назвал конкретную дату. Иначе пусто."
    }
    comment = @{
      type = "string"
      description = "Детали, которые клиент сам назвал, одной строкой: событие, размер, надписи. Без служебных фраз вроде «оформление заказа». Если таких деталей нет — пусто."
    }
  }
  required = @("product", "qty")
} -Handler {
  param($inputArgs)
  Add-AiCartItem $inputArgs
}

function ConvertTo-AiMatchText([string]$text) {
  $value = ([string]$text).ToLowerInvariant().Replace("ё", "е") -replace '[«»"“”„'']', ""
  return ($value -replace "\s+", " ").Trim()
}

function Read-AiCatalogProducts {
  try {
    $catalog = Get-AiCatalog
  } catch {
    return $null
  }
  if (-not $catalog) { return $null }
  $hidden = @{}
  foreach ($code in (ConvertTo-AiList (Get-AiVal $catalog "hiddenCategories"))) {
    $key = ([string]$code).Trim()
    if ($key) { $hidden[$key] = $true }
  }
  $list = New-Object System.Collections.Generic.List[object]
  foreach ($product in (ConvertTo-AiList (Get-AiVal $catalog "products"))) {
    $id = ([string](Get-AiVal $product "id")).Trim()
    $name = ([string](Get-AiVal $product "name")).Trim()
    $code = ([string](Get-AiVal $product "category")).Trim()
    if (-not $id -or -not $name) { continue }
    if ($code -and $hidden.ContainsKey($code)) { continue }
    [void]$list.Add($product)
  }
  return ,$list.ToArray()
}

function Find-AiCartProduct($products, [string]$query) {
  $needle = ConvertTo-AiMatchText $query
  if (-not $needle) { return @() }
  foreach ($stage in "id", "name", "partial") {
    $hits = New-Object System.Collections.Generic.List[object]
    foreach ($product in $products) {
      $id = ConvertTo-AiMatchText (Get-AiVal $product "id")
      $name = ConvertTo-AiMatchText (Get-AiVal $product "name")
      $hit = switch ($stage) {
        "id" { $id -eq $needle }
        "name" { $name -eq $needle }
        default { $name.Contains($needle) -or ($name.Length -ge 4 -and $needle.Contains($name)) }
      }
      if ($hit) { [void]$hits.Add($product) }
    }
    if ($hits.Count -gt 0) { return $hits.ToArray() }
  }
  return @()
}

function Get-AiCartDate([string]$value) {
  $text = ([string]$value).Trim()
  if ($text -notmatch '^\d{4}-\d{2}-\d{2}$') { return "" }
  $date = [datetime]::MinValue
  $ok = [datetime]::TryParseExact($text, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$date)
  if (-not $ok -or $date.Date -lt [datetime]::Today) { return "" }
  return $text
}

function Add-AiCartItem($inputArgs) {
  if (-not $script:AiCartActions) {
    $script:AiCartActions = New-Object System.Collections.Generic.List[object]
  }
  $query = ([string](Get-AiVal $inputArgs "product")).Trim()
  if (-not $query) { return "Не указана позиция. Уточни у клиента, что именно он заказывает." }

  $products = Read-AiCatalogProducts
  if ($null -eq $products) { return "Каталог сейчас недоступен, в корзину добавить нельзя. Переведи клиента к Гульзат." }
  $hits = @(Find-AiCartProduct $products $query)
  if ($hits.Count -eq 0) {
    return "Позиции «$query» нет в каталоге сайта, в корзину её добавить нельзя. Не говори, что она в корзине: предложи оформить заказ через Гульзат."
  }
  if ($hits.Count -gt 1) {
    $names = @($hits | Select-Object -First 6 | ForEach-Object { "• " + ([string](Get-AiVal $_ "name")).Trim() })
    return "Подходит несколько позиций, ничего не добавлено:`n" + ($names -join "`n") + "`nУточни у клиента, какую именно, и вызови add_to_cart с точным названием."
  }

  $product = $hits[0]
  $id = ([string](Get-AiVal $product "id")).Trim()
  $name = ([string](Get-AiVal $product "name")).Trim()
  $isService = ([string](Get-AiVal $product "itemType")) -eq "service"

  $limit = 99
  $stock = Get-AiVal $product "stock"
  $stockNum = 0
  if (-not $isService -and $null -ne $stock -and "$stock" -ne "" -and [int]::TryParse([string]$stock, [ref]$stockNum)) {
    if ($stockNum -le 0) { return "«$name» сейчас нет в наличии, в корзину не добавлено. Предложи клиенту заказать изготовление через Гульзат." }
    $limit = [Math]::Min(99, $stockNum)
  }
  $qty = 1
  [void][int]::TryParse([string](Get-AiVal $inputArgs "qty"), [ref]$qty)
  $qty = [Math]::Max(1, [Math]::Min($limit, $qty))

  $color = ""
  if (-not $isService) { $color = ([string](Get-AiVal $inputArgs "color")).Trim() }
  $rawDate = ([string](Get-AiVal $inputArgs "dueDate")).Trim()
  $dueDate = Get-AiCartDate $rawDate
  $comment = ([string](Get-AiVal $inputArgs "comment")).Trim()
  if ($rawDate -and -not $dueDate) { $comment = (@($comment, "срок: $rawDate") | Where-Object { $_ }) -join "; " }

  for ($i = $script:AiCartActions.Count - 1; $i -ge 0; $i--) {
    if ($script:AiCartActions[$i].id -eq $id) { $script:AiCartActions.RemoveAt($i) }
  }
  [void]$script:AiCartActions.Add(@{
    id = $id
    name = $name
    qty = $qty
    color = $(if ($color.Length -gt 80) { $color.Substring(0, 80) } else { $color })
    dueDate = $dueDate
    comment = $(if ($comment.Length -gt 300) { $comment.Substring(0, 300) } else { $comment })
  })
  $note = $(if ($qty -lt $limit -or $limit -eq 99) { "" } else { " (больше нет в наличии)" })
  return "Готово: «$name» × $qty$note лежит в корзине сайта. Скажи клиенту, что заказ в корзине и его можно оформить кнопкой «Оформить заказ»."
}
