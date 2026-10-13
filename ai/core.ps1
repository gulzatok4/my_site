function New-AiSerializer {
  Add-Type -AssemblyName System.Web.Extensions
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 67108864
  $ser.RecursionLimit = 64
  return $ser
}

function ConvertTo-AiJson($value) {
  return (New-AiSerializer).Serialize($value)
}

function ConvertFrom-AiJson([string]$text) {
  if (-not $text) { return $null }
  return (New-AiSerializer).DeserializeObject($text)
}

# Каталог из базы без фото. Своё подключение только на чтение: сервер в это время может записывать заказ.
# $null — каталога ещё нет; ошибка базы уходит наверх
function Get-AiCatalog {
  $file = Join-Path $script:AiDataDir "gulzat.db"
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $null }
  [void](Initialize-GulzatSqlite)
  $aiDb = Open-GulzatDb $file -ReadOnly
  try {
    return (Get-CatalogDocument $aiDb -NoImages)
  } finally {
    $aiDb.Dispose()
  }
}

function Get-AiVal($obj, [string]$key) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    if (-not $obj.ContainsKey($key)) { return $null }
    return $obj[$key]
  }
  $prop = $obj.PSObject.Properties[$key]
  if ($prop) { return $prop.Value }
  return $null
}

function ConvertTo-AiList($value) {
  $list = New-Object System.Collections.Generic.List[object]
  if ($null -ne $value) {
    $dictionary = $value -is [System.Collections.IDictionary]
    $sequence = (-not $dictionary) -and ($value -is [System.Collections.IEnumerable]) -and ($value -isnot [string])
    if ($sequence) {
      foreach ($item in $value) {
        if ($null -ne $item) { [void]$list.Add($item) }
      }
    } else {
      [void]$list.Add($value)
    }
  }
  return ,$list.ToArray()
}

function Register-AiSkill {
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [string]$Prompt = "",
    [string]$ToolName = "",
    [string]$ToolDescription = "",
    $ToolParameters = $null,
    [scriptblock]$Handler = $null
  )
  if (-not $script:AiSkills) {
    $script:AiSkills = New-Object System.Collections.Generic.List[object]
  }
  for ($i = $script:AiSkills.Count - 1; $i -ge 0; $i--) {
    $sameId = $script:AiSkills[$i].Id -eq $Id
    $sameTool = $ToolName -and $script:AiSkills[$i].ToolName -eq $ToolName
    if ($sameId -or $sameTool) { $script:AiSkills.RemoveAt($i) }
  }
  [void]$script:AiSkills.Add(@{
    Id = $Id
    Prompt = $Prompt
    ToolName = $ToolName
    ToolDescription = $ToolDescription
    ToolParameters = $ToolParameters
    Handler = $Handler
  })
}

function Get-AiSystemPrompt {
  $parts = New-Object System.Collections.Generic.List[string]
  $base = ""
  if (Get-Command Get-AiBasePrompt -ErrorAction SilentlyContinue) {
    $base = ([string](Get-AiBasePrompt)).Trim()
  }
  if ($base) { [void]$parts.Add($base) }
  foreach ($skill in $script:AiSkills) {
    $extra = ([string]$skill.Prompt).Trim()
    if ($extra) { [void]$parts.Add($extra) }
  }
  return ($parts -join "`n`n")
}

function Get-AiModel {
  $model = ([string]$env:OPENAI_MODEL).Trim()
  if (-not $model) { return "gpt-4o-mini" }
  return $model
}

function Get-AiTools {
  $tools = New-Object System.Collections.Generic.List[object]
  foreach ($skill in $script:AiSkills) {
    if (-not $skill.ToolName -or -not $skill.Handler) { continue }
    $schema = $skill.ToolParameters
    if (-not $schema) { $schema = @{ type = "object"; properties = @{} } }
    [void]$tools.Add(@{
      type = "function"
      function = @{
        name = [string]$skill.ToolName
        description = [string]$skill.ToolDescription
        parameters = $schema
      }
    })
  }
  return ,$tools.ToArray()
}

