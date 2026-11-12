param([string]$Node, [string]$Script, [string]$Profile)
$ErrorActionPreference = 'Stop'
& $Node $Script $Profile
exit $LASTEXITCODE
