param([Parameter(Mandatory=$true)][int]$TargetPid,[Parameter(Mandatory=$true)][string]$CorePath)
$ErrorActionPreference='Stop'
$target=Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
if($null -eq $target){exit 0}
if($target.Path -ne $CorePath){throw 'Core process identity changed'}
$source='using System; using System.Runtime.InteropServices; public static class AcvpnConsole { [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole(); [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint pid); [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add); [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GenerateConsoleCtrlEvent(uint ctrl, uint group); }'
Add-Type -TypeDefinition $source
[void][AcvpnConsole]::FreeConsole()
if(-not [AcvpnConsole]::AttachConsole([uint32]$TargetPid)){if($null -eq (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue)){exit 0};throw 'Unable to attach to core console'}
[void][AcvpnConsole]::SetConsoleCtrlHandler([IntPtr]::Zero,$true)
try {if(-not [AcvpnConsole]::GenerateConsoleCtrlEvent(0,0)){throw 'Unable to signal core'}} finally {[void][AcvpnConsole]::FreeConsole()}
try {Wait-Process -Id $TargetPid -Timeout 8 -ErrorAction Stop} catch {if($null -ne (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue)){throw}}
