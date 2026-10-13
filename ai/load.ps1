# Ядро Айгуль. Новая функция — файл ai\skills\имя.ps1 с Register-AiSkill,
# новый формат вложений — файл ai\readers\имя.ps1 с Register-AiFileReader.
# Сервер подхватывает их на следующем сообщении в чате, перезапуск не нужен.
# Файлы .ps1 сохранять в UTF-8 с BOM: без него Windows PowerShell портит кириллицу.
$script:AiRoot = $PSScriptRoot
$script:AiDataDir = Join-Path (Split-Path -Parent $PSScriptRoot) "data"
$script:AiSkills = New-Object System.Collections.Generic.List[object]
$script:AiFileReaders = New-Object System.Collections.Generic.List[object]

. (Join-Path (Split-Path -Parent $PSScriptRoot) "db\db.ps1")
. (Join-Path $PSScriptRoot "core.ps1")
. (Join-Path $PSScriptRoot "files.ps1")
. (Join-Path $PSScriptRoot "prompt.ps1")

foreach ($aiPartFolder in "readers", "skills") {
  $aiPartDir = Join-Path $PSScriptRoot $aiPartFolder
  if (-not (Test-Path -LiteralPath $aiPartDir)) { continue }
  Get-ChildItem -LiteralPath $aiPartDir -Filter "*.ps1" | Sort-Object Name | ForEach-Object {
    $aiPart = $_
    try {
      . $aiPart.FullName
    } catch {
      Write-Host "AI $aiPartFolder skipped $($aiPart.Name): $($_.Exception.Message)"
    }
  }
}
