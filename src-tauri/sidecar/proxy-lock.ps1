$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$payload = [Console]::In.ReadToEnd()
$request = $payload | ConvertFrom-Json
$mutex = [Threading.Mutex]::new($false, $request.mutex)
$locked = $false
try {
  try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'Proxy recovery is busy' }
  $payload | & $request.node $request.worker
  if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
