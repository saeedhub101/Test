param([int]$Seconds=10,[int]$WarmupSeconds=15)
$ErrorActionPreference="Stop"
function Get-SaeedProcesses {
  $root=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match '^Saeed( AI)?$|^SaeedAI$'})
  $all=@{};$queue=New-Object System.Collections.Generic.Queue[object]
  foreach($p in $root){$all[$p.Id]=$p;$queue.Enqueue($p.Id)}
  while($queue.Count -gt 0){
    $processId=$queue.Dequeue()
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" -ErrorAction SilentlyContinue | ForEach-Object {
      $child=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if($child -and -not $all.ContainsKey($child.Id)){$all[$child.Id]=$child;$queue.Enqueue($child.Id)}
    }
  }
  return @($all.Values)
}
function Snapshot {
  $ps=Get-SaeedProcesses
  if($ps.Count -eq 0){throw "No Saeed process found while collecting resource metrics"}
  $cpu=0;$ram=0;$details=@()
  foreach($p in $ps){$c=0;$m=0;$cmd="";try{$c=$p.TotalProcessorTime.TotalSeconds}catch{};try{$m=$p.WorkingSet64}catch{};try{$cmd=(Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue).CommandLine}catch{};$cpu+=$c;$ram+=$m;$details+=([pscustomobject]@{pid=$p.Id;name=$p.ProcessName;ram_mb=[math]::Round($m/1MB,1);cpu_seconds=[math]::Round($c,3);command_line=$cmd})}
  [pscustomobject]@{timestamp=(Get-Date).ToString("o");processes=$ps.Count;ram_mb=[math]::Round($ram/1MB,1);cpu_seconds=[math]::Round($cpu,3);pids=@($ps|ForEach-Object{$_.Id});per_process=$details}
}
$exePath=$env:SAEED_EXE_PATH
if(-not $exePath -or -not (Test-Path $exePath)){throw "SAEED_EXE_PATH is required"}
$proc=Start-Process -FilePath $exePath -PassThru
try{
  Start-Sleep -Seconds $WarmupSeconds
  $before=Snapshot
  Start-Sleep -Seconds $Seconds
  $after=Snapshot
  $logical=[math]::Max(1,(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors)
  $cpuPct=[math]::Round((($after.cpu_seconds-$before.cpu_seconds)/$Seconds/$logical)*100,2)
  $gpu=0;$gpuAvailable=$false
  try {
    $counters=Get-Counter '\GPU Engine(*)\Utilization Percentage' -MaxSamples 1 -SampleInterval 1 -ErrorAction Stop
    foreach($sample in $counters.CounterSamples){if($sample.InstanceName -match 'pid_(\d+)_'){if($after.pids -contains [int]$Matches[1]){$gpu += [double]$sample.CookedValue}}}
    $gpuAvailable=$true;$gpu=[math]::Round($gpu,2)
  } catch { $gpuAvailable=$false;$gpu=0 }
  $result=[pscustomobject]@{warmup_seconds=$WarmupSeconds;sample_seconds=$Seconds;cpu_percent_total=$cpuPct;ram_mb=$after.ram_mb;gpu_percent_total=$gpu;gpu_counter_available=$gpuAvailable;process_count=$after.processes;timestamp=$after.timestamp;per_process=$after.per_process}
  $result | ConvertTo-Json -Depth 4 | Tee-Object -FilePath "saeed-resource-metrics.json"
  if($cpuPct -gt 40){Write-Warning "Saeed idle CPU usage is above the advisory 40% target: $cpuPct%. Recorded for performance follow-up; not a release blocker."}
  if($after.ram_mb -gt 1000){throw "Saeed RAM usage exceeded 1000 MB after warmup: $($after.ram_mb) MB"}
}finally{
  try{$proc.CloseMainWindow()|Out-Null}catch{}
  Start-Sleep -Seconds 2
  try{if(-not $proc.HasExited){$proc.Kill()}}catch{}
}
