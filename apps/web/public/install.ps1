# Install the safu-node CLI on Windows (PowerShell).
#
#   irm https://new.sharu.io/install.ps1 | iex
#
# Environment overrides:
#   SAFU_NODE_VERSION      release version without the tag prefix (e.g. 0.1.0).
#                          Defaults to the latest release.
#   SAFU_NODE_INSTALL_DIR  install directory (default: %LOCALAPPDATA%\safu-node\bin).
#   SAFU_NODE_REPO         owner/repo to download from
#                          (default: urbanisierung/sharu-io-monorepo).
$ErrorActionPreference = 'Stop'

$repo = if ($env:SAFU_NODE_REPO) { $env:SAFU_NODE_REPO } else { 'urbanisierung/sharu-io-monorepo' }
$installDir = if ($env:SAFU_NODE_INSTALL_DIR) { $env:SAFU_NODE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'safu-node\bin' }

$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch) {
  'AMD64' { $target = 'x86_64-pc-windows-msvc' }
  default { throw "unsupported Windows architecture: $arch" }
}

$asset = "safu-node-$target.zip"
$base = if ($env:SAFU_NODE_VERSION) {
  "https://github.com/$repo/releases/download/safu-node-v$($env:SAFU_NODE_VERSION)"
} else {
  "https://github.com/$repo/releases/latest/download"
}
$url = "$base/$asset"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("safu-node-" + [System.Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $zip = Join-Path $tmp $asset
  Write-Host "downloading $asset…"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

  # Verify the checksum when the sidecar .sha256 is available.
  try {
    $sumFile = "$zip.sha256"
    Invoke-WebRequest -Uri "$url.sha256" -OutFile $sumFile -UseBasicParsing
    $expected = ((Get-Content $sumFile -Raw).Trim() -split '\s+')[0].ToLower()
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if ($expected -ne $actual) { throw "checksum mismatch (expected $expected, got $actual)" }
    Write-Host "checksum verified"
  } catch {
    Write-Host "note: skipping checksum verification ($_)"
  }

  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Copy-Item -Path (Join-Path $tmp 'safu-node.exe') -Destination (Join-Path $installDir 'safu-node.exe') -Force

  Write-Host "installed safu-node to $installDir\safu-node.exe"
  & (Join-Path $installDir 'safu-node.exe') version

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not ($userPath -split ';' | Where-Object { $_ -eq $installDir })) {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$installDir", 'User')
    Write-Host ""
    Write-Host "added $installDir to your user PATH — restart your terminal to use 'safu-node'."
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
