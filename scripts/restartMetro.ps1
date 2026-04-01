$ErrorActionPreference = "Stop"

Write-Host "Checking processes using port 8081..."

function Stop-ProcessOnPort {
    param([int]$Port)

    $pids = @()

    # Preferred way (Win 8+/Server 2012+)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop
        if ($conns) {
            $pids += $conns | Select-Object -ExpandProperty OwningProcess -Unique
        }
    } catch {
        # ignore and fallback
    }

    # Fallback: netstat (works almost everywhere)
    if (-not $pids -or $pids.Count -eq 0) {
        $lines = netstat -ano | Select-String -Pattern "[:.]$Port\s"
        foreach ($line in $lines) {
            $parts = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
            # netstat format: Proto LocalAddress ForeignAddress State PID
            $maybePid = $parts[-1]
            if ($maybePid -match "^\d+$") { $pids += [int]$maybePid }
        }
        $pids = $pids | Select-Object -Unique
    }

    if (-not $pids -or $pids.Count -eq 0) {
        Write-Host "No process is using port $Port"
        return
    }

    foreach ($procId in $pids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            Write-Host "Stopping process $($proc.ProcessName) (PID=$procId) on port $Port"
            Stop-Process -Id $procId -Force
        } catch {
            Write-Host "Could not stop PID $procId"
        }
    }
}

Stop-ProcessOnPort -Port 8081

Write-Host "Waiting for port to be released..."
Start-Sleep -Seconds 2

# verify port is free before starting metro
try {
    $still = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
    if ($still) {
        Write-Host "Port 8081 still in use. Trying one more pass..."
        Stop-ProcessOnPort -Port 8081
        Start-Sleep -Seconds 2
    }
} catch {}

Write-Host "Restarting Metro bundler..."
npx react-native start --reset-cache