function Invoke-AiTool([string]$name, [string]$argJson) {
  $skill = $null
  foreach ($item in $script:AiSkills) {
    if ($item.ToolName -and $item.ToolName -eq $name) { $skill = $item; break }
  }
  if (-not $skill -or -not $skill.Handler) { return "Функция $name недоступна." }
  $parsed = $null
  if ($argJson -and $argJson.Trim()) {
    try {
      $parsed = ConvertFrom-AiJson $argJson
    } catch {
      return "Не удалось прочитать аргументы."
    }
  }
  try {
    $result = & $skill.Handler $parsed
    if ($null -eq $result -or [string]::IsNullOrWhiteSpace([string]$result)) { return "Нет данных." }
    return [string]$result
  } catch {
    return "Функция $name не выполнилась."
  }
}

function Invoke-OpenAiChat($payload) {
  $apiKey = ([string]$env:OPENAI_API_KEY).Trim()
  if (-not $apiKey) { throw "missing_key" }
  $bodyBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-AiJson $payload))
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $req = [Net.HttpWebRequest]::Create("https://api.openai.com/v1/chat/completions")
  $req.Method = "POST"
  $req.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
  $req.Accept = "application/json"
  $req.ContentType = "application/json; charset=utf-8"
  $req.Headers.Add("Authorization", "Bearer $apiKey")
  $req.ContentLength = $bodyBytes.Length
  $req.Timeout = 180000
  $req.ReadWriteTimeout = 180000
  $out = $req.GetRequestStream()
  try {
    $out.Write($bodyBytes, 0, $bodyBytes.Length)
  } finally {
    $out.Close()
  }
  $resp = $null
  try {
    $resp = $req.GetResponse()
  } catch [System.Net.WebException] {
    $failed = $_.Exception.Response
    $detail = $_.Exception.Message
    if ($failed) {
      try {
        $errReader = New-Object IO.StreamReader($failed.GetResponseStream(), [Text.Encoding]::UTF8)
        try { $detail = $errReader.ReadToEnd() } finally { $errReader.Close() }
        if ($detail.Length -gt 300) { $detail = $detail.Substring(0, 300) }
      } catch {}
      try { $failed.Close() } catch {}
    }
    Write-Host "AI upstream error: $detail"
    throw "upstream"
  }
  try {
    $reader = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
    try { $text = $reader.ReadToEnd() } finally { $reader.Close() }
  } finally {
    if ($resp) { $resp.Close() }
  }
  $parsed = ConvertFrom-AiJson $text
  if (-not $parsed) { throw "empty" }
  return $parsed
}

function Invoke-AiLoop($messages, [string]$model, $tools, [scriptblock]$Complete) {
  $toolList = ConvertTo-AiList $tools
  for ($round = 0; $round -lt 4; $round++) {
    $allowTools = ($round -lt 3) -and ($toolList.Count -gt 0)
    $payload = @{
      model = $model
      temperature = 0.6
      messages = $messages.ToArray()
    }
    if ($allowTools) {
      $payload["tools"] = $toolList
      $payload["tool_choice"] = "auto"
    }
    $resp = $null
    try {
      if ($Complete) { $resp = & $Complete $payload } else { $resp = Invoke-OpenAiChat $payload }
    } catch {
      if (-not $allowTools) { throw }
      $payload.Remove("tools")
      $payload.Remove("tool_choice")
      $allowTools = $false
      Write-Host "AI retry without tools: $($_.Exception.Message)"
      if ($Complete) { $resp = & $Complete $payload } else { $resp = Invoke-OpenAiChat $payload }
    }
    $choiceList = ConvertTo-AiList (Get-AiVal $resp "choices")
    $choice = $null
    if ($choiceList.Count -gt 0) { $choice = $choiceList[0] }
    $assistant = Get-AiVal $choice "message"
    if (-not $assistant) { throw "empty" }

    $calls = ConvertTo-AiList (Get-AiVal $assistant "tool_calls")
    $content = Get-AiVal $assistant "content"
    $text = ""
    if ($content -is [string]) { $text = $content.Trim() }
    if ($calls.Count -eq 0 -or -not $allowTools) {
      if (-not $text) { throw "empty" }
      return $text
    }

    $storedContent = $null
    if ($text) { $storedContent = $text }
    [void]$messages.Add(@{
      role = "assistant"
      content = $storedContent
      tool_calls = $calls
    })

    $index = 0
    foreach ($call in $calls) {
      $id = [string](Get-AiVal $call "id")
      if (-not $id) { $id = "call_${round}_${index}" }
      $fn = Get-AiVal $call "function"
      $name = [string](Get-AiVal $fn "name")
      $argJson = [string](Get-AiVal $fn "arguments")
      if ($argJson.Length -gt 8000) {
        $result = "Аргументы слишком длинные."
      } else {
        $result = Invoke-AiTool $name $argJson
      }
      if ($result.Length -gt 6000) { $result = $result.Substring(0, 6000) }
      [void]$messages.Add(@{
        role = "tool"
        tool_call_id = $id
        content = $result
      })
      $index += 1
    }
  }
  throw "empty"
}

