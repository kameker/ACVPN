param([Parameter(Mandatory=$true)][ValidateSet('read','apply','restore')]$Operation, [string]$RegistryPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings')
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$reg=$RegistryPath
if(-not $reg.StartsWith('HKCU:\')) {throw 'Invalid registry path'}
$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($reg.Substring(6),$true)
if($null -eq $key) {throw 'Registry key not found'}
function readValue([string]$name) {
 if ($key.GetValueNames() -contains $name) { return @{ exists=$true; value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); kind=$key.GetValueKind($name).ToString() } }
 return @{ exists=$false; value=$null; kind=$null }
}
function writeValue([string]$name,$entry) {
 if($entry.exists) { $kind=[Enum]::Parse([Microsoft.Win32.RegistryValueKind],$entry.kind);$key.SetValue($name,$entry.value,$kind) }
 elseif($key.GetValueNames() -contains $name) { $key.DeleteValue($name,$false) }
}
function notifyWindows {
 Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ACVPNWinInet { [DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr h, int option, IntPtr buffer, int length); }'
 if(-not [ACVPNWinInet]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0)) { throw 'Could not notify Windows of proxy change' }
 if(-not [ACVPNWinInet]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)) { throw 'Could not refresh Windows proxy settings' }
}
if($Operation -eq 'read') {
 $pac=readValue 'AutoConfigURL';$server=readValue 'ProxyServer';$enabled=readValue 'ProxyEnable'
 if(($server.exists -and $server.kind -notin @('String','ExpandString')) -or ($enabled.exists -and $enabled.kind -ne 'DWord')) { throw 'Unsupported proxy configuration' }
 @{server=$server;enabled=$enabled;hasPac=($pac.exists -and -not [string]::IsNullOrWhiteSpace([string]$pac.value))}|ConvertTo-Json -Depth 5 -Compress
} elseif($Operation -eq 'apply') {
 $prior=([Console]::In.ReadToEnd() | ConvertFrom-Json)
 $pac=readValue 'AutoConfigURL';if($pac.exists -and -not [string]::IsNullOrWhiteSpace([string]$pac.value)){throw 'Proxy auto-configuration is enabled'}
 $currentServer=readValue 'ProxyServer';$currentEnabled=readValue 'ProxyEnable'
 if($currentServer.exists -ne $prior.server.exists -or $currentServer.kind -cne $prior.server.kind -or $currentServer.value -cne $prior.server.value -or $currentEnabled.exists -ne $prior.enabled.exists -or $currentEnabled.kind -cne $prior.enabled.kind -or $currentEnabled.value -ne $prior.enabled.value) {throw 'Proxy settings changed during activation'}
 $key.SetValue('ProxyServer','127.0.0.1:2080',[Microsoft.Win32.RegistryValueKind]::String)
 $key.SetValue('ProxyEnable',1,[Microsoft.Win32.RegistryValueKind]::DWord)
 notifyWindows
 '{"ok":true}'
} else {
 $inputJson=[Console]::In.ReadToEnd();$prior=$inputJson|ConvertFrom-Json
 $currentServer=readValue 'ProxyServer';$currentEnabled=readValue 'ProxyEnable'
 # Do not overwrite changes made by another application or the user.
 $canRestore=($currentServer.exists -and $currentServer.value -eq '127.0.0.1:2080' -and (($currentEnabled.exists -and [int]$currentEnabled.value -eq 1) -or ($currentEnabled.exists -eq $prior.enabled.exists -and $currentEnabled.value -eq $prior.enabled.value)))
 if($canRestore) {writeValue 'ProxyEnable' $prior.enabled;writeValue 'ProxyServer' $prior.server;notifyWindows}
 @{restored=$canRestore}|ConvertTo-Json -Compress
}
