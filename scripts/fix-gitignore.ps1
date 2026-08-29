$f = 'C:\Users\fangb\Documents\zcode\crt\.gitignore'
$lines = [IO.File]::ReadAllLines($f) | Where-Object { $_ -notmatch '"' -and $_.Trim() -ne '' } | Select-Object -Unique
$out = @($lines) + @('*.WebView2/', 'sse.txt')
[IO.File]::WriteAllLines($f, $out, [Text.UTF8Encoding]::new($false))
Get-Content $f