function New-AiConversation([string]$Message, $History, $Attachments) {
  $message = [string]$Message
  if ($message.Length -gt 800) { $message = $message.Substring(0, 800) }

  $limits = $script:AiFileLimits
  $notes = New-Object System.Collections.Generic.List[string]
  $mediaNotes = New-Object System.Collections.Generic.List[string]
  $imageUrls = New-Object System.Collections.Generic.List[string]
  $pdfFiles = New-Object System.Collections.Generic.List[object]
  $digests = New-Object System.Collections.Generic.List[object]
  $budget = $limits.TotalChars

  $attachmentList = ConvertTo-AiList $Attachments
  foreach ($att in ($attachmentList | Select-Object -First 6)) {
    $file = Read-AiAttachment $att
    if ($file.Kind -eq "image" -and $imageUrls.Count -lt $limits.MaxImages) {
      [void]$imageUrls.Add($file.Url)
      [void]$mediaNotes.Add("Клиент приложил фото $($file.Name), но ты его не видишь. Попроси коротко описать, что на нём.")
    } elseif ($file.Kind -eq "pdf" -and $pdfFiles.Count -lt $limits.MaxPdfs) {
      $pdfName = $file.Name
      if ($pdfName -notmatch '\.pdf$') { $pdfName += ".pdf" }
      [void]$pdfFiles.Add(@{ filename = $pdfName; file_data = $file.Url })
      [void]$mediaNotes.Add($file.Note)
    } elseif ($file.Kind -eq "text") {
      $room = [Math]::Min($limits.MaxChars, $budget)
      if ($room -lt 300) {
        [void]$notes.Add("Клиент приложил ещё файл $($file.Name), но он не поместился в сообщение. Попроси прислать его отдельно.")
        continue
      }
      $clip = Limit-AiFileText $file.Text $room
      $budget -= $clip.Length
      [void]$notes.Add((Format-AiFileBlock $file $clip ($clip.Length -lt $file.Text.Length)))
      [void]$digests.Add(@{ name = $file.Name; text = (Limit-AiFileText $clip $limits.DigestChars) })
    } elseif ($file.Note) {
      [void]$notes.Add($file.Note)
    } else {
      [void]$notes.Add("Клиент приложил ещё файл $($file.Name), но за раз можно посмотреть не больше $($limits.MaxImages) фото и $($limits.MaxPdfs) PDF. Попроси прислать остальное следующим сообщением.")
    }
  }
  $hasImages = $imageUrls.Count -gt 0
  $hasPdfs = $pdfFiles.Count -gt 0

  if (-not $message.Trim() -and -not $hasImages -and -not $hasPdfs -and $notes.Count -eq 0) {
    return $null
  }

  $text = $message.Trim()
  if ($notes.Count -gt 0) {
    $joined = [string]::Join("`n`n", $notes.ToArray())
    $text = $(if ($text) { "$text`n`n$joined" } else { $joined })
  }
  if (-not $text) { $text = "Клиент приложил файл для заказа. Посмотри вложение и помоги." }
  $plainText = $text
  if ($mediaNotes.Count -gt 0) {
    $plainText = "$text`n`n" + [string]::Join("`n`n", $mediaNotes.ToArray())
  }

  $messages = New-Object System.Collections.Generic.List[object]
  [void]$messages.Add(@{ role = "system"; content = (Get-AiSystemPrompt) })
  $historyItems = ConvertTo-AiList $History
  $historyStart = 0
  if ($historyItems.Count -gt 12) { $historyStart = $historyItems.Count - 12 }
  for ($hi = $historyStart; $hi -lt $historyItems.Count; $hi++) {
    $item = $historyItems[$hi]
    $role = [string](Get-AiVal $item "role")
    $content = [string](Get-AiVal $item "content")
    if ($role -notin @("user", "assistant")) { continue }
    if (-not $content) { continue }
    if ($content.Length -gt 4000) { $content = $content.Substring(0, 4000) }
    [void]$messages.Add(@{ role = $role; content = $content })
  }

  $langProbe = $message -replace "қалта\w*|құдалық\w*", ""
  if ($langProbe -match "[әғқңөұүһі]") {
    [void]$messages.Add(@{ role = "system"; content = "Клиент пишет по-казахски. Жауапты толығымен қазақ тілінде жаз." })
  } elseif ($langProbe -match "[а-яё]") {
    [void]$messages.Add(@{ role = "system"; content = "Клиент пишет по-русски. Ответь полностью на русском языке." })
  } elseif ($message -match "[a-z]") {
    [void]$messages.Add(@{ role = "system"; content = "The customer writes in English. Reply entirely in English. Do not use any Russian words; Kazakh product names like qalta are fine." })
  }

  if ($hasImages -or $hasPdfs) {
    $parts = New-Object System.Collections.Generic.List[object]
    [void]$parts.Add(@{ type = "text"; text = $text })
    foreach ($url in $imageUrls) {
      [void]$parts.Add(@{ type = "image_url"; image_url = @{ url = $url } })
    }
    foreach ($pdf in $pdfFiles) {
      [void]$parts.Add(@{ type = "file"; file = $pdf })
    }
    [void]$messages.Add(@{ role = "user"; content = $parts.ToArray() })
  } else {
    [void]$messages.Add(@{ role = "user"; content = $text })
  }

  return @{
    Messages = $messages
    Text = $plainText
    HasMedia = ($hasImages -or $hasPdfs)
    Files = $digests.ToArray()
  }
}

