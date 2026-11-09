param([Parameter(Mandatory=$true)][string]$CorePath)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$psi=New-Object Diagnostics.ProcessStartInfo
$psi.FileName=$CorePath
$psi.Arguments='run -c stdin'
$psi.UseShellExecute=$false
$psi.CreateNoWindow=$false
$psi.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$psi.RedirectStandardInput=$true
$psi.RedirectStandardOutput=$true
$psi.RedirectStandardError=$true
$p=[Diagnostics.Process]::Start($psi)
[Console]::Out.WriteLine('PID '+$p.Id)
[Console]::Out.Flush()
$stdout=$p.StandardOutput.ReadToEndAsync()
$stderr=$p.StandardError.ReadToEndAsync()
$config=[Console]::In.ReadToEnd()
$p.StandardInput.Write($config)
$p.StandardInput.Close()
$p.WaitForExit()
[Console]::Error.Write($stderr.Result)
exit $p.ExitCode
