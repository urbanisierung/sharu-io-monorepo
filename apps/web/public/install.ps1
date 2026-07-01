# Install the sharu CLI on Windows (PowerShell).
#
#   irm https://new.sharu.io/install.ps1 | iex
#
# Environment overrides:
#   SHARU_VERSION      release version without the tag prefix (e.g. 0.1.0).
#                          Defaults to the latest release.
#   SHARU_INSTALL_DIR  install directory (default: %LOCALAPPDATA%\sharu\bin).
#   SHARU_REPO         owner/repo to download from
#                          (default: urbanisierung/sharu-io-monorepo).
#   SHARU_TOKEN        GitHub token with read access, for installing from a
#                          private repo (also honours GH_TOKEN / GITHUB_TOKEN).
$ErrorActionPreference = 'Stop'

$repo = if ($env:SHARU_REPO) { $env:SHARU_REPO } else { 'urbanisierung/sharu-io-monorepo' }
$installDir = if ($env:SHARU_INSTALL_DIR) { $env:SHARU_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'sharu\bin' }
$token = if ($env:SHARU_TOKEN) { $env:SHARU_TOKEN } elseif ($env:GH_TOKEN) { $env:GH_TOKEN } elseif ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { $null }

$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch) {
  'AMD64' { $target = 'x86_64-pc-windows-msvc' }
  default { throw "unsupported Windows architecture: $arch" }
}

$asset = "sharu-$target.zip"
$releaseApi = if ($env:SHARU_VERSION) {
  "https://api.github.com/repos/$repo/releases/tags/sharu-v$($env:SHARU_VERSION)"
} else {
  "https://api.github.com/repos/$repo/releases/latest"
}
$publicBase = if ($env:SHARU_VERSION) {
  "https://github.com/$repo/releases/download/sharu-v$($env:SHARU_VERSION)"
} else {
  "https://github.com/$repo/releases/latest/download"
}

# Resolve a release asset's authenticated API URL by name. Private repos 404 the
# public releases/download path for anonymous requests, so a token install must
# go through the API assets endpoint instead.
function Get-AssetUrl([string]$name) {
  $headers = @{ 'Accept' = 'application/vnd.github+json' }
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $release = Invoke-RestMethod -Uri $releaseApi -Headers $headers -UseBasicParsing
  ($release.assets | Where-Object { $_.name -eq $name } | Select-Object -First 1).url
}

# Download a release asset by name. With a token, fetch through the API assets
# endpoint (works for private repos); otherwise use the public URL.
function Save-Asset([string]$name, [string]$outFile) {
  if ($token) {
    $apiUrl = Get-AssetUrl $name
    if (-not $apiUrl) { throw "asset $name not found in release" }
    $headers = @{ 'Accept' = 'application/octet-stream'; 'Authorization' = "Bearer $token" }
    Invoke-WebRequest -Uri $apiUrl -Headers $headers -OutFile $outFile -UseBasicParsing
  } else {
    Invoke-WebRequest -Uri "$publicBase/$name" -OutFile $outFile -UseBasicParsing
  }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("sharu-" + [System.Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $zip = Join-Path $tmp $asset
  Write-Host "downloading $asset…"
  try {
    Save-Asset $asset $zip
  } catch {
    if (-not $token) {
      throw "could not download $asset. If $repo is private, set a token with read access and re-run, e.g.:`n  `$env:SHARU_TOKEN = (gh auth token); irm https://new.sharu.io/install.ps1 | iex"
    }
    throw "could not download $asset from $repo - is the token valid and does it grant read access? ($_)"
  }

  # Verify the checksum when the sidecar .sha256 is available.
  try {
    $sumFile = "$zip.sha256"
    Save-Asset "$asset.sha256" $sumFile
    $expected = ((Get-Content $sumFile -Raw).Trim() -split '\s+')[0].ToLower()
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if ($expected -ne $actual) { throw "checksum mismatch (expected $expected, got $actual)" }
    Write-Host "checksum verified"
  } catch {
    Write-Host "note: skipping checksum verification ($_)"
  }

  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $exe = Join-Path $tmp 'sharu.exe'
  if (-not (Test-Path $exe)) { throw "the archive did not contain sharu.exe" }
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Copy-Item -Path $exe -Destination (Join-Path $installDir 'sharu.exe') -Force

  Write-Host "installed sharu to $installDir\sharu.exe"
  & (Join-Path $installDir 'sharu.exe') version

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not ($userPath -split ';' | Where-Object { $_ -eq $installDir })) {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$installDir", 'User')
    Write-Host ""
    Write-Host "added $installDir to your user PATH — restart your terminal to use 'sharu'."
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
