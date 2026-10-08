[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9-]{1,62}$')][string]$BucketName = 'veylo',
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$catalogue = Get-Content -LiteralPath (Join-Path $projectRoot 'server/src/constants/pixabaySoundtracks.json') -Raw | ConvertFrom-Json
$musicRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'server/private/music/pixabay'))
$prepared = @()
foreach ($track in $catalogue) {
  if ($track.sha256 -notmatch '^[a-f0-9]{64}$' -or $track.filename -notmatch '^[a-zA-Z0-9._-]+\.mp3$') {
    throw 'The soundtrack catalogue contains an invalid filename or checksum.'
  }
  $filePath = [System.IO.Path]::GetFullPath((Join-Path $musicRoot $track.filename))
  if (-not $filePath.StartsWith($musicRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'A soundtrack path is outside the music folder.'
  }
  $file = Get-Item -LiteralPath $filePath
  if ($file.Length -ne $track.bytes -or (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $track.sha256) {
    throw ('Soundtrack validation failed for ' + $track.filename)
  }
  $prepared += @{ FilePath = $filePath; ObjectName = ($BucketName + '/veylo/catalog/music/' + $track.sha256 + '.mp3') }
}
if (-not $Apply) {
  Write-Output ($prepared.Count.ToString() + ' soundtracks checked. Add -Apply to upload them to your existing R2 bucket.')
  return
}
foreach ($item in $prepared) {
  & npx.cmd wrangler r2 object put $item.ObjectName --file $item.FilePath --content-type audio/mpeg --remote
  if ($LASTEXITCODE -ne 0) { throw 'Cloudflare could not upload a soundtrack. Run this command again to retry.' }
}
Write-Output 'Soundtracks uploaded. Their audio can now be played directly from Cloudflare.'
