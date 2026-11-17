param([string]$Out = 'E:\VBcoding\bijiapp\ops\观测\windows\_shot.png')
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;
public class W {
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
 [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Rt,B; } }
"@
$p = Get-Process FlowUs -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output 'no-flowus-window'; exit 1 }
$h = $p.MainWindowHandle
if ([W]::IsIconic($h)) { [void][W]::ShowWindow($h, 9); Start-Sleep -Milliseconds 800 }
[void][W]::SetForegroundWindow($h); Start-Sleep -Milliseconds 700
$r = New-Object W+R
[void][W]::GetWindowRect($h, [ref]$r)
$w = $r.Rt - $r.L; $hh = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap($w, $hh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [W]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[System.IO.File]::WriteAllBytes($Out, $ms.ToArray())
$g.Dispose(); $bmp.Dispose(); $ms.Dispose()
Write-Output ("saved=" + $Out + " printwindow=" + $ok + " size=" + $w + "x" + $hh)