param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ApplicationArguments)
. (Join-Path $PSScriptRoot 'runtime.ps1')
$Executable = Initialize-SwayRuntime
$env:ELECTRON_RUN_AS_NODE = $null
$QuotedArguments = @('"' + $DesktopRoot + '"')
foreach ($ApplicationArgument in $ApplicationArguments) { $QuotedArguments += '"' + $ApplicationArgument.Replace('"','\"') + '"' }
$ApplicationProcess = Start-Process -FilePath $Executable -ArgumentList $QuotedArguments -WorkingDirectory $DesktopRoot -WindowStyle Hidden -PassThru -Wait
exit $ApplicationProcess.ExitCode