function Reset-AiUserMessage($messages, [string]$text) {
  for ($i = $messages.Count - 1; $i -ge 0; $i--) {
    if ([string](Get-AiVal $messages[$i] "role") -ne "user") { continue }
    $messages[$i] = @{ role = "user"; content = $text }
    while ($messages.Count -gt ($i + 1)) { $messages.RemoveAt($messages.Count - 1) }
    return
  }
}

function Invoke-AiTurn {
  param(
    [string]$Message = "",
    $History = $null,
    $Attachments = $null,
    [scriptblock]$Complete = $null
  )
  $built = New-AiConversation -Message $Message -History $History -Attachments $Attachments
  if (-not $built) { throw "bad_request" }
  $model = Get-AiModel
  $tools = Get-AiTools
  $script:AiCartActions = New-Object System.Collections.Generic.List[object]
  try {
    $reply = Invoke-AiLoop $built.Messages $model $tools $Complete
  } catch {
    if (-not $built.HasMedia) { throw }
    Reset-AiUserMessage $built.Messages $built.Text
    $reply = Invoke-AiLoop $built.Messages $model $tools $Complete
  }
  return @{ Reply = $reply; Files = $built.Files; Cart = $script:AiCartActions.ToArray() }
}

function Handle-Chat($ctx) {
  $apiKey = ([string]$env:OPENAI_API_KEY).Trim()
  if (-not $apiKey) {
    Write-Json $ctx 503 @{ error = "missing_key"; reply = $null }
    return
  }
  if ($ctx.Request.ContentLength64 -gt 20971520) {
    Write-Json $ctx 413 @{ error = "too_large"; reply = $null }
    return
  }

  try {
    $data = Get-RequestJson $ctx
  } catch {
    Write-Json $ctx 400 @{ error = "bad_request"; reply = $null }
    return
  }

  try {
    $turn = Invoke-AiTurn -Message ([string](Get-AiVal $data "message")) -History (Get-AiVal $data "history") -Attachments (Get-AiVal $data "attachments")
    $reply = ([string]$turn.Reply).Trim()
    if (-not $reply) { throw "empty" }
    Write-Json $ctx 200 @{ reply = $reply; files = @($turn.Files); cart = @($turn.Cart); error = $null }
  } catch {
    if ($_.Exception.Message -eq "bad_request") {
      Write-Json $ctx 400 @{ error = "bad_request"; reply = $null }
      return
    }
    Write-Json $ctx 502 @{ error = "upstream"; reply = $null }
  }
}
