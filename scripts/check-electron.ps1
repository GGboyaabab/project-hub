Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Select-Object ProcessId, CommandLine |
  Format-Table -AutoSize | Out-String -Width 300
