<#
.SYNOPSIS
    Map the isolated backend onto the phone's loopback, and prove it.

.DESCRIPTION
    `adb reverse tcp:P tcp:P` makes 127.0.0.1:P ON THE PHONE reach 127.0.0.1:P
    on this workstation over USB. That is why the app only accepts a loopback
    host: a non-loopback address would mean some other machine, which nobody has
    verified as isolated.

    Ports come from lib/core/qa/qa_isolation.dart (kQaEmulatorTargets) and must
    stay in step with it; the parameter default below is the same list.

    The script then checks each port FROM THE PHONE, because a port that is open
    on this workstation says nothing about whether the tunnel exists.
#>
[CmdletBinding()]
param(
    [hashtable] $Ports = @{ auth = 9099; firestore = 8080; functions = 5001; storage = 9199 },
    [string] $Serial
)

$ErrorActionPreference = 'Stop'
$adbArgs = if ($Serial) { @('-s', $Serial) } else { @() }

$devices = & adb @adbArgs devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
if (-not $devices) { throw 'No authorised device. Connect the phone and accept the USB debugging prompt.' }
Write-Host ("Device(s): " + ($devices -join '; ')) -ForegroundColor Cyan

foreach ($name in $Ports.Keys) {
    $port = $Ports[$name]
    & adb @adbArgs reverse "tcp:$port" "tcp:$port" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "adb reverse failed for $name ($port)" }
}

Write-Host '--- adb reverse --list ---' -ForegroundColor Cyan
& adb @adbArgs reverse --list

# Verify FROM THE DEVICE. A refused connection here means the app will block,
# which is the correct outcome - but it is better to find out now.
$failed = @()
foreach ($name in $Ports.Keys) {
    $port = $Ports[$name]
    $out = & adb @adbArgs shell "curl -s -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:$port/ 2>/dev/null; echo ''"
    $code = ($out -join '').Trim()
    if ($code -match '^[1-5][0-9][0-9]$') {
        Write-Host ("  {0,-10} 127.0.0.1:{1}  HTTP {2}  REACHABLE" -f $name, $port, $code) -ForegroundColor Green
    } else {
        Write-Host ("  {0,-10} 127.0.0.1:{1}  NO REPLY ({2})" -f $name, $port, $code) -ForegroundColor Red
        $failed += "$name($port)"
    }
}

if ($failed.Count -gt 0) {
    throw ("Not reachable from the device: " + ($failed -join ', ') + ". The QA build will refuse to start, by design.")
}
Write-Host 'All isolated services answer from the device.' -ForegroundColor Green
