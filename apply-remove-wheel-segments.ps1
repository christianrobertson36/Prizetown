# Prizetown v156 tiny patch
# Removes the front home page text: "12 wheel segments ready"
# Safe targeted search/replace only.

$ErrorActionPreference = "Stop"

$root = Get-Location
Write-Host "Prizetown patch running in: $root"

$targets = @(
  "web/src/App.jsx",
  "web/src/App.tsx",
  "web/src/App.js",
  "web/src/pages/Home.jsx",
  "web/src/pages/Home.tsx",
  "web/src/components/Home.jsx",
  "web/src/components/Home.tsx"
)

$changed = $false
$found = $false

foreach ($rel in $targets) {
  $path = Join-Path $root $rel
  if (-not (Test-Path $path)) { continue }

  $text = Get-Content $path -Raw
  $original = $text

  if ($text -match "12\s+wheel\s+segments\s+ready") {
    $found = $true
  }

  # Remove common rendered forms while avoiding risky structural changes.
  $text = $text -replace "\s*•\s*12\s+wheel\s+segments\s+ready", ""
  $text = $text -replace "\s*·\s*12\s+wheel\s+segments\s+ready", ""
  $text = $text -replace "\s*\|\s*12\s+wheel\s+segments\s+ready", ""
  $text = $text -replace "12\s+wheel\s+segments\s+ready\s*•\s*", ""
  $text = $text -replace "12\s+wheel\s+segments\s+ready\s*·\s*", ""
  $text = $text -replace "12\s+wheel\s+segments\s+ready\s*\|\s*", ""
  $text = $text -replace "12\s+wheel\s+segments\s+ready", ""

  # Clean accidental empty spans/divs created by the targeted phrase removal.
  $text = $text -replace "<span>\s*</span>", ""
  $text = $text -replace "<strong>\s*</strong>", ""

  if ($text -ne $original) {
    Set-Content -Path $path -Value $text -NoNewline
    Write-Host "Updated $rel"
    $changed = $true
  }
}

if (-not $found) {
  Write-Host "Phrase was not found in the common front-end files. No files changed."
  Write-Host "Run this to locate it manually:"
  Write-Host "Select-String -Path web\src\* -Pattern '12 wheel segments ready' -Recurse"
  exit 1
}

if ($changed) {
  Write-Host "Done. Removed front-page text: 12 wheel segments ready"
}
