# Copy my Herdr layouts and mods from the live Herdr folder into this repo.
# Herdr hot-reloads only files under ~/.config/herdr-app, so edit there and
# run this before committing.
#
#   ./sync.ps1            copy Herdr -> repo (default)
#   ./sync.ps1 -Restore   copy repo -> Herdr (e.g. on a new machine)

param([switch]$Restore)

$ErrorActionPreference = "Stop"
$herdr = Join-Path $HOME ".config\herdr-app"
$repo = $PSScriptRoot

# What this repo owns. Add a layout or mod name here to track it.
$layouts = @("my-main")
$mods = @("status-usage")

# Files Herdr rewrites itself; never copied.
$skip = @("gpui-kit.d.ts", "jsconfig.json")

if ($Restore) { $from = $repo; $to = $herdr; $dir = "repo -> Herdr" }
else { $from = $herdr; $to = $repo; $dir = "Herdr -> repo" }
Write-Host "sync: $dir"

foreach ($name in $layouts) {
  $s = Join-Path $from "layouts\$name.json"
  if (-not (Test-Path $s)) { Write-Warning "missing layout: $s"; continue }
  New-Item -ItemType Directory -Force (Join-Path $to "layouts") | Out-Null
  Copy-Item $s (Join-Path $to "layouts\$name.json") -Force
  Write-Host "  layouts/$name.json"
}

foreach ($name in $mods) {
  $s = Join-Path $from "mods\$name"
  if (-not (Test-Path $s)) { Write-Warning "missing mod: $s"; continue }
  $d = Join-Path $to "mods\$name"
  # Into the repo: /MIR mirrors the folder (removes files deleted in Herdr).
  # Into Herdr: /E only copies and overwrites; nothing in Herdr is ever deleted.
  $mode = if ($Restore) { "/E" } else { "/MIR" }
  # /IS /IT: overwrite even files robocopy thinks are the same (same size and time).
  robocopy $s $d $mode /IS /IT /XF $skip /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed for mods/$name ($LASTEXITCODE)" }
  Write-Host "  mods/$name/"
}
$global:LASTEXITCODE = 0
